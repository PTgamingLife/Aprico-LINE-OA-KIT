import {broadcastLine,BroadcastLineError} from './broadcast-line.ts';
import {validateBroadcast} from '../../../src/broadcast-model.ts';
const subjectOK=(v:unknown)=>typeof v==='string'&&/^U[0-9a-f]{32}$/.test(v);
const uuidOK=(v:unknown)=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v);

// Every send requires a durable claim AND a second atomic begin after preflight.
// A crash or ambiguous response never returns a sending job to the pending queue.
export async function processIntroJob(db:any,token:string,id:string|null=null,fetcher:typeof fetch=fetch){
 const claimed=await db.rpc('line_oa_kit_intro_claim',{p_id:id});
 if(claimed.error)throw Error('intro_claim_failed');
 const j=claimed.data;if(!j?.id)return {idle:true};
 const finish=async(status:string,error:string|null=null,request:string|null=null)=>{
  const r=await db.rpc('line_oa_kit_intro_finish',{p_id:j.id,p_key:j.claim_key,p_status:status,p_error:error,p_request:request});
  return !r.error&&r.data===true;
 };
 let config;
 try{
  if(!uuidOK(j.id)||!uuidOK(j.claim_key)||![1,2].includes(j.card)||!['push','broadcast'].includes(j.kind)||(j.kind==='push'?!subjectOK(j.subject):j.subject!==null))throw Error('invalid_job');
  config=validateBroadcast(j.config);
 }catch{await finish('blocked','invalid_job');return {status:'blocked'};}
 const line=broadcastLine(token,fetcher);
 let checks;
 try{checks=await line.preflight(config,j.kind==='broadcast'?'broadcast':'test');}
 catch(e){
  const code=e instanceof BroadcastLineError?e.code:'preflight_unavailable';
  const terminal=['wrong_oa','card_invalid','line_not_configured'].includes(code);
  await finish(terminal?'blocked':'defer',code);
  return {status:terminal?'blocked':'deferred',error:code};
 }
 const begun=await db.rpc('line_oa_kit_intro_begin',{p_id:j.id,p_key:j.claim_key,p_checks:checks});
 if(begun.error||begun.data!==true)return {status:'not_started'};
 const result=await line.send(config,j.kind==='broadcast'?'broadcast':'test',j.subject||'',j.id);
 const auditSaved=await finish(result.status,result.errorCode,result.requestId);
 return {status:result.status,auditSaved};
}

// Caller must supply ONLY the Aprico HMAC result, not another bot's signature.
export async function introFollowGateway(event:any,r:{authenticated:boolean;db:any;token:string;process?:(id:string)=>Promise<unknown>}){
 if(!r.authenticated||event?.source?.type!=='user'||!subjectOK(event.source.userId)||!['follow','unfollow'].includes(event.type))return false;
 if(typeof event.webhookEventId!=='string'||event.webhookEventId.length<1||event.webhookEventId.length>100||!Number.isSafeInteger(event.timestamp)||event.timestamp<0)return true;
 const at=new Date(event.timestamp);if(!Number.isFinite(at.getTime()))return true;
 const result=await r.db.rpc('line_oa_kit_intro_follow',{p_subject:event.source.userId,p_event:event.webhookEventId,p_type:event.type,p_at:at.toISOString(),p_unblocked:event.follow?.isUnblocked===true});
 if(result.error)throw Error('intro_follow_failed');
 const first=result.data?.firstJob;
 if(uuidOK(first))await (r.process?r.process(first):processIntroJob(r.db,r.token,first));
 return true;
}

export async function checkIntro(db:any,token:string,fetcher:typeof fetch=fetch){
 const {data,error}=await db.from('line_oa_kit_intro_control').select('cards').eq('id',true).single();
 if(error||!Array.isArray(data?.cards)||data.cards.length!==2)throw Error('intro_not_configured');
 const line=broadcastLine(token,fetcher),checks=[];
 for(const card of data.cards)checks.push(await line.preflight(validateBroadcast(card),'broadcast'));
 return {ok:true,checkedAt:new Date().toISOString(),checks};
}
