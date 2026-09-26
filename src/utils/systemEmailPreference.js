import { resolvePublicSiteConfig } from './publicSiteConfig.js';

const SYSTEM_ACCOUNT_ID_KEYS = [
  'email.system_account_id',
  'reports.sender_account_id',
];

const SYSTEM_SENDER_EMAIL_KEYS = [
  'email.system_sender_email',
  'reports.sender_email',
];

const ENV_SYSTEM_ACCOUNT_ID_KEYS = [
  'SYSTEM_EMAIL_ACCOUNT_ID',
  'REPORTS_SENDER_ACCOUNT_ID',
];

const ENV_SYSTEM_SENDER_EMAIL_KEYS = [
  'SYSTEM_EMAIL_ADDRESS',
  'REPORTS_SENDER_EMAIL',
];

function firstDefinedValue(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

function parseAccountId(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeEmail(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw || null;
}

function sortAccounts(accounts) {
  return [...accounts].sort((left, right) => {
    const leftSent = Number(left.sentToday || 0);
    const rightSent = Number(right.sentToday || 0);
    if (leftSent !== rightSent) return leftSent - rightSent;

    const leftCreated = new Date(left.createdAt || 0).getTime();
    const rightCreated = new Date(right.createdAt || 0).getTime();
    return leftCreated - rightCreated;
  });
}

export function resolveSystemEmailPreference({ env = process.env, configMap = {} } = {}) {
  const configAccountId = firstDefinedValue(SYSTEM_ACCOUNT_ID_KEYS.map((key) => configMap[key]));
  const envAccountId = firstDefinedValue(ENV_SYSTEM_ACCOUNT_ID_KEYS.map((key) => env[key]));
  const configEmail = firstDefinedValue(SYSTEM_SENDER_EMAIL_KEYS.map((key) => configMap[key]));
  const envEmail = firstDefinedValue(ENV_SYSTEM_SENDER_EMAIL_KEYS.map((key) => env[key]));
  const { mailDomain } = resolvePublicSiteConfig(env);

  return {
    accountId: parseAccountId(configAccountId) || parseAccountId(envAccountId),
    email: normalizeEmail(configEmail) || normalizeEmail(envEmail),
    mailDomain,
  };
}

export function chooseSystemSenderAccount(accounts, preference = {}) {
  const ranked = sortAccounts(accounts || []);
  if (ranked.length === 0) return null;

  if (preference.accountId) {
    const byId = ranked.find((account) => Number(account.id) === Number(preference.accountId));
    if (byId) return byId;
  }

  if (preference.email) {
    const byEmail = ranked.find((account) => String(account.email || '').trim().toLowerCase() === preference.email);
    if (byEmail) return byEmail;
  }

  if (preference.mailDomain) {
    const domainSuffix = `@${String(preference.mailDomain).trim().toLowerCase()}`;
    const byDomain = ranked.find((account) => String(account.email || '').trim().toLowerCase().endsWith(domainSuffix));
    if (byDomain) return byDomain;
  }

  return ranked[0];
}

export default {
  chooseSystemSenderAccount,
  resolveSystemEmailPreference,
};
