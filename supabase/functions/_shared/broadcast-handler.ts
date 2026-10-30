import {isBroadcastOwner,validateBroadcast,broadcastCard} from '../../../src/broadcast-model.ts';
import {broadcastLine,BroadcastLineError} from './broadcast-line.ts';
const columns='id,config,status,revision,created_at,updated_at,prepared_until,request_id,error_code,test_status,test_request_id,test_revision';
const idOK=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const safeErrors:Record<string,string>={wrong_oa:'LINE 憑證不是 Aprico，已停止',quota_insufficient:'訊息額度不足，未發送',audience_unknown:'目前無法確認好友人數，未發送',card_invalid:'LINE 卡片格式檢查未通過，未發送',line_not_configured:'尚未設定平台 LINE 憑證',line_check_failed:'LINE 檢查失敗，未發送',send_too_soon:'兩次群發至少間隔一分鐘',daily_limit:'已達每日五次群發安全上限',confirmation_expired:'確認已逾期，請重新檢查',test_already_claimed:'此版本已測試或操作太快；為避免重複發送，未重送',not_ready:'紀錄已更新或已發送，請重新讀取；不會重送'};
export async function broadcastAction(b:any,db:any,subject:string,owner:string,token:string,response:(v:unknown,status?:number)=>Response,fetcher:typeof fetch=fetch,displayName='LINE 會員'){
 const authorized=isBroadcastOwner(subject,owner);
 if(b.action==='owner_status')return response({ownerConfigured:/^U[0-9a-f]{32}$/.test(owner),authorized,ownSubject:subject,displayName});
 // Fail closed: no owner ID in Edge configuration means nobody can send.
 if(!authorized)return response({error:'此功能僅供已綁定的主要擁有者使用'},403);
 try{
  if(b.action==='broadcast_list'){
   const {data,error}=await db.from('line_oa_kit_broadcasts').select(columns).eq('line_subject',subject).order('created_at',{ascending:false}).limit(30);
   if(error)return response({error:'無法讀取發送紀錄'},503);return response({drafts:data});
  }
  if(!idOK(b.id)||!Number.isSafeInteger(b.revision)||b.revision<0)return response({error:'草稿版本不正確'},400);
  if(b.action==='broadcast_save'){
   let config;try{config=validateBroadcast(b.config);}catch(e){return response({error:(e as Error).message},400);}
   const row={id:b.id,line_subject:subject,config,status:'draft',revision:b.revision+1,confirm_hash:null,prepared_until:null,updated_at:new Date().toISOString()};
   const q=b.revision===0?db.from('line_oa_kit_broadcasts').insert(row):db.from('line_oa_kit_broadcasts').update(row).eq('id',b.id).eq('line_subject',subject).eq('revision',b.revision).in('status',['draft','prepared']);
   const {data,error}=await q.select(columns).maybeSingle();
   if(error||!data)return response({error:'未保存；內容可能已更新或已發送，請重新讀取'},409);
   return response({draft:data});
  }
  const {data:d,error}=await db.from('line_oa_kit_broadcasts').select('*').eq('id',b.id).eq('line_subject',subject).maybeSingle();
  if(error)return response({error:'讀取草稿失敗'},503);
  if(!d)return response({error:'草稿不存在'},404);
  if(d.revision!==b.revision||!['draft','prepared'].includes(d.status))return response({error:'草稿已更新或已嘗試發送，禁止重送'},409);
  const config=validateBroadcast(d.config),line=broadcastLine(token,fetcher);
  if(b.action==='broadcast_prepare'){
   const checks=await line.preflight(config,'broadcast');
   const bytes=crypto.getRandomValues(new Uint8Array(32)),confirmToken=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
   const expires=new Date(Date.now()+300000).toISOString();
   const {data:updated,error:e}=await db.from('line_oa_kit_broadcasts').update({status:'prepared',revision:d.revision+1,confirm_hash:await hash(confirmToken),prepared_until:expires,updated_at:new Date().toISOString()}).eq('id',d.id).eq('line_subject',subject).eq('revision',d.revision).in('status',['draft','prepared']).select(columns).maybeSingle();
   if(e||!updated)return response({error:'草稿已更新，請重新檢查'},409);
   return response({draft:updated,checks,confirmToken,card:broadcastCard(config),expiresAt:expires});
  }
  const test=b.action==='broadcast_test';
  if(!test&&b.action!=='broadcast_send')return response({error:'不支援的操作'},400);
  if(test?b.confirmTest!==true:(b.confirmText!=='確認發送給全部好友'||typeof b.confirmToken!=='string'||!/^[0-9a-f]{64}$/.test(b.confirmToken)))return response({error:'請先確認本次收件對象與發送'},400);
  if(!test&&(d.status!=='prepared'||Date.parse(d.prepared_until)<=Date.now()||await hash(b.confirmToken)!==d.confirm_hash))return response({error:'確認已逾期或內容已變更，請重新檢查'},409);
  // Recheck the latest quota before the claim. A network failure here sends nothing.
  await line.preflight(config,test?'test':'broadcast');
  const {data:claimed,error:claimError}=await db.rpc('line_oa_kit_claim_broadcast',{p_subject:subject,p_id:d.id,p_revision:d.revision,p_mode:test?'test':'broadcast',p_confirm_hash:test?'':await hash(b.confirmToken)});
  if(claimError)return response({error:'無法鎖定發送工作，未發送'},503);
  if(claimed.error)return response({error:safeErrors[claimed.error]||'工作已處理，禁止重送'},409);
  const result=await line.send(config,test?'test':'broadcast',subject,claimed.retryKey);
  const update=test?{test_status:result.status,test_request_id:result.requestId,updated_at:new Date().toISOString()}:{status:result.status,request_id:result.requestId,error_code:result.errorCode,updated_at:new Date().toISOString()};
  let q=db.from('line_oa_kit_broadcasts').update(update).eq('id',d.id).eq('line_subject',subject);
  q=test?q.eq('test_key',claimed.retryKey):q.eq('status','sending');
  const {data:saved,error:saveError}=await q.select(columns).maybeSingle();
  return response({result,draft:saved||null,auditSaved:!saveError&&Boolean(saved),message:result.status==='accepted'?'LINE 已接受本次發送，不代表每位好友已送達或已讀。':result.status==='unknown'?'結果不明，請在 LINE 後台核對，不要重新發送。':'LINE 拒絕本次發送；為避免誤發，不會自動重試。'});
 }catch(e){return response({error:e instanceof BroadcastLineError?(safeErrors[e.code]||'LINE 檢查失敗，未發送'):'操作失敗；請重新讀取紀錄確認狀態，勿重送'},503);}
}
