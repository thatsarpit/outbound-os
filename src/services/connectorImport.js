import { randomUUID } from 'node:crypto';
import { suppliersForLeadTags } from './settlement.js';

const phoneKey = (value) => {
  if (!value || String(value).startsWith('no-phone:')) return '';
  return String(value).replace(/\D/g, '').replace(/^00/, '');
};
const emailKey = (value) => String(value || '').trim().toLowerCase();

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
export async function importConnectorRecords(db, source, records) {
  const rows = validateConnectorRecords(records);
  return db.$transaction(async (tx) => {
    // Early single-workspace installs used both null and 1 for the same
    // workspace. Keep that compatibility local; other tenant IDs stay scoped.
    const scope = source.tenantId == null ? { OR: [{ tenantId: null }, { tenantId: 1 }] } : { tenantId: source.tenantId };
    const suppliers = await tx.supplier.findMany({ where: scope });
    const supplier = suppliers.find((s) => s.id === source.importSupplierId && s.enabled);
    if (!supplier) throw new Error('Configure an enabled source supplier before importing.');
    const leads = await tx.lead.findMany({ where: scope });
    const results = [];
    for (const row of rows) {
      const existingReceipt = await tx.connectorReceipt.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: row.externalId } } });
      if (existingReceipt) {
        results.push({ externalId: row.externalId, state: existingReceipt.state, leadId: existingReceipt.leadId, replay: true });
        continue;
      }
      const phone = phoneKey(row.mobile), email = emailKey(row.email);
      const matches = leads.filter((lead) => (phone && phoneKey(lead.mobile) === phone) || (email && emailKey(lead.email) === email));
      let reason = matches.length > 1 ? 'Multiple contacts match these identifiers.' : null;
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
          lead = await tx.lead.update({ where: { id: existing.id }, data: { ...fill, tags, originSupplierId: supplier.id } });
          leads[leads.findIndex((item) => item.id === lead.id)] = lead;
          state = 'matched';
        } else {
          lead = await tx.lead.create({ data: {
            tenantId: source.tenantId, name: row.name || row.company || 'Imported contact', mobile: phone || `no-phone:connector:${randomUUID()}`, email: email || null,
            company: row.company || null, country: row.country || null, product: row.product || null, quantity: row.quantity || null, notes: row.notes || null,
            source: source.source, poolId: source.poolId, status: 'paused', tags, originSupplierId: supplier.id,
            consumedAt: row.acquiredAt ? new Date(row.acquiredAt) : null, emailMarketingConsent: false,
          } });
          leads.push(lead); state = 'created';
        }
      }
      await tx.connectorReceipt.create({ data: { sourceId: source.id, externalId: row.externalId, leadId: reason ? null : lead.id, state, reason, recordJson: JSON.stringify(row) } });
      results.push({ externalId: row.externalId, state, leadId: reason ? null : lead.id, ...(reason ? { reason } : {}) });
    }
    await tx.webhookSource.update({ where: { id: source.id }, data: { lastReceivedAt: new Date(), totalReceived: { increment: results.filter((r) => !r.replay).length } } });
    return results;
  }, { timeout: 15000 });
}
