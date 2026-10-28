import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { validateDraft } from '../../../src/model.ts';
import { emptySetup, validateSetup, requirementIssues, safeContactUrl, passwordsMatch } from '../../../src/build-model.ts';
import {runBuildJob} from '../_shared/run-build-job.ts';
import {textBuildSpec} from '../_shared/source-builder.ts';
import {deploymentAction} from '../_shared/deploy-handler.ts';
import {trialAction} from '../_shared/trial-handler.ts';
import {previewPlatform} from '../_shared/trial-line.ts';

const allowedOrigins = new Set(['https://facialmonitor-line-kit.ptchen321.chatgpt.site','https://ptgaminglife.github.io']);
const channelId = '2012197506';
// Public support destination, not a credential. An Edge setting can override it.
const contactUrl = ()=>safeContactUrl(Deno.env.get('LINE_OA_KIT_CONTACT_URL'))||'https://line.me/ti/p/ZC-w2BuPoi';
Deno.serve(async(req:Request)=>{
  const requestOrigin=req.headers.get('origin');
  const origin=requestOrigin&&allowedOrigins.has(requestOrigin)?requestOrigin:'https://facialmonitor-line-kit.ptchen321.chatgpt.site';
  const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
  const response = (value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(requestOrigin&&!allowedOrigins.has(requestOrigin))return response({error:'來源不允許'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='POST') return response({error:'Method not allowed'},405);
  try {
    // Bound the stream before parsing; never log bodies or LINE credentials.
    const reader=req.body?.getReader();if(!reader)return response({error:'缺少內容'},400);
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1500000){await reader.cancel();return response({error:'內容過大'},413);}chunks.push(part.value);}
    const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
    let b;try{b=JSON.parse(new TextDecoder().decode(raw));}catch{return response({error:'格式錯誤'},400);}
    if(b.action==='config')return response({liffId:Deno.env.get('LINE_OA_KIT_LIFF_ID')||'',loginChannelId:channelId,contactUrl:contactUrl(),buildPasswordConfigured:Boolean(Deno.env.get('LINE_OA_KIT_BUILD_PASSWORD'))});
    if(b.action==='trial_info'){try{return response(await previewPlatform(Deno.env.get('LINE_OA_KIT_MESSAGING_ACCESS_TOKEN')||'',Deno.env.get('LINE_OA_KIT_MESSAGING_CHANNEL_SECRET')||''));}catch{return response({available:false,reason:'trial_platform_unavailable'});}}
    if(!['trial_apply','trial_config','trial_exit','list','save','build_status','unlock_build','save_build_setup','check_build','generate_source','build_jobs','build_job','deploy_prepare','deploy_start','deploy_status','deploy_acceptance'].includes(b.action))return response({error:'不支援的操作'},400);
    if(typeof b.idToken!=='string'||b.idToken.length>10000||!b.idToken)return response({error:'請先使用 LINE 登入'},401);
    const verified=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:b.idToken,client_id:channelId}),signal:AbortSignal.timeout(10000)});
    if(!verified.ok)return response({error:'登入已失效，請重新登入'},401);
    const identity=await verified.json();
    if(identity.aud!==channelId||identity.iss!=='https://access.line.me'||typeof identity.sub!=='string'||!/^U[0-9a-f]{32}$/.test(identity.sub)||!Number.isFinite(identity.exp)||identity.exp*1000<=Date.now())return response({error:'登入憑證不符'},401);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    // Every query is scoped to the server-verified LINE subject, never a client owner ID.
    if(['trial_apply','trial_config','trial_exit'].includes(b.action))return await trialAction(b,db,identity.sub,response);
    if(b.action==='list'){
      const {data,error}=await db.from('line_oa_kit_designs').select('id,config,revision,updated_at').eq('line_subject',identity.sub).order('updated_at',{ascending:false}).limit(50);
      if(error)return response({error:'讀取失敗，請稍後重試'},503);
      return response({projects:data,displayName:typeof identity.name==='string'?identity.name:'LINE 會員'});
    }
    if(['build_status','unlock_build','save_build_setup','check_build','generate_source','build_jobs','build_job','deploy_prepare','deploy_start','deploy_status','deploy_acceptance'].includes(b.action)){
      if(typeof b.projectId!=='string'||!/^[0-9a-f-]{36}$/i.test(b.projectId))return response({error:'請先選擇並保存專案'},400);
      const {data:project,error:projectError}=await db.from('line_oa_kit_designs').select('id,config,revision').eq('id',b.projectId).eq('line_subject',identity.sub).maybeSingle();
      if(projectError)return response({error:'讀取專案失敗'},503);
      if(!project)return response({error:'專案不存在或沒有存取權'},404);
      let {data:access,error:accessError}=await db.from('line_oa_kit_build_access').select('granted_at,grant_method,setup,setup_revision,updated_at').eq('project_id',project.id).eq('line_subject',identity.sub).maybeSingle();
      if(accessError)return response({error:'讀取開通狀態失敗'},503);
      if(b.action==='build_status')return response({unlocked:Boolean(access),access,contactUrl:contactUrl()});
      if(b.action==='unlock_build'){
        if(access)return response({unlocked:true,access});
        const expected=Deno.env.get('LINE_OA_KIT_BUILD_PASSWORD')||'';
        if(!expected)return response({error:'開通密碼尚未設定，請聯絡專員'},503);
        if(typeof b.password!=='string'||!b.password||b.password.length>256)return response({error:'請輸入開通密碼'},400);
        const {data:allowed,error:limitError}=await db.rpc('line_oa_kit_consume_unlock_attempt',{p_subject:identity.sub});
        if(limitError)return response({error:'目前無法驗證，請稍後再試'},503);
        if(allowed!==true)return response({error:'嘗試次數已達上限，請於 15 分鐘後重試'},429);
        if(!await passwordsMatch(b.password,expected))return response({error:'開通密碼不正確，請確認後重試'},403);
        // Ignore duplicates to preserve any existing setup and entitlement during retries.
        const {error:grantError}=await db.from('line_oa_kit_build_access').upsert({project_id:project.id,line_subject:identity.sub,grant_method:'manual_password'},{onConflict:'project_id',ignoreDuplicates:true});
        if(grantError)return response({error:'開通失敗，請稍後再試'},503);
        const {data:granted,error:readError}=await db.from('line_oa_kit_build_access').select('granted_at,grant_method,setup,setup_revision,updated_at').eq('project_id',project.id).eq('line_subject',identity.sub).single();
        if(readError)return response({error:'讀取開通狀態失敗，請重新整理'},503);
        return response({unlocked:true,access:granted});
      }
      if(!access)return response({error:'請先使用專員提供的密碼開通此專案'},403);
      if(b.action.startsWith('deploy_'))return await deploymentAction(b,db,identity.sub,project,access,response,p=>EdgeRuntime.waitUntil(p));
      if(b.action==='build_jobs'||b.action==='build_job'){
        // A stopped worker must never be silently retried with another paid request.
        await db.from('line_oa_kit_build_jobs').update({status:'interrupted',error_code:'worker_interrupted',updated_at:new Date().toISOString()}).eq('project_id',project.id).eq('line_subject',identity.sub).in('status',['queued','running']).lt('created_at',new Date(Date.now()-300000).toISOString());
        if(b.action==='build_job'){
          if(typeof b.jobId!=='string'||!/^[0-9a-f-]{36}$/i.test(b.jobId))return response({error:'工作編號不正確'},400);
          const {data:job,error}=await db.from('line_oa_kit_build_jobs').select('id,status,artifact,usage,error_code,cost_usd,created_at,updated_at,design_revision,setup_revision').eq('id',b.jobId).eq('project_id',project.id).eq('line_subject',identity.sub).maybeSingle();
          if(error)return response({error:'讀取工作失敗'},503);if(!job)return response({error:'工作不存在'},404);return response({job});
        }
        const {data:jobs,error}=await db.from('line_oa_kit_build_jobs').select('id,status,usage,error_code,cost_usd,created_at,design_revision,setup_revision').eq('project_id',project.id).eq('line_subject',identity.sub).order('created_at',{ascending:false}).limit(10);
        if(error)return response({error:'讀取工作紀錄失敗'},503);return response({jobs});
      }
      if(b.action==='save_build_setup'){
        let setup;try{setup=validateSetup(b.setup);}catch{return response({error:'設定欄位格式不正確'},400);}
        if(!Number.isSafeInteger(b.setupRevision)||b.setupRevision<0)return response({error:'版本格式不正確'},400);
        const {data:updated,error:updateError}=await db.from('line_oa_kit_build_access').update({setup,setup_revision:b.setupRevision+1,updated_at:new Date().toISOString()}).eq('project_id',project.id).eq('line_subject',identity.sub).eq('setup_revision',b.setupRevision).select('granted_at,grant_method,setup,setup_revision,updated_at').maybeSingle();
        if(updateError)return response({error:'保存建置設定失敗'},503);
        if(!updated)return response({error:'設定已在其他分頁變更，請重新載入確認'},409);
        return response({access:updated});
      }
      const setup=access.setup_revision>0?validateSetup(access.setup):emptySetup();
      const issues=requirementIssues(validateDraft(project.config),setup);
      if(b.action==='generate_source'){
        if(b.confirmGenerate!==true)return response({error:'請先確認本次 AI 網站草稿產生'},400);
        if(issues.length)return response({error:'請先補齊建置需求',issues},400);
        const apiKey=Deno.env.get('LINE_OA_KIT_BUILD_OPENAI_API_KEY')||'';if(!apiKey)return response({error:'平台 AI 建置金鑰尚未設定'},503);
        const snapshot={design:project.config,setup};if(JSON.stringify(textBuildSpec(snapshot)).length>24000)return response({error:'需求內容過長，請精簡後再試'},400);
        const {data:started,error}=await db.rpc('line_oa_kit_begin_build',{p_project:project.id,p_subject:identity.sub,p_design_revision:project.revision,p_setup_revision:access.setup_revision});
        if(error)return response({error:'無法建立工作，請稍後再試'},503);
        if(started.error)return response({error:started.error==='pilot_budget_exhausted'?'平台試行額度已用完，請聯絡專員':started.error==='revision_conflict'?'需求已變更，請重新載入':'請先開通專案'},409);
        if(started.created)EdgeRuntime.waitUntil(runBuildJob(db,started.job_id,apiKey));
        return response({jobId:started.job_id,status:started.status,reused:!started.created},202);
      }
      return response({requirementsReady:issues.length===0,issues,generationAvailable:Boolean(Deno.env.get('LINE_OA_KIT_BUILD_OPENAI_API_KEY')),deploymentReady:false,nextSteps:['先產生並檢查網站草稿','依下方圖片教學提供一次性 GitHub／Supabase／LINE 授權','部署後開啟 Use webhook，完成網站、LINE、LIFF 與選單驗收'],message:issues.length?'請先補齊需求與平台資訊':'需求檢查完成，可以先產生網站草稿；尚未執行部署'});
    }
    let config;try{config=validateDraft(b.config);}catch{return response({error:'請檢查欄位內容與長度'},400);}
    if(typeof b.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id)||!Number.isSafeInteger(b.revision)||b.revision<0)return response({error:'專案版本不正確'},400);
    if(b.revision===0){
      const {data,error}=await db.from('line_oa_kit_designs').insert({id:b.id,line_subject:identity.sub,config,revision:1}).select('id,revision,updated_at').single();
      if(error)return response({error:error.code==='23505'?'此專案已保存，請重新載入確認版本':'保存失敗，請稍後重試'},error.code==='23505'?409:503);
      return response({project:data});
    }
    const {data,error}=await db.from('line_oa_kit_designs').update({config,revision:b.revision+1,updated_at:new Date().toISOString()}).eq('id',b.id).eq('line_subject',identity.sub).eq('revision',b.revision).select('id,revision,updated_at').maybeSingle();
    if(error)return response({error:'保存失敗，請稍後重試'},503);
    if(!data)return response({error:'版本已變更或專案不存在，請先重新載入'},409);
    return response({project:data});
  }catch{return response({error:'暫時無法連線，請保留內容後重試'},503);}
});


