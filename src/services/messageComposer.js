/**
 * Message composer — static, template-only.
 *
 * Replaces the OpenRouter LLM service. WhatsApp moved to the official Cloud
 * API, which only delivers pre-approved templates, so generated copy could not
 * be sent even when it was good. Removing the model also ends a dependency
 * that silently halted all message generation whenever credits ran out or a
 * model id was retired.
 *
 * Everything here is the static path llm.js already fell back to, lifted out
 * intact — the tier-aware templates in templates/messages.js plus the
 * per-account persona resolution, which exists so a message never goes out
 * signed with the wrong brand.
 */
import logger from '../utils/logger.js';
import { getMessage } from '../templates/messages.js';
import globalProfile from '../businessProfile.js';
import { normalizeEmailSubject } from '../utils/email-subject.js';

/** Bump when template copy changes materially, so analytics can compare cohorts. */
const TEMPLATE_VERSION = 'static-v1';

function buildTemplateVariant({ tier, step }) {
  return `${TEMPLATE_VERSION}:${(tier || 'WARM').toUpperCase()}:${step}`;
}

/**
 * Resolve the persona for a message.
 *
 * Per-account identity takes priority over the global profile. `strict` is
 * used by the email path, which must never silently fall back to the global
 * persona — that was the wrong-brand bug.
 */
export function resolveProfile(accountProfile, { strict = false } = {}) {
  if (!accountProfile) {
    if (strict) {
      throw new Error('Persona required (strict mode) — refusing to use the global fallback persona');
    }
    return globalProfile;
  }

  if (!accountProfile.personaName || !accountProfile.companyName) {
    logger.warn('⚠️ Account profile has empty personaName or companyName — using account values as-is to prevent persona leak');
  }

  return {
    personaName:            accountProfile.personaName     || globalProfile.personaName,
    personaGender:          accountProfile.personaGender   || globalProfile.personaGender,
    personaTitle:           accountProfile.personaTitle    || globalProfile.personaTitle,
    businessName:           accountProfile.companyName     || globalProfile.businessName,
    businessCity:           accountProfile.companyCity     || globalProfile.businessCity,
    businessCountry:        globalProfile.businessCountry,
    businessIndustry:       accountProfile.companyIndustry || globalProfile.businessIndustry,
    businessCertifications: accountProfile.companyCerts    || globalProfile.businessCertifications,
    businessUSP:            accountProfile.companyUSP      || globalProfile.businessUSP,
    businessWebsite:        globalProfile.businessWebsite,
    dashboardBrand:         globalProfile.dashboardBrand,
    _sourceAccountId:       accountProfile._sourceAccountId || null,
  };
}

/**
 * First-touch WhatsApp message. Always an array: step 1 templates are
 * two-part, split on '|||', and callers send the parts as separate messages.
 */
export function composeInitialMessage(lead, accountProfile = null) {
  const tier = lead.leadTier || 'WARM';
  const result = getMessage(tier, 1, lead, resolveProfile(accountProfile));
  return Array.isArray(result) ? result : [result];
}

/** Follow-up WhatsApp message. Returns a single string. */
export function composeFollowupMessage(lead, followupNumber, accountProfile = null) {
  const tier = lead.leadTier || 'WARM';
  const result = getMessage(tier, followupNumber, lead, resolveProfile(accountProfile));
  return Array.isArray(result) ? result.join(' ') : result;
}

function buildEmail(lead, tier, step, profile) {
  const name = lead.name?.split(' ')[0] || 'there';
  const product = lead.product || 'your requirement';
  const business = profile?.businessName || globalProfile.businessName;
  const persona = profile?.personaName || globalProfile.personaName;

  const opener = step === 1
    ? `Thank you for your enquiry about ${product}.`
    : `Following up on your enquiry about ${product}.`;

  const body =
    `Hi ${name},\n\n${opener}\n\n` +
    `We supply ${product} and would be glad to share pricing and availability. ` +
    `Could you confirm the quantity you need and your destination port?\n\n` +
    `Best regards,\n${persona}\n${business}`;

  const htmlBody =
    `<p>Hi ${name},</p><p>${opener}</p>` +
    `<p>We supply ${product} and would be glad to share pricing and availability. ` +
    `Could you confirm the quantity you need and your destination port?</p>` +
    `<p>Best regards,<br>${persona}<br>${business}</p>`;

  return {
    subject: normalizeEmailSubject(`${product} — pricing and availability`, { lead, isFollowup: step > 1 }),
    body,
    htmlBody,
    templateVariant: buildTemplateVariant({ tier, step: `step-${step}` }),
  };
}

/** First-touch email. Strict persona: email must not send under the wrong brand. */
export function composeInitialEmail(lead, accountProfile = null) {
  const tier = lead.leadTier || 'WARM';
  return buildEmail(lead, tier, 1, resolveProfile(accountProfile, { strict: true }));
}

/** Follow-up email. */
export function composeFollowupEmail(lead, followupNumber, accountProfile = null) {
  const tier = lead.leadTier || 'WARM';
  return buildEmail(lead, tier, followupNumber, resolveProfile(accountProfile, { strict: true }));
}

export default {
  resolveProfile,
  composeInitialMessage,
  composeFollowupMessage,
  composeInitialEmail,
  composeFollowupEmail,
};
