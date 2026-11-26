import type { InboxSendPayload } from '@/api/types'
import { workspaceWallTimeToUtc } from './mobile-workspace-time'

export function buildReplySubject(subject?: string | null) {
  const normalizedSubject = subject?.trim()
  if (!normalizedSubject) return 'Follow up from Outbound OS'
  if (/\{\{\s*contact\./i.test(normalizedSubject)) return 'Re: Your enquiry'
  return /^re:/i.test(normalizedSubject) ? normalizedSubject : `Re: ${normalizedSubject}`
}

export function stripMarkup(value?: string | null) {
  return (value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getRenderedTemplateText(payload: {
  textBody?: string | null
  htmlBody?: string | null
}) {
  return (payload.textBody || stripMarkup(payload.htmlBody)).trim()
}

export function emailScheduleDate(value: string, timezone: string) {
  const scheduledAt = workspaceWallTimeToUtc(value, timezone)
  if (!(Date.parse(scheduledAt) > Date.now())) {
    throw new Error('Choose a future date and time to schedule this email.')
  }
  return scheduledAt
}

export function scheduledEmailRequest(payload: InboxSendPayload, ids: Map<string, string>) {
  const fingerprint = JSON.stringify(payload)
  const clientMessageId = ids.get(fingerprint) || crypto.randomUUID()
  ids.set(fingerprint, clientMessageId)
  return { fingerprint, request: { ...payload, clientMessageId } }
}
