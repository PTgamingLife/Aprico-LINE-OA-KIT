import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {linePay,payConfig,parsePayJSON,checkoutUrl,verifiedPayment} from '../supabase/functions/_shared/linepay-client.ts';
import {paymentAction} from '../supabase/functions/_shared/payment-handler.ts';
import {BUILD_LIST_PRICE,BUILD_SALE_PRICE} from '../src/payment-price.ts';
const subject='U'+'1'.repeat(32),project={id:'00000000-0000-4000-8000-000000000001'};
const tx='2026103012345678910',id='00000000-0000-4000-8000-000000000002';
const response=(v:any,status=200)=>Response.json(v,{status});
const env=(production=false)=>(k:string)=>({LINE_OA_KIT_LINEPAY_CHANNEL_ID:'pay-fixture',LINE_OA_KIT_LINEPAY_CHANNEL_SECRET:'not-a-real-key',LINE_OA_KIT_LINEPAY_MODE:production?'production':'sandbox',LINE_OA_KIT_LINEPAY_LIVE_ENABLED:production?'true':''}[k]);
const row=(status='pending',environment='sandbox')=>({id,project_id:project.id,line_subject:subject,environment,amount:1890,currency:'TWD',status,transaction_id:tx,payment_url:'https://sandbox-web-pay.line.me/web/payment/wait?fixture=1'});
const detail=()=>({transactionId:tx,orderId:id,currency:'TWD',transactionType:'PAYMENT',payInfo:[{amount:1800},{amount:90}],refundList:[]});
function memory(initial:any=null,options:any={}){
 let order=initial?structuredClone(initial):null,unlocked=false;let settlements=0;
 const db:any={get order(){return order;},get settlements(){return settlements;},get unlocked(){return unlocked;},from:(name:string)=>{
  let update:any;const filters:any[]=[];
  const resolve=()=>{if(name==='line_oa_kit_build_access')return{data:null,error:null};assert.equal(name,'line_oa_kit_payments');const matches=order&&filters.every(([k,v])=>order[k]===v);if(!matches)return{data:null,error:null};if(update){if(options.auditFail)return{error:{code:'test'}};order={...order,...update};}return{data:structuredClone(order),error:null};};
  const q:any={select:()=>q,eq:(k:any,v:any)=>{filters.push([k,v]);return q;},order:()=>q,limit:()=>q,update:(v:any)=>{update=v;return q;},single:async()=>resolve(),maybeSingle:async()=>resolve(),then:(fn:any)=>Promise.resolve(fn(resolve()))};return q;
 },rpc:async(name:string,p:any)=>{
  assert.equal(p.p_subject,subject);
  if(name==='line_oa_kit_begin_payment'){if(order)return{data:{order:structuredClone(order),created:false}};order={...row('requesting',p.p_environment),amount:3860,transaction_id:null,payment_url:null};return{data:{order:structuredClone(order),created:true}};}
  assert.equal(name,'line_oa_kit_settle_payment');settlements++;order.status=p.p_environment==='production'?'paid':'test_paid';unlocked=p.p_environment==='production';return{data:{ok:true,unlocked}};
 }};return db;
}
function provider(options:any={}){
 const calls:any[]=[];
 const fetcher:typeof fetch=async(url,init)=>{
  calls.push({url:String(url),method:init?.method,body:init?.body?JSON.parse(String(init.body)):null});
  if(options.timeout)throw Error('private credentials must not leak');
  if(String(url).endsWith('/request'))return new Response('{"returnCode":"0000","info":{"transactionId":2026103012345678910,"paymentUrl":{"web":"https://sandbox-web-pay.line.me/web/payment/wait?fixture=1"}}}');
  if(String(url).endsWith('/check'))return Response.json({returnCode:options.cancel?'0121':options.notReady?'0000':'0110'});
  if(String(url).endsWith('/confirm'))return Response.json({returnCode:'0000'});
  return Response.json({returnCode:'0000',info:options.mismatch?[{...detail(),currency:'USD'}]:[{...detail(),payInfo:[{amount:options.amount??1890}]}]});
 };return{calls,fetcher};
}
test('LINE Pay keys are separate; production requires explicit live switch',()=>{
 assert.equal(payConfig(()=>undefined).enabled,false);
 assert.equal(payConfig(k=>k==='LINE_OA_KIT_MESSAGING_ACCESS_TOKEN'?'other-key':undefined).enabled,false);
 assert.equal(payConfig(k=>k==='LINE_OA_KIT_LINEPAY_LIVE_ENABLED'?undefined:env(true)(k)).enabled,false);
 assert.equal(payConfig(env()).mode,'sandbox');assert.equal(payConfig(env(true)).enabled,true);
});
test('v4 signing covers exact body/path/nonce and preserves transaction precision',async()=>{
 const config=payConfig(env());
 await linePay(config,'/v4/payments/request',{amount:1890},'',async(url,init)=>{
  assert.equal(String(url),'https://sandbox-api-pay.line.me/v4/payments/request');const h=new Headers(init?.headers),nonce=h.get('X-LINE-Authorization-Nonce');
  assert.equal(h.get('X-LINE-Authorization'),createHmac('sha256',config.secret).update(config.secret+'/v4/payments/request'+init?.body+nonce).digest('base64'));
  assert.equal(h.get('X-LINE-ChannelId'),'pay-fixture');return Response.json({returnCode:'0000'});
 });
 assert.equal(parsePayJSON('{"transactionId":2026103012345678910}').transactionId,tx);
 let called=false;await assert.rejects(()=>linePay({...config,enabled:false},'/v4/payments/request',{},'',async()=>{called=true;return Response.json({});}));assert.equal(called,false);
});
test('checkout destination and successful payment evidence reject forged details',()=>{
 for(const url of ['javascript:alert(1)','https://evil.example','https://sandbox-web-pay.line.me.evil.example/','https://name:secret@sandbox-web-pay.line.me/'])assert.equal(checkoutUrl(url,'sandbox'),null);
 assert.ok(checkoutUrl(row().payment_url,'sandbox'));assert.equal(checkoutUrl(row().payment_url,'production'),null);
 assert.equal(verifiedPayment(detail(),row()),true);
 for(const d of [{...detail(),orderId:'other'},{...detail(),currency:'USD'},{...detail(),transactionId:'1111111111111111'},{...detail(),transactionType:'PREAPPROVED'},{...detail(),payInfo:[{amount:1}]},{...detail(),refundList:[{}]}])assert.equal(verifiedPayment(d,row()),false);
});
test('creating order ignores client price/identity and fixes project scope and redirects',async()=>{
 const db=memory(),p=provider();const r=await paymentAction({action:'payment_create',acceptPurchase:true,amount:1,line_subject:'attacker'},db,subject,project,response,env(),p.fetcher);
 assert.equal(r.status,200);const body=await r.json();assert.equal(body.order.amount,3860);assert.equal(body.listPrice,6660);assert.equal(body.order.status,'pending');assert.equal(db.order.transaction_id,tx);
 assert.equal(p.calls[0].body.amount,3860);assert.equal(p.calls[0].body.packages[0].products[0].price,3860);assert.equal(p.calls[0].body.currency,'TWD');assert.equal(p.calls[0].body.options.payment.capture,true);assert.ok(p.calls[0].body.redirectUrls.confirmUrl.includes(project.id));
 await paymentAction({action:'payment_create',acceptPurchase:true},db,subject,project,response,env(),p.fetcher);assert.equal(p.calls.length,1);
});
test('status and reconcile never confirm or charge; sandbox success never grants access',async()=>{
 const db=memory(row()),p=provider();await paymentAction({action:'payment_status'},db,subject,project,response,env(),p.fetcher);assert.equal(p.calls.length,0);
 const r=await paymentAction({action:'payment_reconcile',transactionId:'forged'},db,subject,project,response,env(),p.fetcher);assert.equal((await r.json()).unlocked,false);assert.equal(db.order.status,'test_paid');assert.equal(db.unlocked,false);assert.equal(p.calls.length,1);assert.equal(p.calls[0].method,'GET');
});
test('concurrent buyer confirmations issue at most one capture; grant uses verified evidence',async()=>{
 const db=memory(row('pending','production')),p=provider();await Promise.all([1,2].map(()=>paymentAction({action:'payment_confirm',confirmPayment:true},db,subject,project,response,env(true),p.fetcher)));
 assert.equal(p.calls.filter(c=>c.url.endsWith('/confirm')).length,1);assert.equal(db.unlocked,true);assert.equal(db.order.status,'paid');
});
test('cancelled and unauthorised checks do not confirm; wrong amount never grants',async()=>{
 for(const opts of [{cancel:true},{notReady:true},{mismatch:true}]){const db=memory(row()),p=provider(opts);await paymentAction({action:'payment_confirm',confirmPayment:true},db,subject,project,response,env(),p.fetcher);assert.equal(db.settlements,0);if(!opts.mismatch)assert.equal(p.calls.filter(c=>c.url.endsWith('/confirm')).length,0);}
});
test('uncertain request is blocked from auto retry and does not expose secret errors',async()=>{
 const db=memory(),p=provider({timeout:true});const r=await paymentAction({action:'payment_create',acceptPurchase:true},db,subject,project,response,env(),p.fetcher);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private credentials/);assert.equal(db.order.status,'unknown');
 await paymentAction({action:'payment_create',acceptPurchase:true},db,subject,project,response,env(),p.fetcher);assert.equal(p.calls.length,1);assert.equal(db.settlements,0);
});
test('private RLS ledger and service-only atomic grant have sandbox guard; authenticated studio dispatch',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261030044224_linepay_checkout.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/);assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/if d.environment='production' then/);assert.match(sql,/on conflict\(project_id\) do nothing/);assert.doesNotMatch(sql,/security definer/i);
 const studio=readFileSync(new URL('../supabase/functions/line-oa-kit-studio/index.ts',import.meta.url),'utf8');assert.ok(studio.indexOf("await paymentAction")>studio.indexOf("identity.aud!==channelId"));assert.ok(studio.indexOf('await paymentAction')>studio.indexOf("if(!project)return"));
});
test('promotion is 6660/3860; old and new orders confirm against their immutable price',async()=>{
 assert.equal(BUILD_LIST_PRICE,6660);assert.equal(BUILD_SALE_PRICE,3860);
 for(const amount of [1890,3860]){
  const db=memory({...row(),amount}),p=provider({amount});
  const r=await paymentAction({action:'payment_confirm',confirmPayment:true},db,subject,project,response,env(),p.fetcher);
  assert.equal(r.status,200);assert.equal(p.calls.find(c=>c.url.endsWith('/confirm')).body.amount,amount);assert.equal(db.order.amount,amount);assert.equal(db.order.status,'test_paid');
 }
 assert.equal(verifiedPayment(detail(),{...row(),amount:3860}),false);
 const sql=readFileSync(new URL('../supabase/migrations/20261030073657_linepay_promotion_price.sql',import.meta.url),'utf8');assert.match(sql,/set default 3860/);assert.doesNotMatch(sql,/update public.line_oa_kit_payments/i);
});
