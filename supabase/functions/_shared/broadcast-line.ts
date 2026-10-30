import {broadcastCard,type BroadcastConfig} from '../../../src/broadcast-model.ts';
export class BroadcastLineError extends Error{code:string;status:number;constructor(code:string,status=0){super(code);this.code=code;this.status=status;}}
export function broadcastLine(token:string,fetcher:typeof fetch=fetch){
 async function call(path:string,body?:unknown,retryKey?:string){
  const allowed=['/info','/message/quota','/message/quota/consumption','/message/validate/broadcast','/message/validate/push','/message/broadcast','/message/push'];
  if(!allowed.includes(path)&&!/^\/insight\/followers\?date=\d{8}$/.test(path))throw new BroadcastLineError('invalid_line_path');
  const r=await fetcher('https://api.line.me/v2/bot'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),...(retryKey?{'X-Line-Retry-Key':retryKey}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});
  return r;
 }
 async function get(path:string){const r=await call(path);if(!r.ok)throw new BroadcastLineError('line_check_failed',r.status);return await r.json();}
 return{
  async preflight(c:BroadcastConfig,mode:'test'|'broadcast',now=Date.now()){
   if(!token)throw new BroadcastLineError('line_not_configured');
   const bot=await get('/info');if(bot.basicId!=='@228srwlt')throw new BroadcastLineError('wrong_oa');
   const quota=await get('/message/quota'),usage=await get('/message/quota/consumption');
   const remaining=quota.type==='limited'&&Number.isSafeInteger(quota.value)&&Number.isSafeInteger(usage.totalUsage)?quota.value-usage.totalUsage:null;
   let followers=1,statsDate='';
   if(mode==='broadcast'){
    statsDate=new Date(now+9*3600000-86400000).toISOString().slice(0,10).replaceAll('-','');
    const stats=await get('/insight/followers?date='+statsDate);
    if(stats.status!=='ready'||!Number.isSafeInteger(stats.followers)||stats.followers<0)throw new BroadcastLineError('audience_unknown');followers=stats.followers;
   }
   if(quota.type!=='none'&&(remaining===null||remaining<Math.max(1,followers)))throw new BroadcastLineError('quota_insufficient');
   const r=await call('/message/validate/'+(mode==='test'?'push':'broadcast'),{messages:[broadcastCard(c)]});
   if(!r.ok)throw new BroadcastLineError('card_invalid',r.status);
   return{botName:bot.displayName,basicId:bot.basicId,remaining,followers,statsDate,estimatedMessages:mode==='test'?1:followers,unlimited:quota.type==='none'};
  },
  async send(c:BroadcastConfig,mode:'test'|'broadcast',subject:string,retryKey:string){
   // Only invoked after a durable database claim. Never loop or auto-retry.
   try{
    const r=await call('/message/'+(mode==='test'?'push':'broadcast'),{messages:[broadcastCard(c)],notificationDisabled:false,...(mode==='test'?{to:subject}:{})},retryKey);
    const accepted=r.ok||(r.status===409&&Boolean(r.headers.get('x-line-accepted-request-id')));
    return{status:accepted?'accepted':r.status>=500?'unknown':'failed',requestId:r.headers.get('x-line-accepted-request-id')||r.headers.get('x-line-request-id'),errorCode:accepted?null:'line_'+r.status};
   }catch{return{status:'unknown',requestId:null,errorCode:'delivery_uncertain'};}
  }
 };
}
