import { credentialState } from './whatsappProviders.js';

const channels = new Set(['whatsapp', 'email', 'both', 'imessage']);
const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };

/** Preserve legacy campaign identities while keeping email and WhatsApp ID spaces separate. */
export async function campaignInput(body, { db, existing = null } = {}) {
  const input = { ...existing, ...body };
  const channel = input.channel || 'whatsapp';
  if (!channels.has(channel)) invalid('Choose a supported campaign channel.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 200) invalid('A campaign name of 1–200 characters is required.');
  if (typeof input.messageTemplate !== 'string' || !input.messageTemplate.trim()) invalid('A message template is required.');
  const email = channel === 'email' || channel === 'both';
  const whatsapp = channel === 'whatsapp' || channel === 'both';
  if (email && (typeof input.emailSubject !== 'string' || !input.emailSubject.trim())) invalid('An email subject is required.');
  const data = {};
  for (const key of ['description', 'emailSubject', 'variantBTemplate', 'variantBSubject', 'waCampaignName']) {
    if (input[key] != null && typeof input[key] !== 'string') invalid(`${key} must be text.`);
    data[key] = input[key]?.trim() || null;
  }
  if (email && data.variantBTemplate && !data.variantBSubject) invalid('Variant B needs an email subject.');
  let filter = input.targetFilter;
  if (typeof filter === 'string') {
    try { filter = JSON.parse(filter); } catch { invalid('Target filter must be valid JSON.'); }
  }
  if (filter != null && (typeof filter !== 'object' || Array.isArray(filter))) invalid('Target filter must be a JSON object.');
  const changingChannel = existing && channel !== existing.channel;
  let legacy = changingChannel && !Object.hasOwn(body, 'senderAccountId') ? null : input.senderAccountId;
  // An explicit typed clear must not revive the legacy value on the next dispatch.
  if ((email && Object.hasOwn(body, 'emailSenderAccountId') && body.emailSenderAccountId === null)
    || (channel === 'whatsapp' && Object.hasOwn(body, 'whatsappSenderAccountId') && body.whatsappSenderAccountId === null)) legacy = null;
  const parseId = (value, label) => {
    if (value == null) return null;
    if (!Number.isSafeInteger(value) || value < 1) invalid(`Choose a valid ${label} sender.`);
    return value;
  };
  const emailId = parseId(Object.hasOwn(body, 'emailSenderAccountId') ? body.emailSenderAccountId : input.emailSenderAccountId ?? (email ? legacy : null), 'email');
  const whatsappId = parseId(Object.hasOwn(body, 'whatsappSenderAccountId') ? body.whatsappSenderAccountId : input.whatsappSenderAccountId ?? (channel === 'whatsapp' ? legacy : null), 'WhatsApp');
  if (Object.hasOwn(body, 'emailSenderAccountId') && body.emailSenderAccountId != null && !email) invalid('This channel does not use an email sender.');
  if (Object.hasOwn(body, 'whatsappSenderAccountId') && body.whatsappSenderAccountId != null && !whatsapp) invalid('This channel does not use a WhatsApp sender.');
  if (email && emailId) {
    const account = await db.emailAccount.findUnique({ where: { id: emailId } });
    if (!account?.enabled || account.status !== 'verified') invalid('Choose an enabled, verified email sender.');
  }
  if (whatsapp && whatsappId) {
    const account = await db.whatsAppAccount.findUnique({ where: { id: whatsappId } });
    if (!account?.enabled || !credentialState(account).ready) invalid('Choose a configured, enabled WhatsApp sender.');
  }
  return {
    ...data, name: input.name.trim(), messageTemplate: input.messageTemplate,
    channel, targetFilter: filter ? JSON.stringify(filter) : null,
    senderAccountId: parseId(legacy, 'legacy'),
    emailSenderAccountId: email ? emailId : null,
    whatsappSenderAccountId: whatsapp ? whatsappId : null,
  };
}
