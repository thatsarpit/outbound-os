/**
 * WhatsApp transport — Meta Cloud API, or AiSensy as a Meta BSP.
 *
 * Both providers speak Meta's Cloud API message format: the request body and
 * the response envelope are the same shapes, so the payload builders below are
 * shared. What differs is where the request goes and how it authenticates:
 *
 *   meta     POST https://graph.facebook.com/{version}/{phone_number_id}/messages
 *            Authorization: Bearer <access token>
 *
 *   aisensy  POST https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages
 *            X-AiSensy-Project-API-Pwd: <api key>
 *
 *   -> { messaging_product, contacts: [{ input, wa_id }], messages: [{ id }] }
 *
 * Approved templates go through the same /messages endpoint on Meta. AiSensy
 * sends them through its separate API Campaign endpoint, addressed by campaign
 * name — so a campaign's `waCampaignName` is a template name on Meta and an
 * AiSensy campaign name on AiSensy. sendCampaignTemplate hides the difference.
 *
 * THE 24-HOUR RULE: free-form text is only deliverable within 24h of the
 * contact's last inbound message. Outside that window Meta requires an approved
 * template, and a plain text send comes back as error 131047.
 *
 * Credentials are per account (Settings → WhatsApp), with a process-wide env
 * fallback for single-account installs:
 *   meta     META_PHONE_NUMBER_ID, META_ACCESS_TOKEN
 *   aisensy  AISENSY_PROJECT_ID, AISENSY_API_KEY, AISENSY_CAMPAIGN_API_KEY
 */

import fetch from 'node-fetch';
import prisma from '../utils/prismaClient.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { createDecipheriv, createCipheriv, randomBytes, createHash } from 'crypto';

import { WHATSAPP_PROVIDERS, credentialState, providerOf } from './whatsappProviders.js';

const META_GRAPH_BASE = process.env.META_GRAPH_API_BASE || 'https://graph.facebook.com/v21.0';
const AISENSY_API_BASE = process.env.AISENSY_API_BASE || 'https://apis.aisensy.com/project-apis/v1';
const AISENSY_CAMPAIGN_API_URL = process.env.AISENSY_CAMPAIGN_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2';
const REQUEST_TIMEOUT_MS = parseInt(process.env.AISENSY_TIMEOUT_MS, 10) || 20000;

// ── Credential encryption ───────────────────────────────────────────────────
// Key derivation is deliberately identical to emailService.js so there is one
// secret to rotate, not two. An earlier version padded a raw string into a
// 32-byte buffer and fell back to the literal 'medsales-key' when no env var
// was set — which meant tokens could be encrypted under a key that is published
// in this repository. Never reintroduce a default.
//
// Rotating LEAD_SYNC_ENCRYPTION_KEY / JWT_SECRET invalidates every stored
// credential (email, iMessage, webhook, and WhatsApp API keys alike).
function _getEncryptionKey() {
  const raw = process.env.LEAD_SYNC_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (raw.length < 16) throw new Error('Encryption key too short — set LEAD_SYNC_ENCRYPTION_KEY (32+ chars)');
  return createHash('sha256').update(raw).digest();
}

function encrypt(text) {
  if (!text) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', _getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(stored) {
  if (!stored || !stored.includes(':')) return stored || '';
  try {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const decipher = createDecipheriv('aes-256-gcm', _getEncryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch (err) {
    // A credential we cannot decrypt is unusable. Surface it rather than
    // silently sending the ciphertext as an auth header.
    logger.error(`AiSensy API key decrypt failed (key rotated?): ${err.message}`);
    return '';
  }
}

/**
 * Map an upstream failure to a stable reason code.
 *
 * Meta error codes arrive directly from Meta or proxied through AiSensy, so
 * both layers are handled.
 * Reason codes are consumed by whatsapp.js and the follow-up engine — keep them
 * stable, and keep 'not_on_whatsapp' distinct from transport faults so a bad
 * lead number never counts against account health.
 */
function classifyError(httpStatus, errCode, message = '') {
  if (httpStatus === 401 || httpStatus === 403) return 'auth_failed';
  if (httpStatus === 429) return 'rate_limited';

  switch (errCode) {
    case 190:               // Meta: access token expired or invalid (sent as HTTP 400)
      return 'auth_failed';
    case 131026:            // undeliverable — recipient not on WhatsApp
    case 131047:            // re-engagement: outside the 24h window
      return errCode === 131047 ? 're_engagement_required' : 'not_on_whatsapp';
    case 131030: return 'invalid_phone';
    case 131008: return 'quota_exceeded';
    case 131056: return 'blocked_by_user';
    case 132000:            // template param count mismatch
    case 132001:            // template does not exist
    case 132005: return 'template_invalid';
    case 100: return 'bad_request';
    default: break;
  }

  // AiSensy surfaces some conditions as prose rather than a Meta code.
  const m = String(message).toLowerCase();
  if (/not.*(a )?valid whatsapp|not on whatsapp|not registered/.test(m)) return 'not_on_whatsapp';
  if (/24 ?hour|session (has )?expired|re-?engagement/.test(m)) return 're_engagement_required';
  if (/template/.test(m)) return 'template_invalid';
  if (/unauthor|invalid api key|forbidden/.test(m)) return 'auth_failed';
  return 'send_failed';
}

class WhatsAppCloudApiService {

  /**
   * The account a send goes out from. Callers that do not name one — sign-in
   * codes, system notices — get the first enabled account with complete
   * credentials of its own; only if there is none does the env fallback apply.
   */
  async _loadAccount(accountId) {
    if (accountId) return prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    const accounts = await prisma.whatsAppAccount.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } });
    return accounts.find((account) => credentialState(account, {}).ready) || null;
  }

  /**
   * Where and how to POST a /messages payload for this account. Per-account
   * credentials win; the env fallback covers single-account installs.
   */
  async getTransport(accountId) {
    const account = await this._loadAccount(accountId);
    const provider = account ? providerOf(account) : (
      process.env.META_ACCESS_TOKEN ? WHATSAPP_PROVIDERS.META : WHATSAPP_PROVIDERS.AISENSY
    );

    if (provider === WHATSAPP_PROVIDERS.META) {
      const token = account?.cloudApiToken ? decrypt(account.cloudApiToken) : process.env.META_ACCESS_TOKEN;
      const phoneNumberId = account?.cloudApiPhoneId || process.env.META_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId) {
        throw new Error('No Meta WhatsApp credentials found. Add the phone number ID and access token in Settings → WhatsApp.');
      }
      return {
        provider,
        account,
        phoneNumberId,
        token,
        url: `${META_GRAPH_BASE}/${phoneNumberId}/messages`,
        headers: { Authorization: `Bearer ${token}` },
      };
    }

    const { apiKey, projectId } = await this.getCredentials(account?.id ?? accountId, account);
    return {
      provider,
      account,
      projectId,
      url: `${AISENSY_API_BASE}/project/${projectId}/messages`,
      headers: { 'X-AiSensy-Project-API-Pwd': apiKey },
    };
  }

  /**
   * Resolve the AiSensy project id + API key for an account, falling back to
   * process-wide env vars for single-account setups.
   */
  async getCredentials(accountId, preloaded = undefined) {
    if (accountId) {
      const account = preloaded === undefined ? await this._loadAccount(accountId) : preloaded;
      if (account) {
        const apiKey = account.aisensyApiKey ? decrypt(account.aisensyApiKey) : process.env.AISENSY_API_KEY;
        const projectId = account.aisensyProjectId || process.env.AISENSY_PROJECT_ID;
        if (apiKey && projectId) return { apiKey, projectId, account };
      }
    }
    const apiKey = process.env.AISENSY_API_KEY;
    const projectId = process.env.AISENSY_PROJECT_ID;
    if (!apiKey || !projectId) {
      throw new Error('No AiSensy credentials found. Set AISENSY_API_KEY and AISENSY_PROJECT_ID, or configure the account in Settings.');
    }
    return { apiKey, projectId, account: null };
  }

  async getCampaignCredentials(accountId) {
    if (accountId) {
      const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (account) {
        const apiKey = account.aisensyCampaignApiKey
          ? decrypt(account.aisensyCampaignApiKey)
          : process.env.AISENSY_CAMPAIGN_API_KEY;
        if (apiKey) return { apiKey, account };
      }
    }
    const apiKey = process.env.AISENSY_CAMPAIGN_API_KEY;
    if (!apiKey) {
      throw new Error('No AiSensy API Campaign key found. Configure it in Settings → WhatsApp.');
    }
    return { apiKey, account: null };
  }

  /**
   * Normalize a phone number to E.164 digits (no '+').
   * e.g. "+91-9876543210" → "919876543210"
   */
  normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  /**
   * POST a message payload and normalize the outcome.
   * Every public send method funnels through here so error classification,
   * timeouts, and logging behave identically.
   *
   * @returns {{success: boolean, messageId?: string, waId?: string, accountId?: number|null, reason?: string, rawError?: string}}
   */
  async _postMessage(payload, accountId, label) {
    let transport;
    try {
      transport = await this.getTransport(accountId);
    } catch (err) {
      logger.error(`WhatsApp ${label} aborted: ${err.message}`);
      return { success: false, reason: 'no_credentials', rawError: err.message };
    }

    const { url, headers: authHeaders, provider } = transport;
    const tag = `WhatsApp[${provider}]`;

    // node-fetch has no built-in timeout; without this a hung upstream would
    // stall the follow-up cron tick indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }

      if (!res.ok) {
        const errMsg = data?.error?.message || data?.message || text?.slice(0, 300) || `HTTP ${res.status}`;
        const errCode = data?.error?.code;
        const reason = classifyError(res.status, errCode, errMsg);
        logger.error(`${tag} ${label} failed [HTTP ${res.status}${errCode ? `/${errCode}` : ''}] ${reason}: ${errMsg}`);
        return { success: false, reason, rawError: errMsg };
      }

      const messageId = data?.messages?.[0]?.id;
      const waId = data?.contacts?.[0]?.wa_id;
      if (!messageId) {
        // 2xx without a message id means we cannot correlate delivery webhooks
        // to the Message row later. Treat as a failure rather than pretend.
        logger.error(`${tag} ${label} returned 2xx with no message id: ${text?.slice(0, 300)}`);
        return { success: false, reason: 'no_message_id', rawError: text?.slice(0, 300) };
      }

      return { success: true, messageId, waId, accountId: accountId ?? null, provider };

    } catch (err) {
      const aborted = err.name === 'AbortError';
      logger.error(`${tag} ${label} ${aborted ? 'timed out' : 'threw'}: ${err.message}`);
      return {
        success: false,
        reason: aborted ? 'timeout' : 'exception',
        rawError: err.message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Send a plain text message.
   *
   * Only deliverable inside the 24-hour customer service window. Outside it,
   * expect reason 're_engagement_required' — use sendTemplate instead.
   *
   * @param {string} phone — raw phone number (any format)
   * @param {string} text — message body
   * @param {number|null} accountId — WhatsAppAccount.id
   */
  async sendTextMessage(phone, text, accountId = null) {
    const to = this.normalizePhone(phone);
    if (!to) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };

    const result = await this._postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }, accountId, `text → *${to.slice(-4)}`);

    if (result.success) logger.info(`WhatsApp ✅ text sent to *${to.slice(-4)} — ${result.messageId}`);
    return result;
  }

  /**
   * Trigger an approved AiSensy API Campaign template. This is the correct
   * transport for first contact and for re-engagement outside the 24h window.
   */
  async sendCampaignTemplate({
    phone,
    campaignName,
    templateParams = [],
    userName = config.business.name || 'Outbound OS',
    source = 'outboundos',
    media = {},
    tags = [],
    attributes = {},
    accountId = null,
  }) {
    const destination = this.normalizePhone(phone);
    if (!destination) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };
    if (!String(campaignName || '').trim()) {
      return { success: false, reason: 'template_invalid', rawError: 'campaignName is required' };
    }

    // On Meta the "campaign" is simply the approved template's name, sent
    // through the normal /messages endpoint in the account's language.
    const account = await this._loadAccount(accountId);
    const useMeta = account ? providerOf(account) === WHATSAPP_PROVIDERS.META : Boolean(process.env.META_ACCESS_TOKEN);
    if (useMeta) {
      return this.sendTemplate(
        phone,
        String(campaignName).trim(),
        account?.templateLanguage || process.env.META_TEMPLATE_LANGUAGE || 'en',
        templateParams.map((value) => ({ type: 'text', text: String(value ?? '') })),
        accountId,
      );
    }

    let credentials;
    try {
      credentials = await this.getCampaignCredentials(accountId);
    } catch (error) {
      return { success: false, reason: 'no_campaign_credentials', rawError: error.message };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(AISENSY_CAMPAIGN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          campaignName: String(campaignName).trim(),
          destination: `+${destination}`,
          userName: String(userName || config.business.name || 'Outbound OS'),
          templateParams: templateParams.map((value) => String(value ?? '')),
          source: String(source || 'outboundos'),
          media: media || {},
          tags: Array.isArray(tags) ? tags : [],
          attributes: attributes || {},
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON response */ }
      if (!response.ok || data?.success === false) {
        const rawError = data?.error?.message || data?.message || text.slice(0, 300) || `HTTP ${response.status}`;
        return {
          success: false,
          reason: classifyError(response.status, data?.error?.code || data?.code, rawError),
          rawError,
        };
      }
      const messageId = data?.messageId || data?.id || data?.data?.messageId || data?.data?.id || null;
      // The Campaign API's documented success contract is HTTP 200; some
      // responses do not include a provider id. Never retry an accepted call.
      return {
        success: true,
        accepted: true,
        messageId: messageId ? String(messageId) : null,
        accountId,
      };
    } catch (error) {
      return {
        success: false,
        reason: error.name === 'AbortError' ? 'timeout' : 'exception',
        rawError: error.name === 'AbortError' ? 'AiSensy request timed out' : error.message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Send an approved template message (HSM).
   * Required for any first contact and for anything outside the 24h window.
   *
   * @param {string} phone
   * @param {string} templateName — approved template name
   * @param {string} languageCode — e.g. 'en', 'en_US', 'hi'
   * @param {Array<{type:'text', text:string}>} components — ordered body variables ({{1}}, {{2}}, …)
   * @param {number|null} accountId
   */
  async sendTemplate(phone, templateName, languageCode = 'en', components = [], accountId = null) {
    const to = this.normalizePhone(phone);
    if (!to) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };
    if (!templateName) return { success: false, reason: 'template_invalid', rawError: 'templateName is required' };

    const result = await this._postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components: [{ type: 'body', parameters: components }] } : {}),
      },
    }, accountId, `template '${templateName}' → *${to.slice(-4)}`);

    if (result.success) logger.info(`WhatsApp ✅ template '${templateName}' sent to *${to.slice(-4)} — ${result.messageId}`);
    return result;
  }

  /**
   * Send a media message by publicly reachable URL.
   *
   * The API fetches the URL itself, so it must be reachable from the public
   * internet — a local path or a private host will fail upstream.
   *
   * @param {string} phone
   * @param {string} mediaUrl — publicly accessible URL
   * @param {'image'|'document'|'audio'|'video'} mediaType
   * @param {string} caption — image/video only
   * @param {string} filename — document only
   * @param {number|null} accountId
   */
  async sendMediaMessage(phone, mediaUrl, mediaType = 'document', caption = '', filename = '', accountId = null) {
    const to = this.normalizePhone(phone);
    if (!to) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };
    if (!/^https?:\/\//i.test(mediaUrl || '')) {
      return { success: false, reason: 'invalid_media_url', rawError: 'mediaUrl must be a public http(s) URL' };
    }

    const mediaPayload = { link: mediaUrl };
    if (caption && (mediaType === 'image' || mediaType === 'video')) mediaPayload.caption = caption;
    if (filename && mediaType === 'document') mediaPayload.filename = filename;

    return this._postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: mediaPayload,
    }, accountId, `${mediaType} → *${to.slice(-4)}`);
  }

  /**
   * Verify credentials without sending anything to a real contact.
   *
   * There is no dedicated ping endpoint, so this posts a deliberately invalid
   * recipient and reads the failure mode: an auth error means the credentials
   * are wrong, anything else means we reached the API as an authenticated
   * caller. Used by the Settings "test connection" action.
   */
  async testCredentials(accountId = null) {
    const account = await this._loadAccount(accountId);
    if (account ? providerOf(account) === WHATSAPP_PROVIDERS.META : Boolean(process.env.META_ACCESS_TOKEN)) {
      return this._testMetaCredentials(accountId);
    }

    let projectId = null;
    let project = { ok: false, reason: 'no_credentials', message: 'Project API credentials are not configured.' };
    try {
      ({ projectId } = await this.getCredentials(accountId));
      const probe = await this._postMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '0',
        type: 'text',
        text: { preview_url: false, body: 'connection test' },
      }, accountId, 'credential probe');
      project = probe.reason === 'auth_failed'
        ? { ok: false, reason: 'auth_failed', message: 'Project API password rejected. AiSensy Pro requires the Project ID and App Password issued by support.' }
        : ['timeout', 'exception'].includes(probe.reason)
          ? { ok: false, reason: probe.reason, message: `Could not reach AiSensy: ${probe.rawError}` }
          : { ok: true, reason: null, message: 'Project API credentials accepted.' };
    } catch (error) {
      project = { ok: false, reason: 'no_credentials', message: error.message };
    }

    let campaign = { ok: false, reason: 'no_campaign_credentials', message: 'API Campaign key is not configured.' };
    try {
      const { apiKey } = await this.getCampaignCredentials(accountId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(AISENSY_CAMPAIGN_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            apiKey,
            campaignName: '__outboundos_connection_probe__',
            destination: '+0',
            userName: 'OutboundOS',
            templateParams: [],
            source: 'outboundos-connection-test',
          }),
          signal: controller.signal,
        });
        const body = await response.text();
        const authRejected = response.status === 401 || response.status === 403 || /unauthor|invalid api key|forbidden/i.test(body);
        campaign = authRejected
          ? { ok: false, reason: 'auth_failed', message: 'API Campaign key was rejected.' }
          : { ok: true, reason: null, message: 'API Campaign key accepted.' };
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      campaign = {
        ok: false,
        reason: error.name === 'AbortError' ? 'timeout' : 'no_campaign_credentials',
        message: error.name === 'AbortError' ? 'API Campaign probe timed out.' : error.message,
      };
    }

    const ok = project.ok || campaign.ok;
    return {
      ok,
      projectId,
      project,
      campaign,
      message: project.ok && campaign.ok
        ? 'AiSensy Project API and API Campaigns are connected.'
        : campaign.ok
          ? 'AiSensy API Campaigns are connected; Project API replies still need a valid Pro App Password.'
          : project.ok
            ? 'AiSensy Project API is connected; add an API Campaign key for approved-template outreach.'
            : 'AiSensy is not connected.',
    };
  }

  /**
   * Meta has a real read endpoint for a phone number, so this is an honest
   * check: it proves the token can see that number and reports its name and
   * quality rating, without sending anything.
   */
  async _testMetaCredentials(accountId) {
    let transport;
    try {
      transport = await this.getTransport(accountId);
    } catch (error) {
      return { ok: false, provider: 'meta', reason: 'no_credentials', message: error.message };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${META_GRAPH_BASE}/${transport.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
      const response = await fetch(url, { headers: transport.headers, signal: controller.signal });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON body */ }
      if (!response.ok) {
        const rawError = data?.error?.message || text.slice(0, 300) || `HTTP ${response.status}`;
        const reason = classifyError(response.status, data?.error?.code, rawError);
        return {
          ok: false,
          provider: 'meta',
          reason,
          message: reason === 'auth_failed'
            ? 'Meta rejected the access token. Use a permanent System User token with whatsapp_business_messaging permission.'
            : `Meta could not read that phone number: ${rawError}`,
        };
      }
      return {
        ok: true,
        provider: 'meta',
        reason: null,
        phoneNumber: data.display_phone_number || null,
        verifiedName: data.verified_name || null,
        qualityRating: data.quality_rating || null,
        message: `Connected to ${data.verified_name || 'your WhatsApp number'}${data.display_phone_number ? ` (${data.display_phone_number})` : ''}.`,
      };
    } catch (error) {
      return {
        ok: false,
        provider: 'meta',
        reason: error.name === 'AbortError' ? 'timeout' : 'exception',
        message: error.name === 'AbortError' ? 'Meta did not answer in time.' : `Could not reach Meta: ${error.message}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Encrypt a credential for storage (AiSensy keys, Meta access tokens).
   */
  encryptToken(plainToken) {
    return encrypt(plainToken);
  }
}

const whatsappCloudApi = new WhatsAppCloudApiService();
export default whatsappCloudApi;
