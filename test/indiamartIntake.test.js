import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { IndiamartIntake, INDIAMART_POLICY, INDIAMART_SOURCE } from '../src/services/indiamartIntake.js';
async function fixture(run) {
  const dir=mkdtempSync(path.join(tmpdir(),'indiamart-intake-')), filename=path.join(dir,'fixture.db');
  const sql=new DatabaseSync(filename), root=new URL('../prisma/migrations/',import.meta.url);
  for(const name of readdirSync(root).sort()) {const f=new URL(`${name}/migration.sql`,root);if(existsSync(f))sql.exec(readFileSync(f,'utf8'));}
  const db=createPrismaClient(`file:${filename}`), calls=[];
  const outreach={queue:async(lead,options)=>{calls.push({lead,options});return {whatsapp:'queued',email:'queued'};},dispatchNow:async()=>{}};
  const service=new IndiamartIntake({db,outreach});
  service.kick=()=>{};
  try {
    const supplier=await db.supplier.create({data:{name:'Fixture medicals',matchTag:'fixture-medicals'}});
    const source=await db.webhookSource.create({data:{name:'Fixture IndiaMART',source:INDIAMART_SOURCE,apiKey:'fixture-key',importSupplierId:supplier.id,importTags:'fixture-medicals'}});
    const wa=await db.whatsAppAccount.create({data:{name:'Fixture sender',phone:'15555550101',enabled:true}});
    const email=await db.emailAccount.create({data:{name:'Fixture email',email:'sales@example.test',smtpHost:'smtp.example.test',smtpUser:'fixture',smtpPass:'fixture',whatsappAccountId:wa.id}});
    const policy={sourceId:source.id,sellerId:'10001',enabled:true,armedAt:new Date(Date.now()-300_000).toISOString(),whatsappAccountId:wa.id,emailAccountId:email.id,templateName:'fixture_first_touch'};
    const save=()=>db.systemConfig.upsert({where:{key:INDIAMART_POLICY},create:{key:INDIAMART_POLICY,value:JSON.stringify(policy)},update:{value:JSON.stringify(policy)}});
    await save();
    await run({db,source,service,policy,save,calls,outreach});
  } finally {await db.$disconnect();sql.close();rmSync(dir,{recursive:true,force:true});}
}
const record=(id,extra={})=>({externalId:String(id),name:'Fixture buyer',mobile:`1555500${String(id).padStart(4,'0')}`,email:`buyer${id}@example.test`,acquiredAt:new Date(Date.now()-60_000).toISOString(),...extra});

test('IndiaMART baseline and old purchases stay paused and can never become live through replay',async()=>fixture(async({db,source,service,policy,save,calls})=>{
  policy.armedAt=null;await save();
  await service.ingest(source,[record(1)],'baseline','10001');
  assert.ok((await service.policy()).armedAt);
  await service.ingest(source,[record(1)],'live','10001');
  await service.ingest(source,[record(2,{acquiredAt:'2020-01-01T00:00:00Z'})],'live','10001');
  await service.drain();
  assert.deepEqual((await db.connectorReceipt.findMany({orderBy:{id:'asc'}})).map(r=>r.liveState),['baseline','historical']);
  assert.ok((await db.lead.findMany()).every(l=>l.status==='paused'));
  assert.equal(calls.length,0);
  await assert.rejects(service.ingest(source,[record(3)],'live','99999'),/Seller/);
  assert.equal(await db.lead.count(),2);
}));

test('new purchases queue only the configured WhatsApp and email once; existing contacts are preserved',async()=>fixture(async({db,source,service,policy,calls})=>{
  const result=await service.ingest(source,[record(10)],'live','10001');
  await service.drain();await service.ingest(source,[record(10)],'live','10001');await service.drain();
  await service.ingest(source,[record(11,{mobile:record(10).mobile,email:record(10).email})],'live','10001');await service.drain();
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].options,{channels:['whatsapp','email'],whatsappAccountId:policy.whatsappAccountId,emailAccountId:policy.emailAccountId,templateName:policy.templateName});
  assert.equal((await db.lead.findUnique({where:{id:result.results[0].leadId}})).status,'new');
  assert.deepEqual((await db.connectorReceipt.findMany({orderBy:{id:'asc'}})).map(r=>r.liveState),['queued','existing_or_conflict']);
}));

test('an operator edit or pause after import prevents automatic unpausing',async()=>fixture(async({db,source,service,calls})=>{
  const result=await service.ingest(source,[record(20)],'live','10001');
  await db.lead.update({where:{id:result.results[0].leadId},data:{status:'paused',notes:'Operator reviewed this contact',updatedAt:new Date(Date.now()+1000)}});
  await service.drain();
  assert.equal(calls.length,0);
  assert.equal((await db.connectorReceipt.findFirst()).liveState,'blocked');
  assert.equal((await db.lead.findFirst()).status,'paused');
}));

test('an interruption after the atomic hand-off retains the intent for restart without importing twice',async()=>fixture(async({db,source,service,calls,outreach})=>{
  await service.ingest(source,[record(30)],'live','10001');
  const queue=outreach.queue;outreach.queue=async()=>{throw new Error('Storage unavailable');};
  await service.drain();
  assert.equal((await db.connectorReceipt.findFirst()).liveState,'queuing');
  outreach.queue=queue;
  await service.drain();
  assert.equal(calls.length,1);
  assert.equal(await db.lead.count(),1);
  assert.equal((await db.connectorReceipt.findFirst()).liveState,'queued');
}));
