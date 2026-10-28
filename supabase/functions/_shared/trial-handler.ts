import {decodeMenuImage,trialMenu} from '../../../src/trial-model.ts';
import {trialLine,previewPlatform} from './trial-line.ts';
const errorText:Record<string,string>={trial_project_not_found:'找不到你的設計，請先保存。',trial_revision_conflict:'設計版本已變更，請重新載入後再試。',trial_busy:'選單正在更新，請稍後再試。',trial_rate_limit:'剛更新過選單，請約一分鐘後再試；設計已保存。',trial_platform_limit:'目前試用更新較多，請稍後再試；設計已保存。',trial_existing_webhook:'平台已有其他 Webhook，為避免干擾已停止，請聯絡專員。',trial_platform_not_configured:'平台試用功能尚未完成設定。',trial_platform_channel_mismatch:'平台 LINE 通道不符，請聯絡專員。',trial_platform_token_invalid:'平台 LINE 憑證需由管理者更新。',trial_webhook_test_failed:'平台 Webhook 測試未通過，請聯絡專員。',trial_line_404:'請先加入 Aprico 官方帳號好友，並確認沒有封鎖。',trial_existing_personal_menu:'你已有其他個人選單，系統不會覆蓋，請聯絡專員。'};
export async function exitTrial(db:any,subject:string,token:string){
 const{data:t,error}=await db.from('line_oa_kit_trials').select('menu_id,operation_id,lease_until,active').eq('line_subject',subject).maybeSingle();if(error)throw Error('trial_database');if(!t||!t.active)return;
 if(t.lease_until&&Date.parse(t.lease_until)>Date.now())throw Error('trial_busy');
 const op=crypto.randomUUID();let lock=db.from('line_oa_kit_trials').update({operation_id:op,lease_until:new Date(Date.now()+60000).toISOString()}).eq('line_subject',subject).eq('active',true);lock=t.operation_id?lock.eq('operation_id',t.operation_id):lock.is('operation_id',null);const{data:locked,error:lockError}=await lock.select('menu_id').maybeSingle();if(lockError||!locked)throw Error('trial_busy');
 try{const call=trialLine(token),current=await call(`/v2/bot/user/${subject}/richmenu`,'GET',undefined,false,true);if(current&&current.richMenuId!==locked.menu_id)throw Error('trial_existing_personal_menu');if(current)await call(`/v2/bot/user/${subject}/richmenu`,'DELETE');const{error}=await db.from('line_oa_kit_trials').update({active:false,operation_id:null,lease_until:null,updated_at:new Date().toISOString()}).eq('line_subject',subject).eq('operation_id',op);if(error)throw Error('trial_database');}
 finally{await db.from('line_oa_kit_trials').update({operation_id:null,lease_until:null}).eq('line_subject',subject).eq('operation_id',op);}
}
export async function trialAction(b:any,db:any,subject:string,response:(body:any,status?:number)=>Response){
 const token=Deno.env.get('LINE_OA_KIT_MESSAGING_ACCESS_TOKEN')||'',secret=Deno.env.get('LINE_OA_KIT_MESSAGING_CHANNEL_SECRET')||'';let operation:string|undefined,created:string|undefined,linked=false;
 try{
  if(b.action==='trial_exit'){await exitTrial(db,subject,token);return response({active:false});}
  if(b.action==='trial_config'){
   const{data,error}=await db.from('line_oa_kit_trials').select('project_id,revision,config,version,active').eq('line_subject',subject).maybeSingle();if(error)throw Error('trial_database');if(!data?.active)return response({error:'目前沒有啟用的個人試用，請先保存設計並啟用。'},404);if(b.version&&b.version!==data.version)return response({error:'這是舊版選單，請關閉後重新開啟目前的格子。'},409);return response({trial:data});
  }
  const image=decodeMenuImage(b.image),platform=await previewPlatform(token,secret);if(!platform.available&&platform.reason!=='trial_existing_webhook')throw Error(platform.reason);
  const call=trialLine(token);await call(`/v2/bot/profile/${subject}`); // Require an actual friend in the same Provider.
  const{data:started,error}=await db.rpc('line_oa_kit_begin_trial',{p_subject:subject,p_project:b.projectId,p_revision:b.revision});if(error)throw Error('trial_database');if(started.error)throw Error(started.error);operation=started.operation;
  const current=await call(`/v2/bot/user/${subject}/richmenu`,'GET',undefined,false,true);if(current&&current.richMenuId!==started.oldMenu)throw Error('trial_existing_personal_menu');
  // URI-only trial deliberately leaves the platform's existing webhook untouched.
  let menu=started.oldMenu,version=started.oldVersion;
  if(!started.cached){version=operation;const made=await call('/v2/bot/richmenu','POST',trialMenu(started.config,operation));menu=made.richMenuId;if(typeof menu!=='string'||!/^richmenu-[a-f0-9]{32}$/.test(menu))throw Error('trial_invalid_menu');created=menu;await call(`/v2/bot/richmenu/${menu}/content`,'POST',image,true);}
  const{data:renewed,error:renewError}=await db.from('line_oa_kit_trials').update({lease_until:new Date(Date.now()+60000).toISOString()}).eq('line_subject',subject).eq('operation_id',operation).select('line_subject').maybeSingle();if(renewError||!renewed)throw Error('trial_busy');
  // Mark link outcome uncertain before the network request: never delete a possibly live menu.
  linked=true;await call(`/v2/bot/user/${subject}/richmenu/${menu}`,'POST');
  const actual=await call(`/v2/bot/user/${subject}/richmenu`);if(actual.richMenuId!==menu)throw Error('trial_link_verify_failed');
  const{data:finished,error:finishError}=await db.rpc('line_oa_kit_finish_trial',{p_subject:subject,p_operation:operation,p_menu:menu,p_version:version});if(finishError||finished!==true)throw Error('trial_database');
  if(created&&started.oldMenu&&started.oldMenu!==menu){try{const old=await call(`/v2/bot/richmenu/${started.oldMenu}`);if(old.name==='Aprico personal trial '+started.oldVersion)await call(`/v2/bot/richmenu/${started.oldMenu}`,'DELETE');}catch{/* Old owned menu cleanup is best-effort, never touch a default menu. */}}
  return response({active:true,version,webhookActive:false,message:'個人試用選單已套用，只對你顯示。關閉網頁回到 Aprico 聊天室，點選各格開啟功能展示。固定訊息目前以展示頁呈現，不改動原本 Webhook。'});
 }catch(e){
  if(created&&!linked){try{await trialLine(token)(`/v2/bot/richmenu/${created}`,'DELETE');}catch{}}
  const code=e instanceof Error&&/^trial_[a-z0-9_]+$/.test(e.message)?e.message:'trial_request_failed';return response({error:errorText[code]||'設計已保存，但 LINE 試用未完成，請稍後重試或聯絡專員。',code},code==='trial_rate_limit'||code==='trial_platform_limit'?429:409);
 }finally{if(operation)await db.from('line_oa_kit_trials').update({operation_id:null,lease_until:null,pending_project:null,pending_revision:null,pending_config:null}).eq('line_subject',subject).eq('operation_id',operation);}
}
