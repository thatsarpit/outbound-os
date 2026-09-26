/**
 * Lead-local send time.
 *
 * First contact lands best at the start of the recipient's working day, so a
 * queued message is scheduled for 09:30 in the lead's own country — whatever
 * zone the workspace itself is in. Countries are matched by name to a
 * representative UTC offset; an unknown country is treated as UTC.
 */

/** UTC offset (in hours) for each country name (lowercase partial match) */
const COUNTRY_OFFSETS = {
  // Americas
  'united states': -6,         // Central Time median (covers EST+PST)
  'usa': -6,
  'us ': -6,
  'canada': -5,                // Eastern Canada default
  'brazil': -3,
  'mexico': -6,
  'argentina': -3,
  'colombia': -5,
  'chile': -4,
  'peru': -5,

  // Europe
  'united kingdom': 0,
  'uk': 0,
  'great britain': 0,
  'ireland': 0,
  'germany': 1,
  'france': 1,
  'netherlands': 1,
  'holland': 1,
  'belgium': 1,
  'switzerland': 1,
  'austria': 1,
  'italy': 1,
  'spain': 1,
  'portugal': 0,
  'poland': 1,
  'sweden': 1,
  'norway': 1,
  'denmark': 1,
  'finland': 2,
  'czech': 1,
  'slovakia': 1,
  'hungary': 1,
  'romania': 2,
  'bulgaria': 2,
  'ukraine': 2,
  'russia': 3,
  'turkey': 3,
  'greece': 2,

  // Australia / Pacific
  'australia': 10,
  'new zealand': 12,
  'philippines': 8,
  'singapore': 8,
  'malaysia': 8,
  'indonesia': 7,
  'thailand': 7,
  'vietnam': 7,
  'hong kong': 8,
  'taiwan': 8,
  'japan': 9,
  'south korea': 9,
  'korea': 9,
  'china': 8,

  // South Asia / Middle East
  'india': 5.5,
  'nepal': 5.75,
  'bangladesh': 6,
  'sri lanka': 5.5,
  'pakistan': 5,
  'uae': 4,
  'united arab emirates': 4,
  'dubai': 4,
  'saudi arabia': 3,
  'qatar': 3,
  'kuwait': 3,
  'bahrain': 3,
  'oman': 4,
  'israel': 2,
  'jordan': 2,
  'egypt': 2,
  'kenya': 3,
  'nigeria': 1,
  'ghana': 0,
  'south africa': 2,
};

const SEND_HOUR = 9;
const SEND_MINUTE = 30;

/**
 * UTC offset (hours) for a country string, case-insensitive partial match.
 * Returns 0 if unknown.
 */
export function getCountryOffset(country) {
  if (!country) return 0;
  const lower = country.toLowerCase().trim();
  for (const [key, offset] of Object.entries(COUNTRY_OFFSETS)) {
    if (lower.includes(key) || key.includes(lower)) return offset;
  }
  return 0;
}

/**
 * The next moment it is 09:30 for a lead in `country` — later today in their
 * time if that is still ahead, otherwise tomorrow.
 *
 * @param {string} country
 * @param {Date} [now]
 * @returns {Date}
 */
export function getOptimalSendTime(country, now = new Date()) {
  const offsetMs = getCountryOffset(country) * 60 * 60 * 1000;
  // Shift into the lead's wall clock, set 09:30 there, shift back.
  const local = new Date(now.getTime() + offsetMs);
  const target = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), SEND_HOUR, SEND_MINUTE));
  if (target.getTime() <= local.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - offsetMs);
}
