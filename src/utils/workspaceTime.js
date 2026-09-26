import config from '../config.js';

/**
 * Workspace time zone helpers.
 *
 * Everything that means "today", "this week" or "08:00" — daily send caps,
 * report periods, cron schedules — is measured in the workspace's own zone
 * (BUSINESS_TIMEZONE), not the server's. These used to be hardcoded to India
 * with a fixed +5:30 offset, which is wrong for every other workspace and
 * wrong anywhere with daylight saving.
 */

export function workspaceTimezone() {
  return config.businessHours.timezone || 'UTC';
}

const partsFormatters = new Map();

function partsFormatter(timeZone) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Calendar fields of an instant as seen in `timeZone`. `month` is 0-based to
 * match Date; `weekday` is 0 for Sunday.
 */
export function zonedParts(date = new Date(), timeZone = workspaceTimezone()) {
  const fields = {};
  for (const { type, value } of partsFormatter(timeZone).formatToParts(date)) {
    fields[type] = value;
  }
  return {
    year: Number(fields.year),
    month: Number(fields.month) - 1,
    day: Number(fields.day),
    hours: Number(fields.hour),
    minutes: Number(fields.minute),
    seconds: Number(fields.second),
    weekday: WEEKDAYS[fields.weekday],
  };
}

/** Milliseconds the zone is ahead of UTC at that instant (India: +19,800,000). */
export function zoneOffsetMs(date, timeZone = workspaceTimezone()) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month, p.day, p.hours, p.minutes, p.seconds);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` reads the given time.
 * Out-of-range fields roll over the way Date.UTC does (month -1 is last
 * December), which is what period arithmetic relies on.
 */
export function zonedTimeToUtc(year, month, day, hours = 0, minutes = 0, timeZone = workspaceTimezone()) {
  const wall = Date.UTC(year, month, day, hours, minutes);
  // One correction pass handles DST: the offset at the first guess can differ
  // from the offset at the answer when a transition falls in between.
  let guess = wall - zoneOffsetMs(new Date(wall), timeZone);
  guess = wall - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** YYYY-MM-DD of the instant in the zone. */
export function zonedDateKey(date = new Date(), timeZone = workspaceTimezone()) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function isSameZonedDay(a, b = new Date(), timeZone = workspaceTimezone()) {
  return zonedDateKey(a, timeZone) === zonedDateKey(b, timeZone);
}

/**
 * The zone's current offset in the browser's getTimezoneOffset convention
 * (UTC minus local, so India is -330). Used as the reporting default when a
 * client does not say where it is.
 */
export function workspaceTzOffsetMinutes(date = new Date(), timeZone = workspaceTimezone()) {
  // `|| 0` turns -0 (UTC) into 0 so it compares equal and prints cleanly.
  return -Math.round(zoneOffsetMs(date, timeZone) / 60_000) || 0;
}
