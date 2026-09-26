import { createHmac } from 'crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';

/**
 * Outbound Webhook Dispatcher
 * Fires signed POST requests to all subscribed URLs when lead events occur.
 *
 * Supported events:
 *   lead.created | lead.replied | lead.engaged | lead.status_changed |
 *   lead.scored  | campaign.completed
 *
 * Payload format:
 *   { event, timestamp, data: { ...event-specific fields } }
 *
 * Signature: X-Webhook-Signature header = HMAC-SHA256(secret, JSON.stringify(payload))
 * Retry: up to 2 retries on network failure (not on 4xx).
 */
class WebhookDispatcher {
  constructor() {
    this._queue = [];
    this._processing = false;
  }

  /**
   * Dispatch an event to all matching subscriptions.
   * Non-blocking — errors are caught and logged, never thrown.
   */
  async dispatch(event, data = {}) {
    try {
      const subs = await prisma.webhookSubscription.findMany({
        where: { enabled: true },
      });

      const matching = subs.filter(s => {
        const events = JSON.parse(s.events || '[]');
        return events.length === 0 || events.includes(event) || events.includes('*');
      });

      if (matching.length === 0) return;

      const payload = { event, timestamp: new Date().toISOString(), data };
      const body = JSON.stringify(payload);

      await Promise.all(matching.map(sub => this._deliver(sub, body, event)));
    } catch (err) {
      logger.warn(`WebhookDispatcher.dispatch failed: ${err.message}`);
    }
  }

  async _deliver(sub, body, event, attempt = 1) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OutboundOS-Webhook/1.0',
      'X-Webhook-Event': event,
      'X-Webhook-Delivery': `${sub.id}-${Date.now()}`,
    };

    if (sub.secret) {
      headers['X-Webhook-Signature'] = `sha256=${createHmac('sha256', sub.secret).update(body).digest('hex')}`;
    }

    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        await prisma.webhookSubscription.update({
          where: { id: sub.id },
          data: { lastTriggeredAt: new Date(), failCount: 0 },
        });
        logger.info(`📤 Webhook delivered: ${event} → ${sub.url} [${res.status}]`);
      } else if (res.status >= 500 && attempt < 3) {
        // Retry on 5xx
        await new Promise(r => setTimeout(r, attempt * 2000));
        return this._deliver(sub, body, event, attempt + 1);
      } else {
        logger.warn(`📤 Webhook ${event} → ${sub.url} responded ${res.status}`);
        await prisma.webhookSubscription.update({
          where: { id: sub.id },
          data: { failCount: { increment: 1 } },
        });
      }
    } catch (err) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        return this._deliver(sub, body, event, attempt + 1);
      }
      logger.warn(`📤 Webhook delivery failed: ${event} → ${sub.url}: ${err.message}`);
      await prisma.webhookSubscription.update({
        where: { id: sub.id },
        data: { failCount: { increment: 1 } },
      }).catch(() => {});
    }
  }
}

export default new WebhookDispatcher();
