/**
 * Which company actually delivers an account's WhatsApp messages.
 *
 *   meta     Meta's own WhatsApp Cloud API (graph.facebook.com). The default:
 *            anyone can create a free Meta developer app and connect a number
 *            without a middleman. Needs a phone number id and an access token.
 *
 *   aisensy  AiSensy, a Meta Business Solution Provider. Their Project API is a
 *            passthrough of the Cloud API for session replies, and their API
 *            Campaign endpoint sends approved templates by campaign name.
 *
 * Both speak the same message format, so everything above this file — queues,
 * follow-ups, campaigns — does not care which one an account uses. This file
 * is the one place that knows what "configured" means for each.
 */

export const WHATSAPP_PROVIDERS = Object.freeze({
  META: 'meta',
  AISENSY: 'aisensy',
});

export const PROVIDER_LABELS = Object.freeze({
  meta: 'Meta WhatsApp Cloud API',
  aisensy: 'AiSensy',
});

export function providerOf(account) {
  return account?.provider === WHATSAPP_PROVIDERS.AISENSY
    ? WHATSAPP_PROVIDERS.AISENSY
    : WHATSAPP_PROVIDERS.META;
}

/**
 * What an account can send with the credentials it has, including the
 * process-wide env fallback single-account installs use.
 *
 * `session` is free text inside Meta's 24-hour window; `templates` is approved
 * templates, which is what first contact and anything later must use.
 */
export function credentialState(account, env = process.env) {
  const provider = providerOf(account);
  if (provider === WHATSAPP_PROVIDERS.META) {
    const configured = Boolean(
      (account?.cloudApiPhoneId && account?.cloudApiToken)
      || (env.META_PHONE_NUMBER_ID && env.META_ACCESS_TOKEN),
    );
    return { provider, session: configured, templates: configured, ready: configured };
  }
  const session = Boolean(
    (account?.aisensyProjectId && account?.aisensyApiKey)
    || (env.AISENSY_PROJECT_ID && env.AISENSY_API_KEY),
  );
  const templates = Boolean(account?.aisensyCampaignApiKey || env.AISENSY_CAMPAIGN_API_KEY);
  return { provider, session, templates, ready: session || templates };
}

/**
 * The browser-safe summary of an account's credentials: which pieces exist,
 * never the secrets themselves.
 */
export function publicCredentialSummary(account) {
  const state = credentialState(account);
  return {
    provider: state.provider,
    providerLabel: PROVIDER_LABELS[state.provider],
    sessionReady: state.session,
    templatesReady: state.templates,
    // Field names the dashboard already reads for AiSensy accounts.
    projectApiConfigured: state.provider === WHATSAPP_PROVIDERS.AISENSY && state.session,
    campaignApiConfigured: state.provider === WHATSAPP_PROVIDERS.AISENSY && state.templates,
    metaConfigured: state.provider === WHATSAPP_PROVIDERS.META && state.ready,
    metaPhoneNumberId: account?.cloudApiPhoneId || '',
  };
}
