import { randomUUID } from 'node:crypto';
import { suppliersForLeadTags } from './settlement.js';

const phoneKey = (value) => {
  if (!value || String(value).startsWith('no-phone:')) return '';
  return String(value).replace(/\D/g, '').replace(/^00/, '');
};
const emailKey = (value) => String(value || '').trim().toLowerCase();
const leadFields = {
  id: true, mobile: true, email: true, tags: true, originSupplierId: true,
  poolId: true, updatedAt: true, company: true, country: true, product: true, quantity: true, notes: true,
};

async function findCandidates(tx, source, rows) {
  const phones = [...new Set(rows.map((row) => phoneKey(row.mobile)).filter(Boolean))];
  const emails = [...new Set(rows.map((row) => emailKey(row.email)).filter(Boolean))];
  const parameters = source.tenantId == null ? [] : [source.tenantId];
  const scope = source.tenantId == null ? '(tenantId IS NULL OR tenantId = 1)' : 'tenantId = ?';
  const predicates = [];
  if (phones.length) {
    predicates.push(`SELECT id, 'phone' AS kind, phone AS identifier FROM normalised WHERE phone IN (${phones.map(() => '?').join(',')})`);
    parameters.push(...phones);
  }
  if (emails.length) {
    predicates.push(`SELECT id, 'email' AS kind, email AS identifier FROM normalised WHERE email IN (${emails.map(() => '?').join(',')})`);
    parameters.push(...emails);
  }
  // Do the workspace scan in SQLite and return only two IDs per identifier:
  // two matches already prove a conflict, even when thousands share an email.
  // Ordinary formatting takes the cheap REPLACE path. The recursive fallback
  // retains phoneKey's behaviour for unusual historical punctuation or text.
  const normalisation = phones.length ? `stripped AS (
      SELECT id, LOWER(TRIM(email)) AS email,
        CASE WHEN SUBSTR(mobile, 1, 9) = 'no-phone:' THEN '' ELSE
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            mobile, '+', ''), ' ', ''), '(', ''), ')', ''), '-', ''), '.', ''), CHAR(9), ''), CHAR(10), ''), CHAR(13), '')
        END AS phone
      FROM Lead WHERE ${scope}
    ), legacy_phone(id, rest, digits) AS (
      SELECT id, phone, '' FROM stripped WHERE phone GLOB '*[^0-9]*'
      UNION ALL
      SELECT id, SUBSTR(rest, 2), digits || CASE WHEN SUBSTR(rest, 1, 1) GLOB '[0-9]' THEN SUBSTR(rest, 1, 1) ELSE '' END
      FROM legacy_phone WHERE rest <> ''
    ), normalised AS (
      SELECT stripped.id, stripped.email,
        CASE WHEN SUBSTR(COALESCE(legacy_phone.digits, stripped.phone), 1, 2) = '00'
          THEN SUBSTR(COALESCE(legacy_phone.digits, stripped.phone), 3)
          ELSE COALESCE(legacy_phone.digits, stripped.phone) END AS phone
      FROM stripped LEFT JOIN legacy_phone ON legacy_phone.id = stripped.id AND legacy_phone.rest = ''
    )` : `normalised AS (SELECT id, LOWER(TRIM(email)) AS email FROM Lead WHERE ${scope})`;
  const candidateRows = await tx.$queryRawUnsafe(`
    WITH RECURSIVE ${normalisation}, matches AS (${predicates.join(' UNION ALL ')}), ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY kind, identifier ORDER BY id) AS position FROM matches
    ) SELECT DISTINCT id FROM ranked WHERE position <= 2`, ...parameters);
  const ids = new Set(candidateRows.map((row) => Number(row.id)));
  let uncertainEmails = false;
  if (emails.length) {
    // SQLite LOWER/TRIM do not implement JavaScript's Unicode case/whitespace
    // rules. Keep that legacy matching exact without hydrating an unbounded
    // exceptional set; an overflow requires review rather than a guessed merge.
    const unusual = await tx.$queryRawUnsafe(`SELECT id, email FROM Lead WHERE ${scope} AND email GLOB '*[^ -~]*' ORDER BY id LIMIT 201`, ...(source.tenantId == null ? [] : [source.tenantId]));
    uncertainEmails = unusual.length > 200;
    if (!uncertainEmails) {
      const counts = new Map();
      for (const row of unusual) {
        const key = emailKey(row.email);
        if (emails.includes(key) && (counts.get(key) || 0) < 2) {
          ids.add(Number(row.id));
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }
  const leads = ids.size ? await tx.lead.findMany({ where: { id: { in: [...ids] } }, select: leadFields }) : [];
  return { leads: new Map(leads.map((lead) => [lead.id, lead])), uncertainEmails };
}

export function validateConnectorRecords(records) {
  if (!Array.isArray(records) || !records.length || records.length > 50) throw new Error('Supply 1–50 records.');
  const limits = { externalId: 200, name: 200, mobile: 40, email: 254, company: 200, country: 100, product: 1000, quantity: 100, notes: 4000, acquiredAt: 40 };
  return records.map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid record.');
    const row = {};
    for (const [key, max] of Object.entries(limits)) {
      if (record[key] !== undefined && (typeof record[key] !== 'string' || record[key].length > max)) throw new Error(`Invalid ${key}.`);
      row[key] = String(record[key] || '').trim();
    }
    if (!row.externalId || (!phoneKey(row.mobile) && !row.email)) throw new Error('Every record needs a source ID and phone or email.');
    if (row.mobile && (!/^\+?[0-9 ()\-.]+$/.test(row.mobile) || phoneKey(row.mobile).length < 8 || phoneKey(row.mobile).length > 15)) throw new Error('Use an international phone number.');
    if (row.email && (row.email.indexOf('@') < 1 || /\s/u.test(row.email) || row.email.split('@').length !== 2)) throw new Error('Invalid email.');
    if (row.acquiredAt && !Number.isFinite(Date.parse(row.acquiredAt))) throw new Error('Invalid acquisition time.');
    return row;
  });
}

/** One transaction per bounded batch. No outreach service is imported here. */
export async function importConnectorRecords(db, source, records, { intakeMode, liveAfter } = {}) {
  const rows = validateConnectorRecords(records);
  return db.$transaction(async (tx) => {
    // Early single-workspace installs used both null and 1 for the same
    // workspace. Keep that compatibility local; other tenant IDs stay scoped.
    const scope = source.tenantId == null ? { OR: [{ tenantId: null }, { tenantId: 1 }] } : { tenantId: source.tenantId };
    const receipts = new Map((await tx.connectorReceipt.findMany({
      where: { sourceId: source.id, externalId: { in: rows.map((row) => row.externalId) } },
      select: { externalId: true, state: true, leadId: true },
    })).map((receipt) => [receipt.externalId, receipt]));
    const pending = rows.filter((row) => !receipts.has(row.externalId));
    const suppliers = pending.length ? await tx.supplier.findMany({ where: scope, select: { id: true, enabled: true, matchTag: true, matchPriority: true, name: true } }) : [];
    const supplier = suppliers.find((s) => s.id === source.importSupplierId && s.enabled);
    // A replay-only batch never needs to scan contacts or active suppliers.
    if (pending.length && !supplier) throw new Error('Configure an enabled source supplier before importing.');
    const { leads, uncertainEmails } = pending.length ? await findCandidates(tx, source, pending) : { leads: new Map(), uncertainEmails: false };
    const results = [];
    for (const row of rows) {
      const existingReceipt = receipts.get(row.externalId);
      if (existingReceipt) {
        results.push({ externalId: row.externalId, state: existingReceipt.state, leadId: existingReceipt.leadId, replay: true });
        continue;
      }
      // Accepted source IDs remain replayable after a supplier is disabled.
      // Only a new import needs a currently enabled attribution target.
      if (!supplier) throw new Error('Configure an enabled source supplier before importing.');
      const phone = phoneKey(row.mobile), email = emailKey(row.email);
      const matches = [...leads.values()].filter((lead) => (phone && phoneKey(lead.mobile) === phone) || (email && emailKey(lead.email) === email));
      let reason = uncertainEmails && email ? 'Historical email identifiers require review before matching.' : matches.length > 1 ? 'Multiple contacts match these identifiers.' : null;
      const existing = matches[0];
      const owners = existing ? suppliersForLeadTags(existing.tags, suppliers.map((owner) => ({ ...owner, enabled: true }))) : [];
      if (existing && ((existing.originSupplierId && existing.originSupplierId !== supplier.id) || owners.some((owner) => owner.id !== supplier.id))) reason = 'Existing supplier attribution differs.';
      if (existing && ((phone && phoneKey(existing.mobile) && phoneKey(existing.mobile) !== phone) || (email && emailKey(existing.email) && emailKey(existing.email) !== email))) reason = 'Phone and email do not identify the same contact.';
      if (existing && existing.poolId !== (source.poolId || null)) reason = 'Existing contact belongs to a different lead pool.';
      let lead = existing, state = 'conflict';
      if (!reason) {
        const tags = [...new Set([...(existing?.tags || '').split(','), ...(source.importTags || '').split(','), supplier.matchTag || ''].map((tag) => tag.trim()).filter(Boolean))].join(', ');
        if (existing) {
          const fill = {};
          for (const key of ['email', 'company', 'country', 'product', 'quantity', 'notes']) if (!existing[key] && row[key]) fill[key] = row[key];
          if (!phoneKey(existing.mobile) && phone) fill.mobile = phone;
          lead = await tx.lead.update({ where: { id: existing.id }, data: { ...fill, tags, originSupplierId: supplier.id }, select: leadFields });
          leads.set(lead.id, lead);
          state = 'matched';
        } else {
          lead = await tx.lead.create({ data: {
            tenantId: source.tenantId, name: row.name || row.company || 'Imported contact', mobile: phone || `no-phone:connector:${randomUUID()}`, email: email || null,
            company: row.company || null, country: row.country || null, product: row.product || null, quantity: row.quantity || null, notes: row.notes || null,
            source: source.source, poolId: source.poolId, status: 'paused', tags, originSupplierId: supplier.id,
            consumedAt: row.acquiredAt ? new Date(row.acquiredAt) : null, emailMarketingConsent: false,
          }, select: leadFields });
          leads.set(lead.id, lead); state = 'created';
        }
      }
      const acquired = Date.parse(row.acquiredAt);
      const recent = Number.isFinite(acquired) && acquired >= Date.parse(liveAfter)
        && acquired <= Date.now() + 60_000 && acquired >= Date.now() - 3600_000;
      const liveState = !intakeMode ? 'none' : intakeMode === 'baseline' ? 'baseline'
        : state !== 'created' ? 'existing_or_conflict' : recent ? 'pending' : 'historical';
      const receipt = await tx.connectorReceipt.create({ data: { liveState,
        ...(liveState === 'pending' ? { liveLeadVersion: lead.updatedAt } : {}), sourceId: source.id, externalId: row.externalId, leadId: reason ? null : lead.id, state, reason, recordJson: JSON.stringify(row) }, select: { externalId: true, state: true, leadId: true } });
      receipts.set(row.externalId, receipt);
      results.push({ externalId: row.externalId, state, leadId: reason ? null : lead.id, ...(reason ? { reason } : {}) });
    }
    await tx.webhookSource.update({ where: { id: source.id }, data: { lastReceivedAt: new Date(), totalReceived: { increment: results.filter((r) => !r.replay).length } } });
    return results;
  }, { timeout: 15000 });
}
