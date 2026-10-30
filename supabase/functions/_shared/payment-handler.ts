import {linePay,payConfig,checkoutUrl,verifiedPayment} from './linepay-client.ts';
import {BUILD_LIST_PRICE,BUILD_SALE_PRICE} from '../../../src/payment-price.ts';
const table='line_oa_kit_payments';
const base='https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/build.html';
export async function paymentAction(b:any,db:any,subject:string,project:any,respond:any,env:(k:string)=>string|undefined,fetcher:typeof fetch=fetch){
 const config=payConfig(env);
 const info={available:config.enabled,mode:config.mode,amount:BUILD_SALE_PRICE,listPrice:BUILD_LIST_PRICE,currency:'TWD'};
 const read=()=>db.from(table).select('*').eq('project_id',project.id).eq('line_subject',subject).eq('environment',config.mode).order('created_at',{ascending:false}).limit(1).maybeSingle();
 const current=await read();if(current.error)return respond({error:'讀取付款紀錄失敗'},503);
 let order=current.data;
 const publicOrder=(d:any)=>d?{id:d.id,status:d.status,amount:d.amount,currency:d.currency,environment:d.environment,createdAt:d.created_at,paymentUrl:d.status==='pending'?checkoutUrl(d.payment_url,d.environment):null}:null;
 if(b.action==='payment_status')return respond({...info,order:publicOrder(order)});
 if(!config.enabled)return respond({error:'LINE Pay 商店尚未完成設定，請使用密碼開通或聯絡專員'},503);
 if(b.action==='payment_create'){
  if(b.acceptPurchase!==true)return respond({error:'請先確認購買內容'},400);
  const access=await db.from('line_oa_kit_build_access').select('project_id').eq('project_id',project.id).eq('line_subject',subject).maybeSingle();
  if(access.error)return respond({error:'無法確認專案開通狀態'},503);
  if(access.data)return respond({error:'此專案已開通，不需重複付款'},409);
  const started=await db.rpc('line_oa_kit_begin_payment',{p_project:project.id,p_subject:subject,p_environment:config.mode});
  if(started.error||started.data?.error)return respond({error:'無法建立訂單，請稍後重試或聯絡專員'},409);
  order=started.data.order;
  if(!started.data.created)return respond({...info,order:publicOrder(order)});
  const redirect=new URL(base);redirect.searchParams.set('project',project.id);redirect.searchParams.set('pay','return');
  const cancel=new URL(redirect);cancel.searchParams.set('pay','cancel');
  try{
   const r=await linePay(config,'/v4/payments/request',{amount:order.amount,currency:order.currency,orderId:order.id,packages:[{id:'build',amount:order.amount,products:[{id:'project-build',name:'Aprico 單一專案教學與建置工具',quantity:1,price:order.amount}]}],options:{payment:{capture:true}},redirectUrls:{confirmUrl:redirect.href,cancelUrl:cancel.href}},'',fetcher);
   const url=checkoutUrl(r.info?.paymentUrl?.web,config.mode),tx=String(r.info?.transactionId||'');
   if(r.returnCode!=='0000'||!url||!/^\d{16,20}$/.test(tx))throw Error('payment_request_unresolved');
   const saved=await db.from(table).update({status:'pending',transaction_id:tx,payment_url:url,updated_at:new Date().toISOString()}).eq('id',order.id).eq('status','requesting').select('*').single();
   if(saved.error)throw Error('payment_audit_failed');
   return respond({...info,order:publicOrder(saved.data)});
  }catch{
   // Do not issue another payment request after an uncertain provider response.
   await db.from(table).update({status:'unknown',updated_at:new Date().toISOString()}).eq('id',order.id).eq('status','requesting');
   return respond({error:'建立付款結果尚待確認，請勿重複付款；請聯絡專員核對訂單 '+order.id},503);
  }
 }
 if(!order)return respond({error:'找不到此專案的付款訂單'},404);
 if(['paid','test_paid','cancelled'].includes(order.status))return respond({...info,order:publicOrder(order),unlocked:order.status==='paid'});
 if(!order.transaction_id)return respond({error:'訂單需由專員核對，請勿重複付款。訂單 '+order.id},409);
 try{
  // Only an explicit buyer action can confirm/capture. Reload/status never charges.
  if(b.action==='payment_confirm'){
   if(b.confirmPayment!==true)return respond({error:'請確認本次付款'},400);
   const claimed=await db.from(table).update({status:'confirming',updated_at:new Date().toISOString()}).eq('id',order.id).eq('line_subject',subject).eq('status','pending').select('id').maybeSingle();
   if(claimed.error)return respond({error:'無法確認訂單'},503);
   if(claimed.data){
    const check=await linePay(config,`/v4/payments/requests/${order.transaction_id}/check`,null,'',fetcher);
    if(check.returnCode==='0121'){
     await db.from(table).update({status:'cancelled'}).eq('id',order.id).eq('status','confirming');
     return respond({...info,order:publicOrder({...order,status:'cancelled'})});
    }
    if(check.returnCode==='0110')await linePay(config,`/v4/payments/${order.transaction_id}/confirm`,{amount:order.amount,currency:order.currency},'',fetcher);
    else if(check.returnCode!=='0123'){
     // Not authorized: release claim without issuing a confirm request.
     await db.from(table).update({status:'pending'}).eq('id',order.id).eq('status','confirming');
     return respond({error:'LINE Pay 尚未完成付款授權，請先完成付款頁操作'},409);
    }
   }
  }
  const r=await linePay(config,'/v4/payments',null,'transactionId='+encodeURIComponent(order.transaction_id),fetcher);
  const detail=r.returnCode==='0000'&&Array.isArray(r.info)?r.info.find((d:any)=>verifiedPayment(d,order)):null;
  if(!detail)return respond({error:'尚未核對到完整的成功交易，請勿再次付款，可稍後按「核對付款結果」或聯絡專員。訂單 '+order.id},409);
  const settled=await db.rpc('line_oa_kit_settle_payment',{p_order:order.id,p_subject:subject,p_transaction:order.transaction_id,p_environment:config.mode});
  if(settled.error||settled.data?.error)return respond({error:'已核對付款，開通紀錄待同步；請勿重付，聯絡專員並提供訂單 '+order.id},503);
  return respond({...info,order:publicOrder({...order,status:config.mode==='production'?'paid':'test_paid'}),unlocked:config.mode==='production'});
 }catch{return respond({error:'付款結果尚待核對，請勿再次付款，稍後使用「核對付款結果」。訂單 '+order.id},503);}
}
