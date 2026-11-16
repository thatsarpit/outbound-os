import { createHmac } from 'crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { OutboundWebhookTargetError, postOutboundWebhook } from '../utils/outboundWebhookTarget.js';

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
  async test(sub) {
    const event = 'webhook.test';
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test event from Outbound OS', subscriptionId: sub.id },
    });
    return this._deliver(sub, body, event, 1, 1);
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

  async _deliver(sub, body, event, attempt = 1, maxAttempts = 3) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OutboundOS-Webhook/1.0',
      'X-Webhook-Event': event,
      'X-Webhook-Delivery': `${sub.id}-${Date.now()}`,
    };

    if (sub.secret) {
      headers['X-Webhook-Signature'] = `sha256=${createHmac('sha256', sub.secret).update(body).digest('hex')}`;
    }

    let status, blocked;
    try {
      status = await postOutboundWebhook(sub.url, headers, body);
    } catch (error) {
      if (error instanceof OutboundWebhookTargetError) blocked = error.message;
    }
    if (!blocked && (status == null || status >= 500) && attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      return this._deliver(sub, body, event, attempt + 1, maxAttempts);
    }
    const ok = status >= 200 && status < 300;
    // Keep recipient URLs out of logs because query strings can contain credentials.
    if (ok) logger.info(`Webhook ${sub.id} delivered ${event} (HTTP ${status}).`);
    else logger.warn(`Webhook ${sub.id} failed to deliver ${event} (${status ?? 'blocked or unreachable'}).`);
    await prisma.webhookSubscription.update({
      where: { id: sub.id },
      data: ok ? { lastTriggeredAt: new Date(), failCount: 0 } : { failCount: { increment: 1 } },
    }).catch(() => {});
    if (ok) return { ok, status };
    const error = blocked || (status == null ? 'Could not reach the webhook destination.' : `The webhook destination returned HTTP ${status}.`);
    return { ok, status, error };
  }
}

export default new WebhookDispatcher();
