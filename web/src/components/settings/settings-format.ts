import type { WhatsAppAccount, EmailAccount } from '@/api/types'

/**
 * Form-state shapes + (de)serialisation helpers shared by the Settings section
 * pages. Extracted verbatim from the former monolithic settings.tsx so the
 * per-section pages and their hooks can reuse them without duplication.
 */

export type EmailAccountFormState = {
  name: string
  senderName: string
  signature: string
  hourlyLimit: string
  dailyLimit: string
  whatsappAccountId: string
}

export function toEmailAccountForm(account: EmailAccount): EmailAccountFormState {
  return {
    name: account.name || '',
    senderName: account.senderName || '',
    signature: account.signature || '',
    hourlyLimit: String(account.hourlyLimit ?? 8),
    dailyLimit: String(account.dailyLimit ?? 50),
    whatsappAccountId: account.whatsappAccountId != null ? String(account.whatsappAccountId) : '',
  }
}

export type AccountFormState = {
  name: string
  personaName: string
  personaGender: string
  personaTitle: string
  companyName: string
  companyCity: string
  companyIndustry: string
  companyCerts: string
  companyUSP: string
  hourlyLimit: string
  dailyLimit: string
  maxFollowups: string
  followupDelays: string
}

/** "[0, 240, 1440]" JSON → "0, 240, 1440" for the editable text field. */
export function normalizeDelayInput(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.join(', ')
    }
  } catch {
    // fall through
  }
  return raw
}

/** "0, 240, 1440" text field → JSON array string for the API. */
export function toDelayJson(raw: string): string {
  const parsed = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0)

  return JSON.stringify(parsed.length > 0 ? parsed : [0, 240, 1440, 2880, 4320])
}

export function toAccountForm(account: WhatsAppAccount): AccountFormState {
  return {
    name: account.name || '',
    personaName: account.personaName || '',
    personaGender: account.personaGender || '',
    personaTitle: account.personaTitle || '',
    companyName: account.companyName || '',
    companyCity: account.companyCity || '',
    companyIndustry: account.companyIndustry || '',
    companyCerts: account.companyCerts || '',
    companyUSP: account.companyUSP || '',
    hourlyLimit: String(account.hourlyLimit ?? 8),
    dailyLimit: String(account.dailyLimit ?? 50),
    maxFollowups: String(account.maxFollowups ?? 5),
    followupDelays: normalizeDelayInput(account.followupDelays || '[0,240,1440,2880,4320]'),
  }
}
