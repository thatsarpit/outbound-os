/**
 * Canonical merge-variable catalog for message/email templates.
 *
 * These are the tokens the backend actually substitutes — see
 * `personalizeMessage()` in src/services/campaignEngine.js. Keep this list in
 * sync with that replacer; offering tokens the engine doesn't replace would
 * leave literal `{{foo}}` in sent messages.
 */
export interface TemplateVariable {
  /** token name, used as `{{token}}` */
  token: string
  /** human label for the picker */
  label: string
  /** sample value used in the live preview */
  sample: string
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { token: 'name', label: 'Lead name', sample: 'Rajesh' },
  { token: 'company', label: 'Company', sample: 'Acme Trading Ltd' },
  { token: 'product', label: 'Product', sample: 'Stainless hex bolts M8' },
  { token: 'country', label: 'Country', sample: 'United Arab Emirates' },
  { token: 'quantity', label: 'Quantity', sample: '10,000 units' },
]

const SAMPLE_BY_TOKEN: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.token, v.sample]),
)

/** Match `{{ token }}` allowing surrounding whitespace, case-insensitive. */
const TOKEN_RE = /\{\{\s*([\w]+)\s*\}\}/g

/**
 * Replace every `{{token}}` with its sample value for the live preview.
 * Unknown tokens are left readable as `[token]` rather than raw braces so the
 * preview reads like a real message instead of a template.
 */
export function substituteVariables(text: string): string {
  if (!text) return ''
  return text.replace(TOKEN_RE, (_match, token: string) => {
    const key = token.toLowerCase()
    return SAMPLE_BY_TOKEN[key] ?? `[${key}]`
  })
}

/** Distinct tokens used in the given text(s), preserving first-seen order. */
export function extractVariables(...texts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(TOKEN_RE)) {
      const key = m[1].toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(key)
      }
    }
  }
  return out
}
