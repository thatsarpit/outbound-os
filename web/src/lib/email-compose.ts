export function buildReplySubject(subject?: string | null) {
  const normalizedSubject = subject?.trim()
  if (!normalizedSubject) return 'Follow up from Outbound OS'
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
