import { workspaceTzOffsetMinutes } from './workspaceTime.js';

const MIN_TIMEZONE_OFFSET_MIN = -14 * 60;
const MAX_TIMEZONE_OFFSET_MIN = 14 * 60;

// Used when a client does not send its own offset: the workspace zone's
// offset when the process started (India is -330, UTC is 0).
export const DEFAULT_WORKSPACE_TZ_OFFSET_MIN = workspaceTzOffsetMinutes();

/**
 * Parse a browser-style timezone offset (UTC - local time) without letting an
 * invalid query value silently move reporting boundaries by days or years.
 */
export function parseTimezoneOffset(value, fallback = DEFAULT_WORKSPACE_TZ_OFFSET_MIN) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  const parsed = typeof normalized === 'number'
    ? normalized
    : typeof normalized === 'string' && /^-?\d+$/.test(normalized)
      ? Number(normalized)
      : NaN;
  return Number.isInteger(parsed)
    && parsed >= MIN_TIMEZONE_OFFSET_MIN
    && parsed <= MAX_TIMEZONE_OFFSET_MIN
    ? parsed
    : fallback;
}

/**
 * Return the half-open UTC interval for the user's current local day.
 * JavaScript's getTimezoneOffset convention is used: India is -330.
 */
export function getLocalDayRangeUTC(tzOffsetMin, now = new Date()) {
  const offset = parseTimezoneOffset(tzOffsetMin);
  const localNow = new Date(now.getTime() - offset * 60_000);
  const startLocalMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
  );
  const start = new Date(startLocalMs + offset * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

/**
 * "New leads" is a business-event metric, not a database-write metric.
 * Prefer the source event (`consumedAt`) and only fall back to `createdAt` for
 * live/manual sources. Historical imports without a source date are excluded;
 * otherwise running a migration can make hundreds of old records look new.
 */
export function buildNewLeadDateWhere(start, end) {
  const range = { gte: start, lt: end };
  return {
    OR: [
      { consumedAt: range },
      {
        consumedAt: null,
        source: 'manual',
        createdAt: range,
      },
    ],
  };
}

/** Use the provider event time when present, falling back to ingestion time. */
export function buildMessageEventDateWhere(start, end) {
  const range = { gte: start, lt: end };
  return {
    OR: [
      { providerCreatedAt: range },
      { providerCreatedAt: null, createdAt: range },
    ],
  };
}

export function localDateKey(date, tzOffsetMin) {
  const offset = parseTimezoneOffset(tzOffsetMin);
  const local = new Date(new Date(date).getTime() - offset * 60_000);
  return [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, '0'),
    String(local.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
