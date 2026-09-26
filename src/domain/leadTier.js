/**
 * How urgent a lead is, from how recently it arrived.
 *
 * Kept on its own so scoring does not depend on any one lead source. It used to
 * live inside the IndiaMART poller, which meant the scorer imported a
 * marketplace scraper to get a three-line function.
 *
 * @param {Date|string|null} consumedAt  When the lead was acquired.
 * @returns {'HOT'|'WARM'|'COLD'}
 */
export function computeLeadTier(consumedAt) {
  if (!consumedAt) return 'WARM';
  const ageMs = Date.now() - new Date(consumedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 2) return 'HOT';
  if (ageHours < 168) return 'WARM'; // under 7 days
  return 'COLD';
}
