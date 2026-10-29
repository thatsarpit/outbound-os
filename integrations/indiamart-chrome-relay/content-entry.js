(()=>{
if (globalThis.__OUTBOUNDOS_IM_RELAY__) return;
globalThis.__OUTBOUNDOS_IM_RELAY__ = true;
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || !['IM_RELAY_INSPECT','IM_RELAY_COLLECT'].includes(message?.type))return;
  (async()=>{
    if(location.origin!=='https://seller.indiamart.com'||location.pathname!=='/blproduct/mypurchasedbl')throw new Error('Open the consumed purchased-leads page and sign in.');
    const html=document.documentElement.innerHTML;
    const sellerId=(document.cookie.match(/(?:^|;\s*)glid=(\d+)/)||[])[1]
      ||(html.match(/glusrid["']?\s*[:=]\s*["']?(\d+)/i)||[])[1];
    if(!sellerId)throw new Error('IndiaMART login is unavailable. Sign in in this Chrome profile.');
    if(message.type==='IM_RELAY_INSPECT')return {sellerId};
    if(sellerId!==message.sellerId)throw new Error('Seller account changed. Pause and review the relay account.');
    const known=new Set(message.knownIds || []);
    const records=await collectNew(async start=>{
      const response=await fetch('/blreact/getConsumedLeadsData',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({glusrid:sellerId,start,end:start+20}),signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw new Error(`IndiaMART purchase request failed (${response.status}).`);
      const data=await response.json();return data?.RESPONSE?.DATA?.Listing;
    },id=>known.has(id),message.baseline===true);
    return {sellerId,records};
  })().then(value=>reply({ok:true,...value}),()=>reply({ok:false,error:'IndiaMART could not be read. Open the purchased page, check login/account and retry. The cursor is unchanged.'}));
  return true;
});

})();
