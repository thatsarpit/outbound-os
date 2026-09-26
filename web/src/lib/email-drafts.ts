const DRAFT_PREFIX = 'oos_draft_'

export interface EmailDraft {
  subject: string
  htmlBody: string
  plainBody: string
  channel: 'whatsapp' | 'email' | 'imessage' | 'telegram'
  senderAccountId: number | null
  cc: string
  bcc: string
  savedAt: number
}

export function saveDraft(leadId: number, draft: Omit<EmailDraft, 'savedAt'>): void {
  try {
    const data: EmailDraft = { ...draft, savedAt: Date.now() }
    localStorage.setItem(`${DRAFT_PREFIX}${leadId}`, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadDraft(leadId: number): EmailDraft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${leadId}`)
    if (!raw) return null
    const draft = JSON.parse(raw) as EmailDraft
    // Expire drafts older than 7 days
    if (Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
      clearDraft(leadId)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function clearDraft(leadId: number): void {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${leadId}`)
  } catch {
    // ignore
  }
}
