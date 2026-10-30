// LINE Pay Online v4. Credentials never leave the Edge runtime.
export type PayConfig={mode:'sandbox'|'production';channelId:string;secret:string;enabled:boolean};
export function payConfig(env:(key:string)=>string|undefined):PayConfig{
 const mode=env('LINE_OA_KIT_LINEPAY_MODE')==='production'?'production':'sandbox';
 const channelId=env('LINE_OA_KIT_LINEPAY_CHANNEL_ID')||'',secret=env('LINE_OA_KIT_LINEPAY_CHANNEL_SECRET')||'';
 return {mode,channelId,secret,enabled:Boolean(channelId&&secret&&(mode==='sandbox'||env('LINE_OA_KIT_LINEPAY_LIVE_ENABLED')==='true'))};
}
export function parsePayJSON(raw:string){return JSON.parse(raw.replace(/:\s*(\d{16,})\b/g,':"$1"'));}
export function checkoutUrl(value:unknown,mode:string){
 try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname===(mode==='production'?'web-pay.line.me':'sandbox-web-pay.line.me')?u.href:null;}catch{return null;}
}
export async function linePay(config:PayConfig,path:string,data:unknown=null,query='',fetcher:typeof fetch=fetch){
 if(!config.enabled||!/^\/v4\/payments(?:\/|$)/.test(path))throw Error('payment_not_configured');
 const nonce=crypto.randomUUID(),body=data===null?'':JSON.stringify(data);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(config.secret+path+(data===null?query:body)+nonce));
 const authorization=btoa(String.fromCharCode(...new Uint8Array(sig)));
 const timeout=path.endsWith('/confirm')?45000:path==='/v4/payments'?25000:15000;
 const r=await fetcher(`https://${config.mode==='sandbox'?'sandbox-api-pay.line.me':'api-pay.line.me'}${path}${query?'?'+query:''}`,{method:data===null?'GET':'POST',headers:{'Content-Type':'application/json','X-LINE-ChannelId':config.channelId,'X-LINE-Authorization-Nonce':nonce,'X-LINE-Authorization':authorization},body:data===null?undefined:body,signal:AbortSignal.timeout(timeout),redirect:'error'});
 if(!r.ok)throw Error('payment_network_error');
 return parsePayJSON(await r.text());
}
export function verifiedPayment(detail:any,order:any){
 return Number.isSafeInteger(order.amount)&&order.amount>0&&order.currency==='TWD'&&detail?.transactionType==='PAYMENT'&&String(detail.transactionId)===order.transaction_id&&detail.orderId===order.id&&detail.currency===order.currency&&Array.isArray(detail.payInfo)&&detail.payInfo.length>0&&detail.payInfo.every((p:any)=>Number.isSafeInteger(p.amount)&&p.amount>=0)&&detail.payInfo.reduce((n:number,p:any)=>n+p.amount,0)===order.amount&&(!detail.refundList||detail.refundList.length===0);
}
