import { createHmac, timingSafeEqual } from 'node:crypto';

const normalize = value => String(value || '').trim().toLowerCase();
const signedSubject = /^unsubscribe ([a-f0-9]{64})$/i;

function tokenFor(sender, recipient, env) {
  const secret = env.LEAD_SYNC_ENCRYPTION_KEY || env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  return createHmac('sha256', secret).update(JSON.stringify([
    'outboundos:mailto-unsubscribe:v1', normalize(sender), normalize(recipient),
  ])).digest('hex');
}

export function listUnsubscribeHeader(sender, recipient, env = process.env) {
  const address = env.EMAIL_UNSUBSCRIBE_ADDRESS || sender;
  const token = tokenFor(address, recipient, env);
  const subject = token ? `Unsubscribe ${token}` : 'Unsubscribe';
  return `<mailto:${address}?subject=${encodeURIComponent(subject)}>`;
}

export function requestsEmailUnsubscribe(subject, text) {
  const cleanSubject = String(subject || '').trim();
  if (signedSubject.test(cleanSubject) || /^unsubscribe[.!]?$/i.test(cleanSubject)) return true;
  // A short exact request at the top is intentional. Never search the whole
  // email, where an old quoted footer could turn a normal reply into an opt-out.
  const firstLine = String(text || '').trimStart().split(/\r?\n/, 1)[0]?.trim();
  return /^(?:please\s+)?(?:unsubscribe(?:\s+me)?|remove me from (?:your|the) mailing list)[.!]?$/i.test(firstLine);
}

export function hasValidUnsubscribeSubject(subject, receivingAddress, recipient, env = process.env) {
  const supplied = String(subject || '').trim().match(signedSubject)?.[1];
  const expected = tokenFor(receivingAddress, recipient, env);
  return Boolean(supplied && expected && timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex')));
}

export async function suppressEmailLeads(tx, leadIds, occurredAt, status = 'unsubscribed') {
  for (let offset = 0; offset < leadIds.length; offset += 400) {
    const ids = leadIds.slice(offset, offset + 400);
    const where = { id: { in: ids } };
    await tx.lead.updateMany({ where: { ...where, emailOptOutAt: null }, data: { emailOptOutAt: occurredAt } });
    await tx.lead.updateMany({ where, data: { emailOptOut: true } });
    await tx.lead.updateMany({
      where: { ...where, ...(status === 'unsubscribed' ? { emailStatus: { not: 'complained' } } : {}) },
      data: { emailStatus: status },
    });
    await tx.message.updateMany({
      where: { leadId: { in: ids }, channel: 'email', direction: 'outbound', status: 'queued' },
      data: { status: 'cancelled', providerStatusReason: 'recipient_suppressed' },
    });
  }
}
