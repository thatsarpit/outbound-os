/**
 * Email subject normalization.
 *
 * Goals:
 *   1. Strip "SUBJECT:" labels the LLM might leave behind in the body parser path.
 *   2. Strip control chars, surrounding quotes, and known spam triggers.
 *   3. For follow-ups, reuse the previous subject so the recipient's mail client
 *      threads them into a single conversation. We use a single "Re: " prefix
 *      regardless of how many follow-ups precede it (no "Re: Re: Re:" stacking).
 *   4. Clamp to 60 chars (with ellipsis) so subjects render fully on mobile.
 *   5. Provide a sane fallback when the LLM returns an empty subject.
 *
 * Used by both src/services/messageComposer.js (subject building) and
 * src/services/emailService.js (send/queue defense in depth).
 */

const SPAM_TOKENS = [
  /\bfree!?\b/gi,
  /\burgent!?\b/gi,
  /\bact now\b/gi,
  /\blimited time\b/gi,
  /\$\$\$+/g,
  /!{2,}/g,
];

/**
 * Normalize an outbound email subject.
 *
 * @param {string|null|undefined} rawSubject
 * @param {object} [options]
 * @param {object} [options.lead]            — Lead record (used for fallback subject building)
 * @param {boolean} [options.isFollowup]     — true if this is a follow-up email
 * @param {string|null} [options.previousSubject] — subject of the prior outbound email in this thread
 * @returns {string} Normalized, clamped subject (always non-empty)
 */
export function normalizeEmailSubject(rawSubject, { lead = {}, isFollowup = false, previousSubject = null } = {}) {
  let subject = String(rawSubject ?? '').trim();

  // Strip leading "Subject:" label LLM may leak
  subject = subject.replace(/^subject\s*:\s*/i, '').trim();
  // Strip control chars
  subject = subject.replace(/[\u0000-\u001f]+/g, ' ').trim();
  // Strip surrounding straight or curly quotes
  subject = subject.replace(/^[\u0022\u0027\u201c\u201d\u2018\u2019]+|[\u0022\u0027\u201c\u201d\u2018\u2019]+$/g, '').trim();
  // Collapse whitespace
  subject = subject.replace(/\s+/g, ' ').trim();
  // Strip spam tokens
  for (const re of SPAM_TOKENS) {
    subject = subject.replace(re, '').trim();
  }
  // Collapse again post-strip
  subject = subject.replace(/\s+/g, ' ').trim();

  if (isFollowup) {
    // Pick the canonical thread subject: previousSubject preferred, else current.
    const baseSource = (previousSubject && String(previousSubject).trim()) || subject;
    // Strip any existing Re:/RE:/re: prefixes (recursive) so we end up with one.
    const stripped = baseSource.replace(/^(\s*re\s*:\s*)+/i, '').trim();
    const fallback = stripped || (lead.product ? String(lead.product) : 'your inquiry');
    subject = `Re: ${fallback}`;
  } else if (!subject) {
    const product = lead.product ? String(lead.product).trim() : '';
    const country = lead.country ? String(lead.country).trim() : '';
    if (product && country) {
      subject = `Quote — ${product} for ${country}`;
    } else if (product) {
      subject = `Quote — ${product}`;
    } else {
      subject = 'Following up on your inquiry';
    }
  }

  // Clamp to 60 chars with ellipsis
  if (subject.length > 60) {
    subject = subject.slice(0, 59).trimEnd() + '\u2026';
  }

  return subject;
}

/**
 * @param {string|null|undefined} subject
 * @returns {boolean}
 */
export function looksLikeFollowupSubject(subject) {
  if (!subject) return false;
  return /^\s*re\s*:/i.test(String(subject));
}
