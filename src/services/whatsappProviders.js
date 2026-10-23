/** Meta's official Cloud API is the WhatsApp transport. */
export const WHATSAPP_PROVIDERS = Object.freeze({ META: 'meta' });

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
  const ready = Boolean(metaCredentialPair(account, env));
  return { provider: providerOf(account), session: ready, templates: ready, ready };
}

/** Browser-safe credential status; tokens are never returned. */
export function publicCredentialSummary(account) {
  const state = credentialState(account);
  return {
    provider: state.provider,
    providerLabel: 'Meta WhatsApp Cloud API',
    sessionReady: state.session,
    templatesReady: state.templates,
    metaConfigured: state.ready,
    metaPhoneNumberId: account?.cloudApiPhoneId || '',
  };
}
