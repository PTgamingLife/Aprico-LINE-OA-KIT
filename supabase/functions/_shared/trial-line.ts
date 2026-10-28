const WEBHOOK='https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-trial-webhook';
const ASSISTANT='https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-assistant';
export function trialLine(token:string,fetcher:typeof fetch=fetch){
 return async(path:string,method='GET',body?:unknown,image:boolean|'image/jpeg'=false,missing=false)=>{
  if(!path.startsWith('/v2/bot/')||path.includes('..')||path.includes('://'))throw Error('trial_invalid_line_path');
  const r=await fetcher((image?'https://api-data.line.me':'https://api.line.me')+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':image?(image==='image/jpeg'?'image/jpeg':'image/png'):'application/json'}:{})},body:body?(image?body as Uint8Array:JSON.stringify(body)):undefined,redirect:'error',signal:AbortSignal.timeout(12000)});
  if(missing&&r.status===404)return null;if(!r.ok)throw Error(`trial_line_${r.status}`);const text=await r.text();return text?JSON.parse(text):{};
 };
}
let infoCache:{until:number;value:any}|undefined;
export async function previewPlatform(token:string,secret:string,fetcher:typeof fetch=fetch){
 if(!token||!secret)return{available:false,reason:'trial_platform_not_configured'};
 if(fetcher===fetch&&infoCache&&infoCache.until>Date.now())return infoCache.value;
 const call=trialLine(token,fetcher),verified=await fetcher('https://api.line.me/v2/oauth/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({access_token:token}),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!verified.ok)return{available:false,reason:'trial_platform_token_invalid'};const v=await verified.json();if(String(v.client_id)!=='2010626491')return{available:false,reason:'trial_platform_channel_mismatch'};
 const bot=await call('/v2/bot/info'),webhook=await call('/v2/bot/channel/webhook/endpoint');
 let integrated=false;
 if(webhook.endpoint===ASSISTANT){try{const health=await fetcher(ASSISTANT,{redirect:'error',signal:AbortSignal.timeout(10000)});integrated=health.ok&&(await health.json()).trialChatReady===true;}catch{/* Keep URI-only preview if integration is temporarily unavailable. */}}
 const approved=!webhook.endpoint||webhook.endpoint===WEBHOOK||webhook.endpoint===ASSISTANT;
 const value={available:approved,reason:approved?'':'trial_existing_webhook',botName:bot.displayName,basicId:bot.basicId,webhookReady:webhook.endpoint===WEBHOOK||integrated,webhookActive:webhook.active===true,chatRepliesAvailable:integrated&&webhook.active===true};
 if(fetcher===fetch)infoCache={until:Date.now()+30000,value};return value;
}
export async function ensureTrialWebhook(token:string,fetcher:typeof fetch=fetch){
 const call=trialLine(token,fetcher),current=await call('/v2/bot/channel/webhook/endpoint');if(current.endpoint&&current.endpoint!==WEBHOOK)throw Error('trial_existing_webhook');
 if(!current.endpoint){const test=await call('/v2/bot/channel/webhook/test','POST',{endpoint:WEBHOOK});if(test.success!==true)throw Error('trial_webhook_test_failed');await call('/v2/bot/channel/webhook/endpoint','PUT',{endpoint:WEBHOOK});}
 const actual=await call('/v2/bot/channel/webhook/endpoint');return{active:actual.active===true};
}
export async function validLineSignature(raw:Uint8Array,signature:string,secret:string){if(!secret||!signature)return false;try{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);return await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),raw);}catch{return false;}}
