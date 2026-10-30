/**
 * WhatsApp transport through Meta's official Cloud API.
 * Approved templates are required for first contact and re-engagement;
 * free-form text is deliverable inside the 24-hour customer service window.
 * Credentials live on the account, with an environment pair for single-account installs.
 */
import fetch from 'node-fetch';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { cloudApiAddressee } from '../utils/whatsappAddress.js';
import { summarizeWhatsAppTemplate } from '../utils/whatsappTemplates.js';
import { createDecipheriv, createCipheriv, randomBytes, createHash } from 'crypto';

import { credentialState, metaCredentialPair, providerOf } from './whatsappProviders.js';
import { ycloudSendPayload } from '../utils/ycloudWebhook.js';
import { whatsappProviderError } from '../utils/whatsappProviderError.js';

// Read per call so tests (and self-hosters pinning an API version) can set it
// after this module has loaded.
const graphBase = () => process.env.META_GRAPH_API_BASE || 'https://graph.facebook.com/v21.0';
export const ycloudBase = () => process.env.YCLOUD_API_BASE || 'https://api.ycloud.com/v2';
const REQUEST_TIMEOUT_MS = parseInt(process.env.META_TIMEOUT_MS, 10) || 20000;

// ── Credential encryption ───────────────────────────────────────────────────
// Key derivation is deliberately identical to emailService.js so there is one
// secret to rotate, not two. An earlier version padded a raw string into a
// 32-byte buffer and fell back to a literal key when no env var
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
    logger.error(`Meta access token decrypt failed (key rotated?): ${err.message}`);
    return '';
  }
}

/**
 * Map an upstream failure to a stable reason code.
 *
 * Meta error codes and HTTP failures are normalized for callers.
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
    case 131042: return 'payment_issue';
    case 131049: return 'marketing_limit';
    case 131008: return 'quota_exceeded';
    case 131056: return 'blocked_by_user';
    case 132000:            // template param count mismatch
    case 132001:            // template does not exist
    case 132005: return 'template_invalid';
    case 100: return 'bad_request';
    default: break;
  }

  // Keep useful classification for upstream errors without a numeric code.
  const m = String(message).toLowerCase();
  if (/not.*(a )?valid whatsapp|not on whatsapp|not registered/.test(m)) return 'not_on_whatsapp';
  if (/24 ?hour|session (has )?expired|re-?engagement/.test(m)) return 're_engagement_required';
  if (/template/.test(m)) return 'template_invalid';
  if (/unauthor|invalid api key|forbidden/.test(m)) return 'auth_failed';
  return 'send_failed';
}

class WhatsAppCloudApiService {

  async listApprovedTemplates(accountId) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    const fail = (status, reason, message) => ({ ok: false, status, reason, message });
    if (!account) return fail(404, 'account_not_found', 'WhatsApp account not found.');
    if (providerOf(account) === 'ycloud') return this.listYCloudTemplates(account);
    if (!account.metaWabaId) {
      return fail(422, 'missing_waba_id', 'Add the WhatsApp Business Account ID in Settings → WhatsApp for this number.');
    }
    const pair = metaCredentialPair(account);
    const token = pair ? decrypt(pair.token) : '';
    if (!token) return fail(422, 'no_credentials', 'Add a valid Meta access token in Settings → WhatsApp.');
    const templates = [];
    const seenCursors = new Set();
    let after;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      // Rebuild each page URL ourselves: never forward the bearer token to an
      // arbitrary URL from an upstream pagination response.
      for (let page = 0; page < 100; page += 1) {
        const url = new URL(`${graphBase()}/${encodeURIComponent(account.metaWabaId)}/message_templates`);
        url.searchParams.set('fields', 'name,language,category,status,components');
        url.searchParams.set('status', 'APPROVED');
        url.searchParams.set('limit', '100');
        if (after) url.searchParams.set('after', after);
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const data = await response.json();
        if (!response.ok || data.error) {
          return fail(502, 'upstream_error', 'Meta could not list templates. Check the access token and whatsapp_business_management permission.');
        }
        if (!Array.isArray(data.data)) return fail(502, 'invalid_response', 'Meta returned an invalid template list. Try again.');
        templates.push(...data.data.filter((template) => template.status === 'APPROVED').map(summarizeWhatsAppTemplate));
        if (!data.paging?.next) return { ok: true, templates };
        after = data.paging?.cursors?.after;
        if (!after || seenCursors.has(after)) break;
        seenCursors.add(after);
      }
      return fail(502, 'incomplete_response', 'Meta pagination did not complete. Try loading templates again.');
    } catch (error) {
      return fail(502, error.name === 'AbortError' ? 'timeout' : 'connection_failed',
        error.name === 'AbortError' ? 'Meta did not answer in time. Try again.' : 'Could not reach Meta or read its template response. Try again.');
    } finally {
      clearTimeout(timer);
    }
  }

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
    if (accountId && !account) throw new Error('WhatsApp account not found.');
    if (providerOf(account) === 'ycloud') {
      const token = decrypt(account.ycloudApiKey);
      if (!credentialState(account, {}).ready || !token) {
        throw new Error('Add the YCloud API key, sender number and YCloud WABA ID in Settings → WhatsApp.');
      }
      return { provider: 'ycloud', account, token, phoneNumber: account.ycloudPhoneNumber,
        url: `${ycloudBase()}/whatsapp/messages/sendDirectly`, headers: { 'X-API-Key': token } };
    }
    const pair = metaCredentialPair(account);
    const token = pair ? decrypt(pair.token) : '';
    if (!pair || !token) {
      throw new Error('Add a complete Meta phone number ID and access token in Settings → WhatsApp.');
    }
    return {
      provider: 'meta',
      account,
      phoneNumberId: pair.phoneNumberId,
      token,
      url: `${graphBase()}/${pair.phoneNumberId}/messages`,
      headers: { Authorization: `Bearer ${token}` },
    };
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
        body: JSON.stringify(provider === 'ycloud' ? ycloudSendPayload(payload, transport.phoneNumber) : payload),
        redirect: 'error',
        signal: controller.signal,
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }

      if (!res.ok || (provider === 'ycloud' && data.status === 'failed')) {
        const failure = whatsappProviderError(data, res.status, transport.token);
        const reason = classifyError(res.status, Number(failure.errorCode), failure.rawError);
        logger.error(`${tag} ${label} failed [HTTP ${res.status}${failure.errorCode ? `/${failure.errorCode}` : ''}] ${reason}: ${failure.rawError}`);
        return { success: false, reason, ...failure, provider,
          ...(provider === 'ycloud' && typeof data.id === 'string' ? { messageId: data.id } : {}) };
      }

      const messageId = provider === 'ycloud' ? data?.id : data?.messages?.[0]?.id;
      const waId = data?.contacts?.[0]?.wa_id;
      if (!messageId) {
        // 2xx without a message id means we cannot correlate delivery webhooks
        // to the Message row later. Treat as a failure rather than pretend.
        logger.error(`${tag} ${label} returned 2xx with no message id.`);
        return { success: false, reason: 'no_message_id', rawError: 'Provider response did not include a message ID.' };
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
    const addressee = cloudApiAddressee(phone, (value) => this.normalizePhone(value));
    if (!addressee) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };
    const to = addressee.to || addressee.recipient;

    const result = await this._postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...addressee,
      type: 'text',
      text: { preview_url: false, body: text },
    }, accountId, `text → *${to.slice(-4)}`);

    if (result.success) logger.info(`WhatsApp ✅ text sent to *${to.slice(-4)} — ${result.messageId}`);
    return result;
  }

  /** Send an approved Meta template using the campaign's ordered body variables. */
  async sendCampaignTemplate({ phone, campaignName, templateParams = [], accountId = null }) {
    return this.sendTemplate(
      phone,
      String(campaignName || '').trim(),
      (await this._loadAccount(accountId))?.templateLanguage || process.env.META_TEMPLATE_LANGUAGE || 'en',
      templateParams.map((value) => ({ type: 'text', text: String(value ?? '') })),
      accountId,
    );
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
    const addressee = cloudApiAddressee(phone, (value) => this.normalizePhone(value));
    if (!addressee) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };
    const to = addressee.to || addressee.recipient;
    if (!templateName) return { success: false, reason: 'template_invalid', rawError: 'templateName is required' };

    const result = await this._postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...addressee,
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
   * Send media already uploaded to Meta (POST /{phone-number-id}/media),
   * addressed by its media id. See services/whatsappMedia.js.
   *
   * @param {string} phone — number or business-scoped user id
   * @param {string} mediaId
   * @param {'image'|'document'|'audio'|'video'} mediaType
   * @param {{caption?: string, filename?: string}} options
   * @param {number|null} accountId
   */
  async sendMediaById(phone, mediaId, mediaType = 'document', { caption = '', filename = '' } = {}, accountId = null) {
    const addressee = cloudApiAddressee(phone, (value) => this.normalizePhone(value));
    if (!addressee) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };
    const to = addressee.to || addressee.recipient;

    const mediaPayload = { id: String(mediaId) };
    if (caption && mediaType !== 'audio') mediaPayload.caption = String(caption).slice(0, 1024);
    if (filename && mediaType === 'document') mediaPayload.filename = String(filename).slice(0, 240);

    return this._postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...addressee,
      type: mediaType,
      [mediaType]: mediaPayload,
    }, accountId, `${mediaType} (uploaded) → *${to.slice(-4)}`);
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
    const addressee = cloudApiAddressee(phone, (value) => this.normalizePhone(value));
    if (!addressee) return { success: false, reason: 'invalid_phone', rawError: 'Empty phone number' };
    const to = addressee.to || addressee.recipient;
    if (!/^https?:\/\//i.test(mediaUrl || '')) {
      return { success: false, reason: 'invalid_media_url', rawError: 'mediaUrl must be a public http(s) URL' };
    }

    const mediaPayload = { link: mediaUrl };
    if (caption && (mediaType === 'image' || mediaType === 'video')) mediaPayload.caption = caption;
    if (filename && mediaType === 'document') mediaPayload.filename = filename;

    return this._postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...addressee,
      type: mediaType,
      [mediaType]: mediaPayload,
    }, accountId, `${mediaType} → *${to.slice(-4)}`);
  }

  /**
   * Meta has a real read endpoint for a phone number, so this is an honest
   * check: it proves the token can see that number and reports its name and
   * quality rating, without sending anything.
   */
  async testCredentials(accountId = null) {
    let transport;
    try {
      transport = await this.getTransport(accountId);
    } catch (error) {
      const account = await this._loadAccount(accountId);
      return { ok: false, provider: providerOf(account), reason: 'no_credentials', message: error.message };
    }
    if (transport.provider === 'ycloud') {
      try {
        const data = await this.ycloudRead(`/whatsapp/phoneNumbers/${encodeURIComponent(transport.account.ycloudWabaId)}/${encodeURIComponent(transport.phoneNumber)}`, transport);
        const phone = String(data.phoneNumber || '').replace(/\D/g, '');
        if (phone !== transport.phoneNumber.replace(/\D/g, '') || String(data.wabaId) !== transport.account.ycloudWabaId) {
          return { ok: false, provider: 'ycloud', reason: 'account_mismatch', message: 'YCloud returned a different number or WABA. Check both account fields.' };
        }
        return { ok: true, provider: 'ycloud', phoneNumber: data.phoneNumber,
          verifiedName: data.verifiedName || null, qualityRating: data.qualityRating || null,
          message: `YCloud can access ${data.phoneNumber}. No message was sent.` };
      } catch (error) {
        return { ok: false, provider: 'ycloud', reason: 'connection_failed', message: error.message };
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${graphBase()}/${transport.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
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
   * Encrypt a Meta access token for storage.
   */
  encryptToken(plainToken) {
    return encrypt(plainToken);
  }

  decryptToken(stored) { return decrypt(stored); }

  async ycloudRead(path, transport) {
    const response = await fetch(`${ycloudBase()}${path}`, {
      headers: transport.headers, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`YCloud request failed (HTTP ${response.status}). Check the API key and number access.`);
    return data;
  }

  async listYCloudTemplates(account) {
    try {
      const transport = await this.getTransport(account.id);
      const templates = [];
      for (let page = 1; page <= 100; page++) {
        const params = new URLSearchParams({ page: String(page), limit: '100', 'filter.wabaId': account.ycloudWabaId, 'filter.status': 'APPROVED' });
        const data = await this.ycloudRead(`/whatsapp/templates?${params}`, transport);
        if (!Array.isArray(data.items)) throw new Error('YCloud returned an invalid template list.');
        templates.push(...data.items.filter(t => t.status === 'APPROVED' && String(t.wabaId) === account.ycloudWabaId).map(summarizeWhatsAppTemplate));
        if (data.items.length < 100) return { ok: true, templates };
      }
      throw new Error('YCloud template pagination did not complete.');
    } catch (error) {
      return { ok: false, status: 502, reason: 'upstream_error', message: error.message };
    }
  }
}

const whatsappCloudApi = new WhatsAppCloudApiService();
export default whatsappCloudApi;
