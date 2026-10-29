/** Official WhatsApp APIs, either directly through Meta or through YCloud. */
export const WHATSAPP_PROVIDERS = Object.freeze({ META: 'meta', YCLOUD: 'ycloud' });

export function providerOf(account) {
  return account?.provider || WHATSAPP_PROVIDERS.META;
}

/**
 * Keep each phone number and token together. An incomplete per-account pair
 * must never borrow a token or phone ID from another account's environment.
 */
export function metaCredentialPair(account, env = process.env) {
  if (providerOf(account) !== WHATSAPP_PROVIDERS.META) return null;
  const hasAccountCredentials = Boolean(account?.cloudApiPhoneId || account?.cloudApiToken);
  const phoneNumberId = hasAccountCredentials ? account.cloudApiPhoneId : env.META_PHONE_NUMBER_ID;
  const token = hasAccountCredentials ? account.cloudApiToken : env.META_ACCESS_TOKEN;
  return phoneNumberId && token ? { phoneNumberId, token } : null;
}

export function credentialState(account, env = process.env) {
  const ready = providerOf(account) === WHATSAPP_PROVIDERS.YCLOUD
    ? Boolean(account?.ycloudApiKey && /^\+[1-9]\d{7,14}$/.test(account?.ycloudPhoneNumber || '') && account?.ycloudWabaId)
    : Boolean(metaCredentialPair(account, env));
  return { provider: providerOf(account), session: ready, templates: ready, ready };
}

/** Browser-safe credential status; tokens are never returned. */
export function publicCredentialSummary(account) {
  const state = credentialState(account);
  return {
    provider: state.provider,
    providerLabel: state.provider === 'ycloud' ? 'YCloud WhatsApp API' : 'Meta WhatsApp Cloud API',
    sessionReady: state.session,
    templatesReady: state.templates,
    connectionConfigured: state.ready,
    metaConfigured: state.provider === 'meta' && state.ready,
    ycloudConfigured: state.provider === 'ycloud' && state.ready,
    ycloudWebhookConfigured: Boolean(account?.ycloudWebhookSecret),
    ycloudPhoneNumber: account?.ycloudPhoneNumber || '',
    ycloudWabaId: account?.ycloudWabaId || '',
    metaPhoneNumberId: account?.cloudApiPhoneId || '',
  };
}

export function publicWhatsAppAccount(account) {
  const { cloudApiToken, ycloudApiKey, ycloudWebhookSecret, ...safe } = account;
  return { ...safe, ...publicCredentialSummary(account) };
}
