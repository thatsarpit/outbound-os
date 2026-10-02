import { getLocalDayRangeUTC, parseTimezoneOffset } from './reportingTime.js';

/** All period controls describe calendar days, including today in the requested zone. */
export function analyticsWindow(query, fallbackDays = 30, now = new Date()) {
  const ranges = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
  const requested = query.range === 'all' ? null : ranges[query.range]
    ?? (query.days === undefined ? fallbackDays : Number(query.days));
  const days = requested === null ? null : Number.isInteger(requested) && requested >= 1 && requested <= 90 ? requested : fallbackDays;
  const { start: today, end } = getLocalDayRangeUTC(parseTimezoneOffset(query.tzOffset), now);
  return { days, start: days === null ? null : new Date(today.getTime() - (days - 1) * 86400000), end };
}
