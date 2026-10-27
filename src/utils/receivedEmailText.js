import { convert } from 'html-to-text';
import { EMAIL_INGRESS_MAX_BYTES } from './emailIngressSignature.js';

/** Multipart HTML-only mail may have no parser-generated text, even with a valid body. */
export function receivedEmailText(parsed) {
  if (typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text.trim();
  if (typeof parsed.html !== 'string' || !parsed.html.trim()) return '';
  return convert(parsed.html, {
    wordwrap: false,
    limits: { maxInputLength: EMAIL_INGRESS_MAX_BYTES, maxDepth: 40 },
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
    ],
  }).trim();
}
