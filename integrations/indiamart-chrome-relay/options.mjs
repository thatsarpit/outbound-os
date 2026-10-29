const $=id=>document.getElementById(id);
let sellerId;
async function call(type,extra={}){const result=await chrome.runtime.sendMessage({type,...extra});if(!result?.ok)throw new Error(result?.error||'Relay unavailable.');return result;}
async function refresh(){try{
 const result=await call('STATUS'),s=result.status||{};
 $('run').disabled=!result.config?.enabled;
 $('pause').disabled=!result.config?.enabled;
 $('status').textContent=[`Relay: ${result.config?.enabled?'enabled':'paused / not started'}`,`State: ${s.state||'not started'}`,
 `Last successful check: ${s.lastCheck?new Date(s.lastCheck).toLocaleString():'none'}`,
 `Pending imports: ${result.ledger?.outbox?.length||0}`,s.error||''].filter(Boolean).join('\n');
 if(result.config?.sellerId&&!sellerId){sellerId=result.config.sellerId;$('account').textContent=`Pinned seller ID: ${sellerId}`;}
}catch(error){$('status').textContent=error.message;}}
function ready(){$('start').disabled=!sellerId||!$('confirm').checked;}
$('confirm').addEventListener('change',ready);
for(const [id,type]of [['login','OPEN_LOGIN'],['run','RUN'],['pause','PAUSE']])$(id).addEventListener('click',async()=>{try{await call(type);await refresh();}catch(error){$('status').textContent=error.message;}});
$('inspect').addEventListener('click',async()=>{try{const result=await call('INSPECT');sellerId=result.sellerId;$('account').textContent=`Signed-in seller ID: ${sellerId}. Confirm this is Panchsheel Medicals.`;ready();}catch(error){$('account').textContent=error.message;}});
$('start').addEventListener('click',async()=>{try{await call('START',{sellerId,confirm:$('confirm').checked});await refresh();}catch(error){$('status').textContent=error.message;}});
void refresh();setInterval(()=>void refresh(),3000);
