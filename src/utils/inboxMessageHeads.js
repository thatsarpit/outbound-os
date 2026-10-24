// Keep the public queue and SQL head scan on the same visibility contract.
export const INBOX_HIDDEN_MESSAGE_STATUSES = ['queued', 'cancelled', 'failed', 'permanently_failed'];
export const INBOX_VISIBLE_MESSAGE_WHERE = { AND: [{ OR: [
  { status: { notIn: INBOX_HIDDEN_MESSAGE_STATUSES } },
  { channel: 'whatsapp', direction: 'outbound', OR: [{ waMessageId: { not: null } }, { idempotencyKey: { startsWith: 'manual-wa:' } }] },
  { channel: 'email', direction: 'outbound', sentAt: { not: null }, providerDeliveryStatus: { in: ['hard_bounce', 'invalid', 'blocked', 'error'] } },
] }] };

const placeholders = values => values.map(() => '?').join(',');
const milliseconds = column => `CASE WHEN typeof("${column}") IN ('integer', 'real') THEN "${column}" ELSE CAST(ROUND((julianday("${column}") - 2440587.5) * 86400000) AS INTEGER) END`;
const eventTime = `CASE WHEN direction = 'inbound' THEN COALESCE(${milliseconds('providerCreatedAt')}, ${milliseconds('sentAt')}, ${milliseconds('createdAt')}, 0) ELSE COALESCE(${milliseconds('sentAt')}, ${milliseconds('createdAt')}, 0) END`;

/** Select at most two heads per authorized lead; never hydrate whole histories. */
export async function inboxMessageHeads(db, leadIds, channel = null) {
  if (!leadIds.length) return { visible: new Map(), actionable: new Map() };
  if (leadIds.length > 400 || leadIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid inbox head batch');
  if (channel !== null && !['whatsapp', 'email', 'imessage', 'telegram'].includes(channel)) throw new Error('Invalid inbox channel');
  const rows = await db.$queryRawUnsafe(`WITH visible AS (
    SELECT id, leadId, ${eventTime} AS eventAt,
      CASE WHEN (direction = 'outbound' AND status IN ('sent', 'delivered', 'read'))
        OR (direction = 'inbound' AND (channel != 'email' OR emailInboundKind = 'human' OR (emailInboundKind IS NULL AND status != 'partial')))
        THEN 1 ELSE 0 END AS actionable
    FROM Message WHERE leadId IN (${placeholders(leadIds)}) ${channel ? 'AND channel = ?' : ''}
      AND (status NOT IN (${placeholders(INBOX_HIDDEN_MESSAGE_STATUSES)})
        OR (channel = 'whatsapp' AND direction = 'outbound' AND (waMessageId IS NOT NULL OR idempotencyKey LIKE 'manual-wa:%'))
        OR (channel = 'email' AND direction = 'outbound' AND sentAt IS NOT NULL AND providerDeliveryStatus IN ('hard_bounce', 'invalid', 'blocked', 'error')))
  ), ranked AS (
    SELECT id, leadId, actionable,
      ROW_NUMBER() OVER (PARTITION BY leadId ORDER BY eventAt DESC, id DESC) AS visibleRank,
      ROW_NUMBER() OVER (PARTITION BY leadId, actionable ORDER BY eventAt DESC, id DESC) AS actionableRank
    FROM visible
  ) SELECT id, leadId, actionable, visibleRank, actionableRank FROM ranked
    WHERE visibleRank = 1 OR (actionable = 1 AND actionableRank = 1)`,
  ...leadIds, ...(channel ? [channel] : []), ...INBOX_HIDDEN_MESSAGE_STATUSES);
  const messages = rows.length ? await db.message.findMany({ where: { id: { in: rows.map(row => Number(row.id)) } },
    select: { id: true, leadId: true, direction: true, channel: true, emailInboundKind: true, status: true, createdAt: true, sentAt: true, providerCreatedAt: true } }) : [];
  const byId = new Map(messages.map(message => [message.id, message]));
  const visible = new Map(), actionable = new Map();
  for (const row of rows) {
    const message = byId.get(Number(row.id));
    if (!message) continue;
    if (Number(row.visibleRank) === 1) visible.set(Number(row.leadId), message);
    if (Number(row.actionable) === 1 && Number(row.actionableRank) === 1) actionable.set(Number(row.leadId), message);
  }
  return { visible, actionable };
}
