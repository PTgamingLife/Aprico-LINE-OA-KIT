import {trialReplyMessages} from './trial-replies.ts';
import {TRIAL_LIFF} from '../../../src/trial-model.ts';
type Routing={trialAuthenticated:boolean;assistantAuthenticated:boolean;db:any;reply:(token:string,messages:any[])=>Promise<unknown>;exit:(subject:string)=>Promise<unknown>;assistant:(event:any)=>Promise<unknown>};
// Called only after checking the original raw-body HMAC. Assistant and trial
// authentication are independent: one channel cannot access another's data.
export async function routeAssistantEvent(event:any,r:Routing){
 const direct=event.source?.type==='user'&&/^U[0-9a-f]{32}$/.test(event.source.userId||'');
 const supported=event.type==='postback'||(event.type==='message'&&event.message?.type==='text');
 if(r.trialAuthenticated&&direct&&supported&&typeof event.replyToken==='string'&&event.replyToken){
  const own=event.source.userId,{data:trial,error}=await r.db.from('line_oa_kit_trials').select('config,version,active').eq('line_subject',own).maybeSingle();
  if(error)throw Error('trial_read_failed'); // Never fall through into paid AI on an unknown trial state.
  const marker=new URLSearchParams(event.postback?.data||'').has('aprico_trial');
  if(trial?.active||marker){
   if(!/^[a-zA-Z0-9_-]{10,100}$/.test(event.webhookEventId||''))return;
   const{error:claimed}=await r.db.from('line_oa_kit_trial_events').insert({event_id:event.webhookEventId,line_subject:own});
   if(claimed?.code==='23505')return;if(claimed)throw Error('trial_claim_failed');
   let messages;
   if(event.type==='postback')messages=trialReplyMessages(trial,event);
   else{
    const raw=event.message.text.trim();
    if(['結束試用','返回建置中心'].includes(raw)){await r.exit(own);messages=[{type:'text',text:`已結束個人試用，回到建置中心：\n${TRIAL_LIFF}/build.html`}];}
    else{
     const index=trial.config.cells.slice(0,trial.config.grid).findIndex((c:any)=>c.action==='message'&&c.label&&c.label===raw);
     messages=index>=0?trialReplyMessages(trial,{postback:{data:`aprico_trial=cell&v=${trial.version}&i=${index}`}}):[{type:'text',text:'目前是你的個人試用，不會呼叫 AI。請點選下方選單；輸入「結束試用」可返回建置中心。'}];
    }
   }
   await r.reply(event.replyToken,messages);return;
  }
 }
 if(r.assistantAuthenticated)await r.assistant(event);
}
