import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLedger,appendBatch,nextBatch,acknowledge,due} from './ledger.mjs';

test('sleep, restart and a lost acknowledgment preserve the same purchase identities',()=>{
 let state=emptyLedger();
 const record=id=>({externalId:String(id),name:'Fixture buyer',email:'buyer@example.test'});
 state=appendBatch(state,[record(1),record(1),record(2)],'baseline');
 assert.equal(state.outbox.length,2);assert.equal(state.baseline,false);
 state=JSON.parse(JSON.stringify(state));
 const batch=nextBatch(state);
 assert.throws(()=>acknowledge(state,batch,{results:[{externalId:'1'}]}),/every purchase/);
 assert.equal(state.seen.length,0);assert.equal(state.outbox.length,2);
 state=acknowledge(state,batch,{results:[{externalId:'1',replay:true},{externalId:'2',replay:true}]});
 assert.equal(state.baseline,true);assert.equal(state.outbox.length,0);
 assert.equal(appendBatch(state,[record(1)],'live').outbox.length,0,'baseline IDs cannot be promoted by replay');
 state=appendBatch(state,[record(3)],'live');
 assert.equal(nextBatch(state)[0].mode,'live');
 assert.equal(due('2026-10-29T01:00:00Z',Date.parse('2026-10-29T08:00:00Z')),true,'wake after a long sleep is due');
 assert.equal(due('2026-10-29T01:00:00Z',Date.parse('2026-10-29T01:01:00Z')),false);
 assert.equal(due('2026-10-29T01:00:00Z',Date.parse('2026-10-28T01:00:00Z')),true,'clock correction does not stall forever');
});

test('the Chrome relay remains off until its own UI confirms the inspected seller; page scripts cannot start it',async()=>{
 const values={}, handlers={}, messages=[], tabs=[];
 const event=name=>({addListener:fn=>{handlers[name]=fn;}});
 const own='chrome-extension://fixture-relay/';
 const previousChrome=globalThis.chrome, previousFetch=globalThis.fetch;
 globalThis.chrome={
  storage:{local:{setAccessLevel:async()=>{},get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]])),set:async data=>Object.assign(values,structuredClone(data))}},
  runtime:{id:'fixture-relay',getURL:path=>own+path,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
  alarms:{get:async()=>({periodInMinutes:15}),create:async()=>{},onAlarm:event('alarm')},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  windows:{getAll:async()=>[{id:1}]},
  scripting:{executeScript:async()=>{}},
  tabs:{query:async()=>[],create:async()=>{tabs.push('create');return{id:5}},get:async()=>({id:5,status:'complete',url:'https://seller.indiamart.com/blproduct/mypurchasedbl?disp=D'}),remove:async()=>tabs.push('close'),sendMessage:async(_id,message)=>{
   messages.push(message.type);
   if(message.type==='IM_RELAY_INSPECT')return{ok:true,sellerId:'12345'};
   return{ok:true,sellerId:'12345',records:[{externalId:'1',name:'Fixture',email:'buyer@example.test'}]};
  }},
 };
 let crmCalls=0;
 globalThis.fetch=async(url,init)=>{
  if(url===own+'connection-private.json')return Response.json({url:'https://api.outboundos.space/api/webhooks/indiamart/indiamart_live',key:'f'.repeat(64)});
  assert.equal(init.headers['X-API-Key'],'f'.repeat(64));
  const body=JSON.parse(init.body);crmCalls++;
  return Response.json(url.endsWith('/health')?{ok:true}:{results:body.records.map(r=>({externalId:r.externalId}))});
 };
 try{
  await import(`./background.mjs?fixture=${Date.now()}`);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(tabs.length,0,'loading a disabled extension never reads IndiaMART');
  let replied=false;
  const denied=handlers.message({type:'START',sellerId:'12345',confirm:true},{id:'fixture-relay',tab:{id:5},url:'https://seller.indiamart.com/blproduct/mypurchasedbl'},()=>{replied=true});
  assert.equal(denied,undefined);assert.equal(replied,false);
  const call=message=>new Promise(resolve=>handlers.message(message,{id:'fixture-relay',tab:{id:99},url:own+'options.html'},resolve));
  assert.equal((await call({type:'START',sellerId:'12345',confirm:true})).ok,false);
  assert.equal((await call({type:'INSPECT'})).sellerId,'12345');
  assert.equal((await call({type:'START',sellerId:'12345',confirm:false})).ok,false);
  assert.equal((await call({type:'START',sellerId:'12345',confirm:true})).started,true);
  for(let n=0;n<50&&values.status?.state!=='ready';n++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal(values.ledger.baseline,true);assert.deepEqual(values.ledger.seen,['1']);assert.equal(crmCalls,2);
  assert.deepEqual(messages,['IM_RELAY_INSPECT','IM_RELAY_COLLECT']);
  await call({type:'PAUSE'});
  assert.equal(values.config.enabled,false);
  assert.equal((await call({type:'START',sellerId:'99999',confirm:true})).ok,false,'pinned account cannot be replaced through start');
 }finally{globalThis.chrome=previousChrome;globalThis.fetch=previousFetch;}
});
