const fields = new Set(['status', 'minScore', 'maxScore', 'source', 'olderThanDays', 'product', 'country', 'tags', 'limit']);
export function campaignFilter(value) {
  const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  let filter = value ?? {};
  if (typeof filter === 'string') {
    try { filter = JSON.parse(filter); } catch { invalid('Target filter must be valid JSON.'); }
  }
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) invalid('Target filter must be a JSON object.');
  if (Object.hasOwn(filter, 'poolId')) invalid('Pass poolId at the top level, outside the lead filter.');
  for (const key of Object.keys(filter)) if (!fields.has(key)) invalid(`Unsupported campaign filter: ${key}.`);
  for (const key of ['source', 'product', 'country']) {
    if (filter[key] !== undefined && (typeof filter[key] !== 'string' || !filter[key].trim())) invalid(`${key} must be non-empty text.`);
  }
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    const allowed = new Set(['new', 'contacted', 'replied', 'engaged', 'closed', 'paused', 'wa_unavailable', 'wa_undelivered']);
    if (!statuses.length || statuses.some(status => !allowed.has(status))) invalid('Choose valid lead statuses.');
  }
  if (filter.tags !== undefined && !(typeof filter.tags === 'string' ||
    (Array.isArray(filter.tags) && filter.tags.every(tag => typeof tag === 'string')))) invalid('Tags must be text or a list of text values.');
  if (filter.limit !== undefined && (!Number.isSafeInteger(filter.limit) || filter.limit < 1 || filter.limit > 10000)) {
    invalid('Audience limit must be a whole number from 1 to 10000.');
  }
  for (const key of ['minScore', 'maxScore', 'olderThanDays']) {
    if (filter[key] !== undefined && (!Number.isFinite(filter[key]) || filter[key] < 0)) invalid(`${key} must be a non-negative number.`);
  }
  if (filter.minScore !== undefined && filter.maxScore !== undefined && filter.minScore > filter.maxScore) invalid('Minimum score cannot exceed maximum score.');
  return filter;
}
