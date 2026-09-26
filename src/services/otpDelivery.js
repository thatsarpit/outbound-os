/**
 * OTP delivery.
 *
 * Kept separate from phoneOtp.js so the credential logic (generation, hashing,
 * attempt limits) has no opinion about transport, and adding a channel never
 * risks touching the security-critical path.
 *
 * Channel order is configurable via OTP_CHANNEL:
 *   whatsapp  — approved AUTHENTICATION template on the first connected number (default)
 *   email     — falls back to the user's email address
 *   log       — writes the code to the server log; LOCAL DEVELOPMENT ONLY
 *
 * ── WhatsApp prerequisite ───────────────────────────────────────────────────
 * WhatsApp will not deliver a business-initiated message outside the 24-hour
 * customer service window unless it uses a template Meta has approved. An OTP
 * is by definition business-initiated, so this needs an approved template of
 * category AUTHENTICATION registered on the WABA, with its name in
 * OTP_WHATSAPP_TEMPLATE. Until that exists, sends fail with `template_invalid`
 * and the code falls through to the next channel.
 */

import logger from '../utils/logger.js';
import whatsappCloudApi from './whatsappCloudApi.js';
import emailService from './emailService.js';

const TEMPLATE_NAME = process.env.OTP_WHATSAPP_TEMPLATE || 'login_otp';
const TEMPLATE_LANG = process.env.OTP_WHATSAPP_TEMPLATE_LANG || 'en';

/** Ordered channel list, first success wins. */
function channelOrder() {
  const configured = String(process.env.OTP_CHANNEL || 'whatsapp,email')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : ['whatsapp', 'email'];
}

async function viaWhatsApp(phone, code) {
  // Body variable {{1}} is the code. Authentication templates also require the
  // code as the URL button parameter when the template uses one-tap copy;
  // a plain body-only template is the simpler path and what this assumes.
  const res = await whatsappCloudApi.sendTemplate(phone, TEMPLATE_NAME, TEMPLATE_LANG, [
    { type: 'text', text: code },
  ]);
  if (!res?.success) {
    return { ok: false, reason: res?.reason || 'send_failed', detail: res?.rawError };
  }
  return { ok: true, messageId: res.messageId };
}

async function viaEmail(user, code, ttlMinutes) {
  if (!user?.email) return { ok: false, reason: 'no_email' };
  const res = await emailService.sendSystemEmail({
    to: user.email,
    subject: `${code} is your Outbound OS sign-in code`,
    textBody:
      `Your sign-in code is ${code}.\n\n` +
      `It expires in ${ttlMinutes} minutes and can only be used once.\n\n` +
      `If you did not try to sign in, you can ignore this email — but tell your ` +
      `administrator, because someone has your phone number and knows it works here.`,
    tag: 'otp',
  });
  if (!res?.success) return { ok: false, reason: res?.error || 'send_failed' };
  return { ok: true };
}

function viaLog(phone, code) {
  if (process.env.NODE_ENV === 'production') {
    // Printing a live credential to a production log is a real leak — refuse.
    logger.error('OTP_CHANNEL=log refused in production');
    return { ok: false, reason: 'log_channel_forbidden_in_production' };
  }
  logger.warn(`🔐 [DEV] OTP for *${String(phone).slice(-4)} is ${code}`);
  return { ok: true };
}

/**
 * Deliver a code, trying each configured channel in order.
 * @returns {Promise<{ok: boolean, channel?: string, attempts: Array}>}
 */
export async function deliverCode({ phone, code, user, ttlMinutes }) {
  const attempts = [];

  for (const channel of channelOrder()) {
    let result;
    try {
      if (channel === 'whatsapp') result = await viaWhatsApp(phone, code);
      else if (channel === 'email') result = await viaEmail(user, code, ttlMinutes);
      else if (channel === 'log') result = viaLog(phone, code);
      else result = { ok: false, reason: `unknown_channel:${channel}` };
    } catch (err) {
      result = { ok: false, reason: 'exception', detail: err.message };
    }

    attempts.push({ channel, ...result });
    if (result.ok) {
      logger.info(`📨 OTP delivered via ${channel} to *${String(phone).slice(-4)}`);
      return { ok: true, channel, attempts };
    }
    logger.warn(`OTP delivery via ${channel} failed: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`);
  }

  return { ok: false, attempts };
}

export default { deliverCode };
