import prisma from '../utils/prismaClient.js';
import emailService from './emailService.js';
import { brevoDeliveryTransition, brevoEventKind, normalizeBrevoEvent } from '../utils/brevoDeliveryEvent.js';

export const MAX_BREVO_EVENTS = 1000;

class BrevoDeliveryEvents {
  async _scope(accountId) {
    const accounts = await prisma.emailAccount.findMany({ where: { provider: 'brevo' }, select: { id: true } });
    let accountIds = accounts.map(account => account.id);
    let accountScope = null;
    if (accountId !== null) {
      if (!Number.isSafeInteger(accountId) || !accountIds.includes(accountId)) {
        const error = new Error('Invalid Brevo email account');
        error.status = 400;
        throw error;
      }
      const identities = await emailService.getBrevoAccountGroups(accountIds);
      accountScope = identities.get(accountId) || `sender:${accountId}`;
      accountIds = identities.get(accountId)
        ? accountIds.filter(id => identities.get(id) === accountScope) : [accountId];
    }

    return { accountId, accountIds, accountScope };
  }

  async reconcile(payload, { accountId = null } = {}) {
    const payloads = Array.isArray(payload) ? payload : [payload];
    if (!payloads.length || payloads.length > MAX_BREVO_EVENTS
      || payloads.some(item => !normalizeBrevoEvent(item))) {
      const error = new Error(`Supply 1–${MAX_BREVO_EVENTS} Brevo email events with an email address and event name`);
      error.status = 400;
      throw error;
    }
    const scope = await this._scope(accountId);
    const receipts = payloads.map(item => normalizeBrevoEvent(item, scope.accountScope));
    return prisma.$transaction(async tx => {
      const results = [];
      for (const receipt of receipts) results.push(await this._apply(tx, receipt, scope));
      return { processed: results.length, results };
    }, { timeout: 15000 });
  }

  async replayUnmatched({ limit = 100 } = {}) {
    const pending = await prisma.emailDeliveryEvent.findMany({
      where: { provider: 'brevo', outcome: 'unmatched', reason: { in: ['message_not_found', 'ambiguous_provider_identity'] } },
      orderBy: [{ lastAttemptAt: 'asc' }, { id: 'asc' }], take: Math.min(1000, Math.max(1, limit)),
    });
    const scopes = new Map();
    let applied = 0;
    for (const pendingEvent of pending) {
      if (!scopes.has(pendingEvent.emailAccountId)) {
        try { scopes.set(pendingEvent.emailAccountId, await this._scope(pendingEvent.emailAccountId)); }
        catch (error) { if (error.status !== 400) throw error; scopes.set(pendingEvent.emailAccountId, null); }
      }
      const scope = scopes.get(pendingEvent.emailAccountId);
      // A changed/deleted provider account needs operator reconciliation; its
      // historical campaign IDs must not be matched inside a different account.
      if (!scope || scope.accountScope !== pendingEvent.accountScope) {
        await prisma.emailDeliveryEvent.update({ where: { id: pendingEvent.id }, data: { lastAttemptAt: new Date() } });
        continue;
      }
      const { eventKey, event, recipient, providerCampaignId, providerMessageId, occurredAt } = pendingEvent;
      const result = await prisma.$transaction(tx => this._apply(tx, {
        eventKey, event, recipient, providerCampaignId, providerMessageId, occurredAt,
      }, scope, { replay: true }));
      if (result.outcome === 'applied') applied += 1;
    }
    return { checked: pending.length, applied };
  }

  async _apply(tx, receipt, { accountId, accountIds, accountScope }, { replay = false } = {}) {
    const prior = await tx.emailDeliveryEvent.findUnique({ where: { eventKey: receipt.eventKey } });
    if (prior && (!replay || prior.outcome !== 'unmatched')) return { duplicate: true, eventId: prior.id, outcome: prior.outcome };

    const kind = brevoEventKind(receipt.event);
    const leads = await tx.$queryRaw`SELECT id FROM Lead WHERE lower(trim(email)) = ${receipt.recipient}`;
    const leadIds = leads.map(lead => Number(lead.id));
    let match = null;
    let outcome = 'unmatched';
    let reason = 'message_not_found';
    let messagesUpdated = 0;
    let suppressed = 0;

    if (kind === 'unknown') {
      outcome = 'ignored'; reason = 'unsupported_event';
    } else if (!receipt.providerCampaignId && !receipt.providerMessageId) {
      reason = 'provider_identity_missing';
    } else {
      const identity = receipt.providerCampaignId
        ? { providerCampaignId: receipt.providerCampaignId }
        : { OR: [
            { providerMessageId: { in: [receipt.providerMessageId, `<${receipt.providerMessageId}>`] } },
            { emailMessageId: { in: [receipt.providerMessageId, `<${receipt.providerMessageId}>`] } },
          ] };
      const matches = await tx.message.findMany({
        where: {
          channel: 'email', direction: 'outbound', emailAccountId: { in: accountIds },
          AND: [identity, { OR: [
            { emailRecipient: receipt.recipient },
            // Legacy rows lack the send-time snapshot. Never replace a known
            // recipient with the lead's editable current address.
            { emailRecipient: null, leadId: { in: leadIds } },
          ] }],
        }, take: 2,
      });
      if (matches.length === 1) {
        match = matches[0];
        outcome = 'recorded'; reason = kind === 'tracking' ? 'proxy_open_not_human_engagement' : 'no_delivery_change';
        const update = brevoDeliveryTransition(match, receipt);
        if (update) {
          await tx.message.update({ where: { id: match.id }, data: update });
          outcome = 'applied'; reason = null; messagesUpdated = 1;
          if (['hard_bounce', 'invalid'].includes(receipt.event)) {
            await tx.lead.updateMany({
              where: { id: { in: leadIds }, emailOptOut: false, emailStatus: { notIn: ['complained', 'unsubscribed', 'suppressed'] } },
              data: { emailStatus: 'bounced' },
            });
          }
        }
      } else if (matches.length > 1) reason = 'ambiguous_provider_identity';
    }

    // An authenticated unsubscribe is recipient-wide, even when the original
    // send is not in this CRM. Delivery facts alone never clear suppression.
    if (kind === 'suppression' && leadIds.length) {
      const where = { id: { in: leadIds } };
      await tx.lead.updateMany({
        where: { ...where, emailOptOutAt: null },
        data: { emailOptOutAt: receipt.occurredAt || new Date() },
      });
      const updated = await tx.lead.updateMany({
        where, data: { emailOptOut: true },
      });
      await tx.lead.updateMany({
        where: { ...where, ...(receipt.event === 'unsubscribe' ? { emailStatus: { not: 'complained' } } : {}) },
        data: { emailStatus: receipt.event === 'complaint' ? 'complained' : 'unsubscribed' },
      });
      await tx.message.updateMany({
        where: { leadId: { in: leadIds }, channel: 'email', direction: 'outbound', status: 'queued' },
        data: { status: 'cancelled', providerStatusReason: 'recipient_suppressed' },
      });
      suppressed = updated.count;
      outcome = 'applied';
      if (match) reason = null;
    }

    const data = { ...receipt, emailAccountId: accountId, accountScope, messageId: match?.id || null, outcome, reason, lastAttemptAt: new Date() };
    const event = prior
      ? await tx.emailDeliveryEvent.update({ where: { id: prior.id }, data })
      : await tx.emailDeliveryEvent.create({ data });
    return { eventId: event.id, outcome, reason, messagesUpdated, suppressed };
  }
}

export default new BrevoDeliveryEvents();
