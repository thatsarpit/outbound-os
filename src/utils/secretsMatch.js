import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `a !== b` on strings short-circuits at the first differing byte, so response
 * time reveals how much of a guess was correct — enough to recover an API key
 * one character at a time. Hashing both sides to a fixed-width digest first
 * makes the comparison constant time and lets it accept operands of different
 * lengths, which `timingSafeEqual` otherwise throws on.
 */
export function secretsMatch(provided, expected) {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;

  const digest = (value) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
