const text = (value, max) => String(value ?? '').trim().slice(0, max);
export function purchaseTime(value) {
  const raw = String(value || '');
  if (!/^\d{14}$/.test(raw)) throw new Error('Purchase time is missing or invalid.');
  const iso = `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(8,10)}:${raw.slice(10,12)}:${raw.slice(12,14)}+05:30`;
  const date = new Date(iso);
  if (!Number.isFinite(+date) || new Date(+date + 19800_000).toISOString().replace(/[-:T]/g, '').slice(0,14) !== raw)
    throw new Error('Purchase time is invalid.');
  return date.toISOString();
}
export function mapPurchase(row) {
  const id = String(row.ETO_LEAD_PUR_ID || '');
  if (!/^\d{1,100}$/.test(id)) throw new Error('Stable purchase ID is missing.');
  let enrichment = {};
  try { enrichment = typeof row.ENRICHMENTINFO === 'string' ? JSON.parse(row.ENRICHMENTINFO) : row.ENRICHMENTINFO || {}; } catch { /* Keep the supplied quantity below. */ }
  const record = {
    externalId: id, acquiredAt: purchaseTime(row.PURCHASED_DATE),
    name: text(row.BUYER_NAME, 200), company: text(row.GLUSR_COMPANY, 200),
    country: text(row.GLUSR_COUNTRY || row.FK_GL_COUNTRY_ISO, 100),
    mobile: text(row.GLUSR_MOBILE || row.GLUSR_USR_PH_MOBILE_ALT || row.GLUSR_PHONE, 40),
    email: text(row.GLUSR_USR_EMAIL || row.GLUSR_USR_EMAIL_ALT, 254),
    product: text(row.ETO_OFR_TITLE, 1000),
    quantity: text([row.ETO_OFR_QTY || enrichment.Quantity, row.ETO_OFR_QTY_UNIT].filter(Boolean).join(' '), 100),
    notes: text([row.ETO_OFR_DESC, row.GLUSR_CITY, row.GLUSR_STATE, row.GLUSR_ADDRESS,
      `IndiaMART enquiry: ${text(row.ETO_OFR_DISPLAY_ID,100)}; purchase: ${id}`].filter(Boolean).join('\n'), 4000),
  };
  // IndiaMART's mobile field commonly includes brackets, spaces and +(cc).
  // Keep its international country prefix and do not guess a missing one.
  record.mobile = record.mobile.replace(/[^\d+]/g, '').replace(/^00/, '+');
  if (record.mobile && !/^\+?\d{8,15}$/.test(record.mobile)) throw new Error('Purchase has an invalid phone number.');
  if (record.email && !/^[^\s@]+@[^\s@]+$/.test(record.email)) record.email = '';
  if (!record.mobile && !record.email) throw new Error('Purchase has no usable contact.');
  return record;
}

// Stop only at a known purchase ID. Row numbers are positions, not identities.
export async function collectNew(fetchPage, known, baseline, maxPages = 20) {
  const unique = new Map();
  for (let page = 0; page < maxPages; page++) {
    const start = page * 21 + 1;
    const rows = await fetchPage(start);
    if (!Array.isArray(rows) || !rows.length || String(rows[0].RN) !== String(start)) {
      throw new Error('Purchase page unavailable or misaligned; keep the ledger unchanged and retry.');
    }
    let anchor = false;
    for (const row of rows) {
      const record = mapPurchase(row);
      if (known(record.externalId)) anchor = true;
      else unique.set(record.externalId, record);
    }
    if (baseline || anchor || rows.length < 21) return [...unique.values()];
  }
  throw new Error('More than 420 unseen purchases; reconcile the gap before advancing.');
}
