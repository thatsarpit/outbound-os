/**
 * Timezone Engine
 * Maps country names → UTC offsets → optimal IST send time
 *
 * Strategy: message each lead at 9:30 AM *their* local time.
 * That maps to a specific IST time for each region.
 *
 * Windows (IST):
 *   AUSTRALIA   06:30  (09:30 AEST / UTC+10)
 *   SOUTH_ASIA  09:30  (09:30 IST  / UTC+5.5 — Nepal, Bangladesh, India, Middle East)
 *   EUROPE      14:00  (09:30 BST  / UTC+1)
 *   USA_EAST    19:30  (09:30 EST  / UTC-5 — NY, FL, TX, Ontario)
 *   USA_WEST    22:00  (09:30 PST  / UTC-8 — CA, OR, WA, BC)
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

/**
 * Window definitions: each window fires at a specific IST hour
 * and targets leads in a UTC offset band.
 */
export const WINDOWS = {
  AUSTRALIA:  { istHour: 6,  istMin: 30, utcOffsetMin: 8,  utcOffsetMax: 12, label: '🦘 Australia' },
  SOUTH_ASIA: { istHour: 10, istMin: 0,  utcOffsetMin: 3,  utcOffsetMax: 7,  label: '🌏 South Asia / Middle East' },
  EUROPE:     { istHour: 14, istMin: 0,  utcOffsetMin: -1, utcOffsetMax: 2,  label: '🇪🇺 Europe' },
  USA_EAST:   { istHour: 19, istMin: 30, utcOffsetMin: -6, utcOffsetMax: -3, label: '🇺🇸 USA East & SA' },
  USA_WEST:   { istHour: 22, istMin: 0,  utcOffsetMin: -9, utcOffsetMax: -7, label: '🌎 USA West' },
  DEFAULT:    { istHour: 14, istMin: 30, utcOffsetMin: -99, utcOffsetMax: 99, label: '🌐 Other' },
};

/**
 * Get UTC offset for a country string (case-insensitive partial match)
 * Returns 0 if unknown.
 */
export function getCountryOffset(country) {
  if (!country) return 0;
  const lower = country.toLowerCase().trim();
  for (const [key, offset] of Object.entries(COUNTRY_OFFSETS)) {
    if (lower.includes(key) || key.includes(lower)) return offset;
  }
  return 0; // default UTC
}

/**
 * Get the send window for a country
 */
export function getWindowForCountry(country) {
  const offset = getCountryOffset(country);
  for (const [name, w] of Object.entries(WINDOWS)) {
    if (name === 'DEFAULT') continue;
    if (offset >= w.utcOffsetMin && offset <= w.utcOffsetMax) return { name, ...w };
  }
  return { name: 'DEFAULT', ...WINDOWS.DEFAULT };
}

/**
 * Calculate the next IST datetime when we should send to a lead in this country.
 * Returns a Date object (may be today or tomorrow depending on current IST time).
 *
 * @param {string} country
 * @returns {Date} - UTC Date representing the next optimal send time
 */
export function getOptimalSendTime(country) {
  const window = getWindowForCountry(country);

  // Get current IST time
  const nowUtc = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(nowUtc.getTime() + istOffsetMs);

  // Build target IST time today
  const targetIst = new Date(nowIst);
  targetIst.setUTCHours(window.istHour, window.istMin, 0, 0);

  // If the window already passed today, schedule for tomorrow
  if (targetIst <= nowIst) {
    targetIst.setUTCDate(targetIst.getUTCDate() + 1);
  }

  // Convert back to UTC for storage
  return new Date(targetIst.getTime() - istOffsetMs);
}

/**
 * Check if now is within ±45 minutes of a window's IST time
 */
export function isWindowActive(windowName) {
  const window = WINDOWS[windowName];
  if (!window) return false;

  const nowUtc = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(nowUtc.getTime() + istOffsetMs);
  const nowHour = nowIst.getUTCHours();
  const nowMin = nowIst.getUTCMinutes();
  const nowTotalMin = nowHour * 60 + nowMin;
  const windowTotalMin = window.istHour * 60 + window.istMin;

  let diff = Math.abs(nowTotalMin - windowTotalMin);
  if (diff > 720) diff = 1440 - diff; // Handle midnight loop (e.g., 23:55 to 00:05)
  return diff <= 45;
}

/**
 * Get all window names sorted by their IST hour
 */
export function getWindowsSortedByTime() {
  return Object.entries(WINDOWS)
    .filter(([name]) => name !== 'DEFAULT')
    .sort((a, b) => (a[1].istHour * 60 + a[1].istMin) - (b[1].istHour * 60 + b[1].istMin))
    .map(([name, w]) => ({ name, ...w }));
}
