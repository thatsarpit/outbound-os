import { chromium } from 'playwright-core';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { collectNew } from './records.mjs';

process.umask(0o077);
const stateDir = process.env.STATE_DIR || '/state';
mkdirSync(stateDir, { recursive: true });
const db = new DatabaseSync(`${stateDir}/intake.db`);
chmodSync(`${stateDir}/intake.db`, 0o600);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,mode TEXT NOT NULL,record TEXT NOT NULL);`);
const read = key => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
const write = (key, value) => db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && a.length >= 32 && a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const status = { running: false, state: 'starting', lastCheck: null, error: null, observedSellerId: null, lastImported: 0 };
const pageUrl = 'https://seller.indiamart.com/blproduct/mypurchasedbl?disp=D';
const children = [];
function launch(cmd,args) { const p=spawn(cmd,args,{stdio:'ignore'});children.push(p);p.on('error',()=>{status.error='Browser display could not start.'});return p; }
async function startDisplay() {
if (process.env.START_DISPLAY !== 'false') {
  launch('Xvfb',[':99','-screen','0','1280x800x24','-nolisten','tcp']);
  for(let n=0;n<50&&!existsSync('/tmp/.X11-unix/X99');n++)await new Promise(resolve=>setTimeout(resolve,100));
  launch('x11vnc',['-display',':99','-forever','-shared','-nopw','-localhost','-rfbport','5900','-quiet']);
  launch('websockify',['--web=/usr/share/novnc/','6080','127.0.0.1:5900']);
}
}
const displayReady=startDisplay();
let context, page;
async function browserPage() {
  await displayReady;
  if (!context) {
    context=await chromium.launchPersistentContext(`${stateDir}/profile`, {
      executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:false,
      viewport:{width:1280,height:800}, env:{...process.env,DISPLAY:':99'},
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'],
    });
    context.on('close',()=>{context=null;page=null});
    page=context.pages()[0] || await context.newPage();
    await page.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:45000});
  }
  return page;
}
async function sendOutbox() {
  const rows=db.prepare('SELECT * FROM outbox ORDER BY rowid LIMIT 21').all();
  if (!rows.length)return;
  const mode=rows[0].mode;
  const batch=rows.filter(row=>row.mode===mode);
  const target=process.env.INTAKE_URL;
  if (!target || !process.env.SOURCE_KEY)throw new Error('CRM intake is not configured.');
  const url=new URL(target);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password)throw new Error('Invalid intake URL.');
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
    headers:{'Content-Type':'application/json','X-API-Key':process.env.SOURCE_KEY},
    body:JSON.stringify({sellerId:process.env.EXPECTED_SELLER_ID,mode,records:batch.map(row=>JSON.parse(row.record))})});
  if (!response.ok)throw new Error(`CRM intake failed (${response.status}); purchase IDs retained for retry.`);
  const result=await response.json();
  if (!Array.isArray(result.results) || result.results.length!==batch.length
    || batch.some(row=>!result.results.some(receipt=>receipt.externalId===row.id)))throw new Error('CRM did not acknowledge every purchase.');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of batch) { db.prepare('INSERT OR IGNORE INTO seen VALUES (?)').run(row.id);db.prepare('DELETE FROM outbox WHERE id=?').run(row.id); }
    if(mode==='baseline')write('baseline','complete');
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  status.lastImported+=batch.length;
}
async function poll() {
  if(status.running)return;
  status.running=true;status.error=null;status.lastImported=0;
  try {
    const p=await browserPage();
    const navigation=await p.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:45000});
    if(navigation?.status()===403)throw new Error('IndiaMART refused access from this host (HTTP 403). Use official access or an authorized browser.');
    if(new URL(p.url()).hostname!=='seller.indiamart.com')throw new Error('Sign in to IndiaMART in the private browser.');
    const sellerId=await p.evaluate(()=>{
      const html=document.documentElement.innerHTML;
      return (document.cookie.match(/(?:^|;\s*)glid=(\d+)/)||[])[1]
        ||(html.match(/glusrid["']?\s*[:=]\s*["']?(\d+)/i)||[])[1] || null;
    });
    status.observedSellerId=sellerId;
    if(!sellerId)throw new Error('Sign in to IndiaMART in the private browser.');
    if(!process.env.EXPECTED_SELLER_ID)throw new Error('Confirm the seller account before enabling intake.');
    if(sellerId!==process.env.EXPECTED_SELLER_ID)throw new Error('Seller account differs from the configured account; intake stopped.');
    while(db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n)await sendOutbox();
    const baseline=read('baseline')!=='complete';
    const records=await collectNew(async start=>{
      return p.evaluate(async({sellerId,start})=>{
        const response=await fetch('/blreact/getConsumedLeadsData',{method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
          body:JSON.stringify({glusrid:sellerId,start,end:start+20}),signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error('Purchase API unavailable.');
        const json=await response.json();
        return json?.RESPONSE?.DATA?.Listing;
      },{sellerId,start});
    },id=>Boolean(db.prepare('SELECT 1 FROM seen WHERE id=?').get(id)),baseline);
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const record of records)db.prepare('INSERT OR IGNORE INTO outbox VALUES (?,?,?)').run(record.externalId,baseline?'baseline':'live',JSON.stringify(record));
      db.exec('COMMIT');
    } catch(error){db.exec('ROLLBACK');throw error;}
    while(db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n)await sendOutbox();
    status.state='ready';status.lastCheck=new Date().toISOString();
  } catch(error){status.state='needs_attention';status.error=String(error.message).slice(0,200);}
  finally {
    status.running=false;
    if(process.env.INTAKE_URL && process.env.SOURCE_KEY) {
      try { await fetch(process.env.INTAKE_URL+'/health',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),
        headers:{'Content-Type':'application/json','X-API-Key':process.env.SOURCE_KEY},
        body:JSON.stringify({state:status.state,error:status.error,lastCheck:status.lastCheck})}); } catch { /* The private status API retains the local error. */ }
    }
  }
}
const publicStatus=()=>({...status,baseline:read('baseline')==='complete',pending:Number(db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n),intervalMinutes:15});
createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.url==='/healthz'){res.end(JSON.stringify({ok:true}));return;}
  if(!equal(req.headers.authorization,`Bearer ${process.env.CONTROL_TOKEN || ''}`)){res.writeHead(401);res.end('{}');return;}
  if(req.url==='/status'&&req.method==='GET'){res.end(JSON.stringify(publicStatus()));return;}
  if(req.url==='/run'&&req.method==='POST'){void poll();res.writeHead(202);res.end(JSON.stringify({accepted:true}));return;}
  res.writeHead(404);res.end('{}');
}).listen(8085,'0.0.0.0');
// Keep the window available for the owner's normal OTP/CAPTCHA sign-in. A
// failed login never advances a purchase cursor or triggers customer outreach.
setTimeout(()=>void poll(),3000);
setInterval(()=>void poll(),15*60_000);
async function close(){await context?.close();children.forEach(p=>p.kill());db.close();process.exit();}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
