import {emptyLedger,appendBatch,nextBatch,acknowledge,due} from './ledger.mjs';
const PAGE='https://seller.indiamart.com/blproduct/mypurchasedbl?disp=D';
const MATCH='https://seller.indiamart.com/blproduct/mypurchasedbl*';
const ALARM='outboundos-indiamart-15m';
let running;
async function saved() {return chrome.storage.local.get(['config','ledger','status']);}
async function connection() {
  const response=await fetch(chrome.runtime.getURL('connection-private.json'));
  if(!response.ok)throw new Error('The private Outbound OS connection file is missing.');
  const c=await response.json();
  if(c.url!=='https://api.outboundos.space/api/webhooks/indiamart/indiamart_live'||!/^\w{48,128}$/.test(c.key||''))throw new Error('Invalid CRM connection.');
  return c;
}
async function status(value) {
  await chrome.storage.local.set({status:{...value,updatedAt:new Date().toISOString()}});
  await chrome.action.setBadgeText({text:value.state==='needs_attention'?'!':value.state==='running'?'…':''});
  await chrome.action.setBadgeBackgroundColor({color:'#d97706'});
}
async function ensureAlarm() {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  if(!await chrome.alarms.get(ALARM))await chrome.alarms.create(ALARM,{periodInMinutes:15});
}
async function withPage(operation) {
  let owned=false;
  let [tab]=await chrome.tabs.query({url:MATCH});
  if(!tab){
    const windows=await chrome.windows.getAll({windowTypes:['normal']});
    if(windows.length)tab=await chrome.tabs.create({url:PAGE,active:false,windowId:windows[0].id});
    else {const window=await chrome.windows.create({url:PAGE,focused:false,state:'minimized'});tab=window.tabs[0];}
    owned=true;
  }
  try {
    for(let n=0;n<80;n++){
      const current=await chrome.tabs.get(tab.id);
      if(current.status==='complete')break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const current=await chrome.tabs.get(tab.id);
    const url=new URL(current.url||'');
    if(url.origin!=='https://seller.indiamart.com'||url.pathname!=='/blproduct/mypurchasedbl')throw new Error('Sign in to IndiaMART and open the purchased-leads page.');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    return await operation(tab.id);
  } finally {
    if(owned)try{await chrome.tabs.remove(tab.id);}catch{/* The user may have closed it. */}
  }
}
async function inspect() {
  return withPage(async tabId=>{
    const result=await chrome.tabs.sendMessage(tabId,{type:'IM_RELAY_INSPECT'});
    if(!result?.ok||!/^\d{1,20}$/.test(result.sellerId))throw new Error(result?.error||'Account unavailable.');
    await chrome.storage.local.set({inspectedSellerId:result.sellerId});
    return {sellerId:result.sellerId};
  });
}
async function crm(connection,body,suffix='') {
  const response=await fetch(connection.url+suffix,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json','X-API-Key':connection.key},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Outbound OS returned ${response.status}; retained purchases will retry.`);
  return response.json();
}
async function tick() {
  if(running)return running;
  running=(async()=>{
    let current=await saved();
    if(!current.config?.enabled)return;
    const c=await connection();
    await status({state:'running',lastCheck:current.status?.lastCheck||null,error:null});
    await chrome.storage.local.set({lastAttempt:new Date().toISOString()});
    let ledger=current.ledger||emptyLedger(), imported=0;
    const hadOutbox=ledger.outbox.length>0;
    try {
      // A maximum of four requests per drain keeps a service-worker turn short.
      const drain=async()=>{
        for(let n=0;n<4;n++){
          const batch=nextBatch(ledger);if(!batch.length)break;
          const live=await chrome.storage.local.get('config');
          if(!live.config?.enabled)throw new Error('Relay paused. Purchases remain saved.');
          const reply=await crm(c,{sellerId:current.config.sellerId,mode:batch[0].mode,
            confirmSeller:batch[0].mode==='baseline',records:batch.map(row=>row.record)});
          ledger=acknowledge(ledger,batch,reply);
          await chrome.storage.local.set({ledger});imported+=batch.length;
        }
      };
      if(ledger.outbox.length)await drain();
      if(!hadOutbox){
        const response=await withPage(tabId=>chrome.tabs.sendMessage(tabId,{type:'IM_RELAY_COLLECT',sellerId:current.config.sellerId,
          knownIds:ledger.seen,baseline:!ledger.baseline}));
        if(!response?.ok)throw new Error(response?.error||'Purchase page unavailable.');
        ledger=appendBatch(ledger,response.records,!ledger.baseline?'baseline':'live');
        await chrome.storage.local.set({ledger});
        await drain();
      }
      const lastCheck=new Date().toISOString();
      const value={state:'ready',lastCheck,error:null,imported,pending:ledger.outbox.length,baseline:ledger.baseline};
      await status(value);
      if(ledger.outbox.length||hadOutbox)await chrome.alarms.create('outboundos-indiamart-drain',{delayInMinutes:1});
      await crm(c,{state:'ready',lastCheck,error:null},'/health');
    } catch(error){
      const value={state:'needs_attention',lastCheck:current.status?.lastCheck||null,error:String(error.message).slice(0,200),pending:ledger.outbox.length};
      await status(value);
      try{await crm(c,{state:value.state,lastCheck:value.lastCheck,error:value.error},'/health');}catch{/* Preserve the local error. */}
    }
  })().catch(async()=>status({state:'needs_attention',error:'Relay could not start. Check its connection file and Chrome permissions.'})).finally(()=>{running=null});
  return running;
}
async function start(message){
  const {inspectedSellerId,config}=await chrome.storage.local.get(['inspectedSellerId','config']);
  if(message.confirm!==true||!inspectedSellerId||inspectedSellerId!==message.sellerId)throw new Error('Inspect and confirm the Panchsheel account first.');
  if(config?.sellerId&&config.sellerId!==message.sellerId)throw new Error('A different seller is already pinned. Contact the CRM administrator.');
  await connection();
  await chrome.storage.local.set({config:{enabled:true,sellerId:message.sellerId}});
  await ensureAlarm();void tick();return {started:true};
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  // Only this extension's own options/popup can control credentials or enable it.
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('options.html'))return;
  const action=async()=>{
    if(message?.type==='STATUS'){const state=await saved();return {...state,config:state.config?{enabled:state.config.enabled,sellerId:state.config.sellerId}:null};}
    if(message?.type==='INSPECT')return inspect();
    if(message?.type==='START')return start(message);
    if(message?.type==='PAUSE'){const state=await saved();await chrome.storage.local.set({config:{...state.config,enabled:false}});await chrome.action.setBadgeText({text:''});return {paused:true};}
    if(message?.type==='RUN'){void tick();return {accepted:true};}
    if(message?.type==='OPEN_LOGIN'){await chrome.tabs.create({url:PAGE});return {opened:true};}
    throw new Error('Unknown relay command.');
  };
  action().then(data=>reply({ok:true,...data}),error=>reply({ok:false,error:error.message}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if([ALARM,'outboundos-indiamart-drain'].includes(alarm.name))void tick();});
chrome.runtime.onInstalled.addListener(()=>void ensureAlarm());
chrome.runtime.onStartup.addListener(()=>{void ensureAlarm().then(()=>tick());});
void ensureAlarm().then(async()=>{const {lastAttempt,config}=await chrome.storage.local.get(['lastAttempt','config']);if(config?.enabled&&due(lastAttempt))void tick();});
