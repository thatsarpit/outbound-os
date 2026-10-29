import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPurchase,purchaseTime,collectNew } from './records.mjs';
const row=(id,rn=id)=>({ETO_LEAD_PUR_ID:String(id),RN:String(rn),PURCHASED_DATE:'20261029090000',BUYER_NAME:'Fixture buyer',GLUSR_MOBILE:'+(1)-555-550-0101',GLUSR_USR_EMAIL:'buyer@example.test',ETO_OFR_TITLE:'Fixture product'});
test('source records preserve stable purchase identity and interpret IndiaMART time in India',()=>{
 const r=mapPurchase(row(1));assert.equal(r.externalId,'1');assert.equal(r.mobile,'+15555500101');assert.equal(r.acquiredAt,'2026-10-29T03:30:00.000Z');
 assert.throws(()=>mapPurchase({...row(1),ETO_LEAD_PUR_ID:''}),/purchase ID/);
 for(const value of ['20260230090000','invalid','20261301000000'])assert.throws(()=>purchaseTime(value));
});
test('baseline reads one page without a historical crawl; known IDs survive changed row positions',async()=>{
 let requests=0;
 const page=Array.from({length:21},(_,i)=>row(100+i,i+1));
 const baseline=await collectNew(async()=>{requests++;return page},()=>false,true);assert.equal(baseline.length,21);assert.equal(requests,1);
 const fresh=await collectNew(async()=>[row(999,1),...page.slice(0,20).map((r,i)=>({...r,RN:String(i+2)}))],id=>id==='100',false);
 assert.equal(fresh[0].externalId,'999');assert.equal(requests,1);
});
test('page failures and bounded gaps do not return a partial batch to advance the ledger',async()=>{
 await assert.rejects(collectNew(async()=>undefined,()=>false,false),/unavailable/);
 for(const later of [undefined,[],[row(1,1)]]) {
  await assert.rejects(collectNew(async start=>start===1?Array.from({length:21},(_,i)=>row(i+1,i+1)):later,()=>false,false),/ledger unchanged/);
 }
 await assert.rejects(collectNew(async start=>Array.from({length:21},(_,i)=>row(start+i,start+i)),()=>false,false),/420/);
});
