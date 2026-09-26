/**
 * Workspace profile: who this install is and where it works from.
 *
 * Values start from the environment (.env) and can then be changed in the
 * dashboard — onboarding and Settings → Workspace. Saved values live in the
 * SystemConfig table under `workspace.<ENV_NAME>` and are applied to the
 * running process immediately, so no file is rewritten and nothing restarts.
 * A value saved in the dashboard wins over the environment.
 *
 * Cron schedules read the time zone when they are registered, so a changed
 * time zone applies to them after the next restart; everything else (daily
 * limits, reports, templates, phone numbers) follows it straight away.
 */

import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import config from '../config.js';
import businessProfile from '../businessProfile.js';

const KEY_PREFIX = 'workspace.';
const DISMISSED_KEY = 'workspace.onboarding_dismissed';

function text(max) {
  return (value) => {
    const cleaned = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
    if (cleaned.length > max) throw new Error(`must be at most ${max} characters`);
    return cleaned;
  };
}

function url(value) {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '';
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error('must be a full web address starting with https://');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('must start with https://');
  return parsed.toString();
}

function timezone(value) {
  const cleaned = String(value ?? '').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: cleaned });
  } catch {
    throw new Error('is not a known time zone (e.g. Europe/London)');
  }
  return cleaned;
}

function digits(max) {
  return (value) => {
    const cleaned = String(value ?? '').replace(/\D/g, '');
    if (cleaned.length > max) throw new Error(`must be at most ${max} digits`);
    return cleaned;
  };
}

function currency(value) {
  const cleaned = String(value ?? '').trim().toUpperCase() || 'USD';
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: cleaned });
  } catch {
    throw new Error('is not a known currency code (e.g. USD, EUR, INR)');
  }
  return cleaned;
}

/**
 * Every editable field: how to clean it, and what it changes when applied.
 * Names match the environment variables, so .env and the dashboard speak the
 * same vocabulary.
 */
const FIELDS = {
  BUSINESS_NAME: {
    clean: text(120),
    apply: (v) => { businessProfile.businessName = v || 'Outbound OS'; config.business.name = v; },
    read: () => config.business.name || '',
  },
  BUSINESS_TAGLINE: { clean: text(120), apply: (v) => { businessProfile.businessTagline = v; }, read: () => businessProfile.businessTagline },
  BUSINESS_WEBSITE: {
    clean: url,
    apply: (v) => { businessProfile.businessWebsite = v; config.business.website = v; process.env.BUSINESS_WEBSITE = v; },
    read: () => businessProfile.businessWebsite,
  },
  BUSINESS_CATALOGUE_URL: { clean: url, apply: (v) => { businessProfile.businessCatalogueUrl = v; }, read: () => businessProfile.businessCatalogueUrl },
  BUSINESS_WHATSAPP_NUMBER: {
    clean: digits(15),
    apply: (v) => {
      process.env.BUSINESS_WHATSAPP_NUMBER = v;
      businessProfile.businessWhatsAppUrl = process.env.BUSINESS_WHATSAPP_URL || (v ? `https://wa.me/${v}` : '');
    },
    read: () => process.env.BUSINESS_WHATSAPP_NUMBER || '',
  },
  BUSINESS_CITY: { clean: text(80), apply: (v) => { businessProfile.businessCity = v; }, read: () => businessProfile.businessCity },
  BUSINESS_COUNTRY: { clean: text(80), apply: (v) => { businessProfile.businessCountry = v; }, read: () => businessProfile.businessCountry },
  BUSINESS_INDUSTRY: {
    clean: text(120),
    apply: (v) => { businessProfile.businessIndustry = v; config.business.industry = v; },
    read: () => businessProfile.businessIndustry,
  },
  BUSINESS_CERTIFICATIONS: { clean: text(200), apply: (v) => { businessProfile.businessCertifications = v; }, read: () => businessProfile.businessCertifications },
  BUSINESS_USP: { clean: text(200), apply: (v) => { businessProfile.businessUSP = v; }, read: () => businessProfile.businessUSP },
  BUSINESS_TIMEZONE: {
    clean: timezone,
    apply: (v) => { businessProfile.timezone = v; config.businessHours.timezone = v; },
    read: () => config.businessHours.timezone,
  },
  BUSINESS_CURRENCY: {
    clean: currency,
    apply: (v) => { process.env.BUSINESS_CURRENCY = v; },
    read: () => process.env.BUSINESS_CURRENCY || 'USD',
  },
  DEFAULT_COUNTRY_CODE: {
    clean: digits(4),
    apply: (v) => { process.env.DEFAULT_COUNTRY_CODE = v; },
    read: () => String(process.env.DEFAULT_COUNTRY_CODE || '').replace(/\D/g, ''),
  },
  EMAIL_SIGNATURE_NAME: { clean: text(80), apply: (v) => { businessProfile.senderSignature = v; }, read: () => businessProfile.senderSignature },
  EMAIL_FOOTER_NOTE: { clean: text(300), apply: (v) => { businessProfile.emailFooterNote = v; }, read: () => businessProfile.emailFooterNote },
  DASHBOARD_BRAND_NAME: { clean: text(60), apply: (v) => { businessProfile.dashboardBrand = v || 'Outbound OS'; }, read: () => businessProfile.dashboardBrand },
  AI_PERSONA_NAME: { clean: text(60), apply: (v) => { businessProfile.personaName = v; }, read: () => businessProfile.personaName },
  AI_PERSONA_GENDER: { clean: text(20), apply: (v) => { businessProfile.personaGender = v; }, read: () => businessProfile.personaGender },
  AI_PERSONA_TITLE: { clean: text(60), apply: (v) => { businessProfile.personaTitle = v; }, read: () => businessProfile.personaTitle },
};

export const WORKSPACE_FIELDS = Object.freeze(Object.keys(FIELDS));

/** Current effective values, keyed by environment-variable name. */
export function getWorkspaceProfile() {
  return Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, field.read() ?? '']));
}

/** Apply saved dashboard values on boot. Unknown or invalid rows are skipped. */
export async function loadWorkspaceProfile() {
  let rows = [];
  try {
    rows = await prisma.systemConfig.findMany({ where: { key: { startsWith: KEY_PREFIX } } });
  } catch (error) {
    logger.warn(`Workspace profile not loaded: ${error.message}`);
    return getWorkspaceProfile();
  }
  for (const row of rows) {
    const field = FIELDS[row.key.slice(KEY_PREFIX.length)];
    if (!field) continue;
    try {
      field.apply(field.clean(row.value));
    } catch (error) {
      logger.warn(`Ignoring saved ${row.key}: ${error.message}`);
    }
  }
  return getWorkspaceProfile();
}

/**
 * Validate, store and apply. Only known fields are accepted; the whole save
 * is rejected if any value is invalid, so nothing is half-applied.
 */
export async function saveWorkspaceProfile(values = {}) {
  const cleaned = {};
  const errors = {};
  for (const [key, raw] of Object.entries(values || {})) {
    const field = FIELDS[key];
    if (!field) continue;
    try {
      cleaned[key] = field.clean(raw);
    } catch (error) {
      errors[key] = error.message;
    }
  }
  if (Object.keys(errors).length > 0) {
    const error = new Error(Object.entries(errors).map(([k, m]) => `${k} ${m}`).join('; '));
    error.statusCode = 400;
    error.fields = errors;
    throw error;
  }

  await prisma.$transaction(Object.entries(cleaned).map(([key, value]) => prisma.systemConfig.upsert({
    where: { key: `${KEY_PREFIX}${key}` },
    update: { value },
    create: { key: `${KEY_PREFIX}${key}`, value },
  })));
  for (const [key, value] of Object.entries(cleaned)) FIELDS[key].apply(value);
  return getWorkspaceProfile();
}

export async function isOnboardingDismissed() {
  const row = await prisma.systemConfig.findUnique({ where: { key: DISMISSED_KEY } }).catch(() => null);
  return row?.value === 'true';
}

export async function setOnboardingDismissed(dismissed = true) {
  await prisma.systemConfig.upsert({
    where: { key: DISMISSED_KEY },
    update: { value: String(Boolean(dismissed)) },
    create: { key: DISMISSED_KEY, value: String(Boolean(dismissed)) },
  });
}

export default {
  WORKSPACE_FIELDS,
  getWorkspaceProfile,
  loadWorkspaceProfile,
  saveWorkspaceProfile,
  isOnboardingDismissed,
  setOnboardingDismissed,
};
