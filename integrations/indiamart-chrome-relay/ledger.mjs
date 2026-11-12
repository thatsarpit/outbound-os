export const emptyLedger = () => ({ baseline: false, seen: [], outbox: [], lastSuccess: null });
export function appendBatch(ledger, records, mode) {
  if (!['baseline','live'].includes(mode)) throw new Error('Invalid intake mode.');
  const known=new Set([...ledger.seen,...ledger.outbox.map(row=>row.record.externalId)]);
  const added=records.filter(record=>{if(known.has(record.externalId))return false;known.add(record.externalId);return true});
  return {...ledger,outbox:[...ledger.outbox,...added.map(record=>({mode,record}))]};
}
export function nextBatch(ledger) {
  if(!ledger.outbox.length)return [];
  return ledger.outbox.filter(row=>row.mode===ledger.outbox[0].mode).slice(0,21);
}
export function acknowledge(ledger,batch,response,now=new Date().toISOString()) {
  if(!Array.isArray(response?.results) || response.results.length!==batch.length
    ||batch.some(row=>!response.results.some(receipt=>receipt.externalId===row.record.externalId)))throw new Error('CRM did not acknowledge every purchase; progress retained.');
  const ids=new Set(batch.map(row=>row.record.externalId));
  return {...ledger,baseline:ledger.baseline||batch[0]?.mode==='baseline',
    seen:[...new Set([...ledger.seen,...ids])].slice(-5000),
    outbox:ledger.outbox.filter(row=>!ids.has(row.record.externalId)),lastSuccess:now};
}
export function due(lastAttempt,now=Date.now()) {
  return !lastAttempt || !Number.isFinite(Date.parse(lastAttempt)) || now<Date.parse(lastAttempt) || now-Date.parse(lastAttempt)>=15*60_000;
}
