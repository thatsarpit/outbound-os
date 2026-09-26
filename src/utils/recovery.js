function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeRecoverySince({
  previousHeartbeat,
  now = new Date(),
  initialLookbackHours = 24,
  overlapMinutes = 15,
} = {}) {
  const current = validDate(now) || new Date();
  const previous = validDate(previousHeartbeat);
  let base = previous || new Date(current.getTime() - initialLookbackHours * 60 * 60 * 1000);
  if (base > current) base = current;
  return new Date(base.getTime() - overlapMinutes * 60 * 1000);
}

export function isWakeGap(previousTickMs, nowMs, thresholdMs) {
  return Number.isFinite(previousTickMs)
    && Number.isFinite(nowMs)
    && Number.isFinite(thresholdMs)
    && nowMs - previousTickMs >= thresholdMs;
}
