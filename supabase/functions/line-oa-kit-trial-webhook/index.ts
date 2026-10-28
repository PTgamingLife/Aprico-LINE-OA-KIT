import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {validLineSignature,trialLine} from '../_shared/trial-line.ts';
import {trialReplyMessages} from '../_shared/trial-replies.ts';
import {exitTrial} from '../_shared/trial-handler.ts';
import {TRIAL_LIFF} from '../../../src/trial-model.ts';
Deno.serve(async req=>{
 const secret=Deno.env.get('LINE_OA_KIT_MESSAGING_CHANNEL_SECRET')||'',token=Deno.env.get('LINE_OA_KIT_MESSAGING_ACCESS_TOKEN')||'';
 if(req.method==='GET')return Response.json({ok:true,configured:Boolean(secret&&token)});
 if(req.method!=='POST')return new Response('',{status:405});
 try{
  const reader=req.body?.getReader();if(!reader)return new Response('',{status:400});const parts=[];let size=0;while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>100000){await reader.cancel();return new Response('',{status:413});}parts.push(p.value);}const raw=new Uint8Array(size);let offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length;}
  if(!await validLineSignature(raw,req.headers.get('x-line-signature')||'',secret))return new Response('',{status:401});
  let body;try{body=JSON.parse(new TextDecoder().decode(raw));}catch{return new Response('',{status:400});}if(!Array.isArray(body.events)||body.events.length>20)return new Response('',{status:400});
  if(!body.events.length)return new Response('OK');
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}),call=trialLine(token);
  for(const e of body.events){
   // Never expose personal configuration in a group, room, or to an unverified source.
   if(e.source?.type!=='user'||!/^U[0-9a-f]{32}$/.test(e.source.userId||'')||!e.replyToken||!['message','postback'].includes(e.type))continue;
   if(!/^[a-zA-Z0-9_-]{10,100}$/.test(e.webhookEventId||''))continue;
   const{error:claimError}=await db.from('line_oa_kit_trial_events').insert({event_id:e.webhookEventId,line_subject:e.source.userId});if(claimError?.code==='23505')continue;if(claimError)return new Response('',{status:503});
   const{data:t,error}=await db.from('line_oa_kit_trials').select('line_subject,config,version,active').eq('line_subject',e.source.userId).maybeSingle();if(error)return new Response('',{status:503});
   let messages;
   if(e.type==='message'&&['結束試用','返回建置中心'].includes(e.message?.text)){await exitTrial(db,e.source.userId,token);messages=[{type:'text',text:`已結束個人試用，回到 Aprico 建置中心。\n${TRIAL_LIFF}/build.html`}];}
   else if(e.type==='postback')messages=trialReplyMessages(t,e);
   else if(e.message?.type==='text')messages=[{type:'text',text:t?.active?'目前是個人試用模式，請點選下方選單。輸入「結束試用」可返回建置中心。':`請開啟設計頁，保存並啟用你的個人試用：\n${TRIAL_LIFF}/design.html`}];
   if(messages)await call('/v2/bot/message/reply','POST',{replyToken:e.replyToken,messages});
  }
  return new Response('OK');
 }catch{return new Response('',{status:503});}
});
