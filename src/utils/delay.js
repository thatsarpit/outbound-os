import { withDefaultCountryCode } from './phoneDefaults.js';
import config from '../config.js';

/**
 * Random delay between min and max milliseconds (human-like pauses)
 */
export function randomDelay(min = 30000, max = 90000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Short typing simulation delay
 */
export function typingDelay(min = 3000, max = 8000) {
  return randomDelay(min, max);
}

/**
 * Is the current time inside the outreach window?
 *
 * The hours default to the configured window rather than to literals. They used
 * to default to 9-21 while config defaulted to 9-23, and campaignEngine called
 * this with no arguments — so campaigns quietly stopped sending two hours before
 * the settings screen said they would, while follow-ups (which did pass the
 * config) kept going.
 *
 * The zone comes from config too. This was hardcoded to a fixed UTC+5:30 offset,
 * which ignored `BUSINESS_TIMEZONE` entirely; going through Intl also means a
 * zone that observes DST behaves correctly instead of drifting by an hour for
 * half the year.
 */
export function isBusinessHours(
  startHour = config.businessHours.start,
  endHour = config.businessHours.end,
  timeZone = config.businessHours.timezone,
) {
  const hour = hourIn(timeZone);
  if (startHour <= endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Midnight wraparound (e.g. 22 to 04)
  return hour >= startHour || hour < endHour;
}

/** Current hour-of-day (0-23) in the given IANA timezone. */
function hourIn(timeZone) {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        hour12: false,
      }).format(new Date()),
    ) % 24;
  } catch {
    // An unknown zone must not stop outreach altogether; fall back to UTC and
    // let the misconfiguration show up as an odd window rather than silence.
    return new Date().getUTCHours();
  }
}

/**
 * Format phone number for WhatsApp (remove +, -, spaces, parens)
 */
export function formatPhoneForWA(phone) {
  if (!phone) return null;
  // Remove all non-digit characters
  let cleaned = phone.replace(/[^\d]/g, '');
  // A national number (leading 0, or no country code) gets the workspace's
  // DEFAULT_COUNTRY_CODE when one is set.
  cleaned = withDefaultCountryCode(cleaned);
  // WhatsApp expects: countrycode + number (no + prefix)
  return cleaned;
}

/**
 * Sleep for exact milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Minutes until the outreach window next opens.
 *
 * Computed from whole hours in the configured zone. The previous version shifted
 * a timestamp by the IST offset and then read it back with the host-local
 * getHours()/setHours(), so its answer was wrong by the server's own UTC offset
 * — correct only on a machine already set to IST.
 */
export function minutesUntilBusinessHours(
  startHour = config.businessHours.start,
  timeZone = config.businessHours.timezone,
) {
  const hour = hourIn(timeZone);
  if (hour === startHour) return 0;
  const hoursAway = hour < startHour ? startHour - hour : 24 - hour + startHour;
  return hoursAway * 60;
}
