const DRAFT_PREFIX = 'oos_draft_v2:'

export interface EmailDraft {
  subject: string
  htmlBody: string
  plainBody: string
  channel: 'whatsapp' | 'email' | 'imessage' | 'telegram'
  senderAccountId: number | null
  cc: string
  bcc: string
  savedAt: number
  revision?: string
}

const leadKey = (scope: string, leadId: number) =>
  `${DRAFT_PREFIX}${encodeURIComponent(scope)}:${leadId}:`
const draftKey = (scope: string, leadId: number, channel: string, accountId: number | null) =>
  `${leadKey(scope, leadId)}${channel}:${accountId ?? 'default'}`

// Drafts are private to the signed-in person/workspace and sending identity.
// Deliberately do not read the old, unscoped keys on shared devices.
export function saveDraft(
  scope: string,
  leadId: number,
  draft: Omit<EmailDraft, 'savedAt'>,
): boolean {
  try {
    const key = draftKey(scope, leadId, draft.channel, draft.senderAccountId)
    localStorage.setItem(
      key,
      JSON.stringify({ ...draft, savedAt: Date.now(), revision: crypto.randomUUID() }),
    )
    localStorage.setItem(`${leadKey(scope, leadId)}latest`, key)
    return true
  } catch {
    return false
  }
}

export function loadDraft(
  scope: string,
  leadId: number,
  channel?: EmailDraft['channel'],
  accountId: number | null = null,
): EmailDraft | null {
  try {
    const prefix = leadKey(scope, leadId)
    const key = channel
      ? draftKey(scope, leadId, channel, accountId)
      : localStorage.getItem(`${prefix}latest`)
    if (!key?.startsWith(prefix)) return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const draft = JSON.parse(raw) as EmailDraft
    if (
      !draft ||
      !['subject', 'plainBody', 'htmlBody', 'cc', 'bcc'].every(
        (field) => typeof draft[field as keyof EmailDraft] === 'string',
      ) ||
      !['whatsapp', 'email', 'imessage', 'telegram'].includes(draft.channel) ||
      !Number.isFinite(draft.savedAt)
    )
      return null
    if (Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function clearDraft(
  scope: string,
  leadId: number,
  channel?: EmailDraft['channel'],
  accountId: number | null = null,
): void {
  try {
    const prefix = leadKey(scope, leadId)
    if (channel) localStorage.removeItem(draftKey(scope, leadId, channel, accountId))
    else
      Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => localStorage.removeItem(key))
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

export function clearSessionDrafts(scope: string): void {
  try {
    const prefix = `${DRAFT_PREFIX}${encodeURIComponent(scope)}:`
    Object.keys(localStorage)
      .filter(
        (key) =>
          key.startsWith(prefix) || (key.startsWith('oos_draft_') && !key.startsWith(DRAFT_PREFIX)),
      )
      .forEach((key) => localStorage.removeItem(key))
  } catch {
    /* Best effort on sign-out. */
  }
}

// A slow send must not delete a newer draft written after leaving/reopening.
export function clearSubmittedDraft(
  scope: string,
  leadId: number,
  submitted: EmailDraft | null,
): void {
  if (!submitted?.revision) return
  const current = loadDraft(scope, leadId, submitted.channel, submitted.senderAccountId)
  if (current?.revision === submitted.revision)
    clearDraft(scope, leadId, submitted.channel, submitted.senderAccountId)
}
