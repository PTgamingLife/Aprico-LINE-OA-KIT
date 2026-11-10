import {credentials,preflight,type RuntimeDeployment} from './deploy-engine.ts';
import {decodeMenuImage,safeTrialExternal} from '../../../src/trial-model.ts';
import {pagesReleaseLive} from './deploy-integrations.ts';
import {runDeployment} from './run-deployment.ts';
import {validateSetup,requirementIssues} from '../../../src/build-model.ts';
export function deploymentIssue(design:any,setup:any,platformReady:boolean){
 const cells=design.cells.slice(0,design.grid);
 const secretary=design.secretary;
 if(cells.some((c:any)=>c.template==='health'||c.preset&&!['interactive','games'].includes(c.preset)))return '選單含需要專用後端的模板，目前可核對設計，請聯絡專員安排建置。';
 if(!['none','platform'].includes(setup.runtimeAiProvider))return '目前營運 AI 自動部署使用 Aprico 平台點數方案。';
 if(setup.runtimeAiProvider==='platform'&&!platformReady)return '請先完成 Aprico 平台 AI 點數方案與設計確認。';
 if(secretary?.direction&&secretary.direction!=='oa'){
  const routes=secretary.routes??[];
  if(setup.runtimeAiProvider!=='platform'||secretary.conversation!=='personal'||!routes.length||routes.some((r:any)=>r.destination!=='none'||r.recipient==='dashboard'||r.format==='web'||['image-record','digest'].includes(r.id))){
   return '對話秘書目前可自動建置私聊即時文字或卡片回覆。群組、資料留存、管理頁、圖片辨識與定時摘要需要另外串接。';
  }
 }
 return '';
}

export async function deploymentAction(b:any,db:any,subject:string,project:any,access:any,response:(value:any,status?:number)=>Response,background:(p:Promise<void>)=>void,fetcher:typeof fetch=fetch,resolveGithub?:(()=>Promise<{token:string;repositoryId:number;actionsPages?:boolean;release:()=>Promise<void>}>),provisionRuntime?:()=>Promise<RuntimeDeployment>){
 if(b.action==='deploy_github_check'){
  try{
   if(b.flowVersion!==2||!resolveGithub)return response({error:'請從 GitHub 關卡重新核對'},400);
   const grant=await resolveGithub();
   await grant.release().catch(()=>{});
   return response({verified:true});
  }catch(e){
   const code=e instanceof Error&&/^github_[a-z_]+$/.test(e.message)?e.message:'github_access_unavailable';
   return response({error:'GitHub 專案部署授權核對未通過',code},409);
  }
 }
 let release:(()=>Promise<void>)|undefined;
 async function readCredentials(){
  if(b.githubApp!==true)return credentials(b.credentials);
  if(!resolveGithub)throw Error('github_app_not_available');
  const grant=await resolveGithub();release=grant.release;
  return {...credentials({...b.credentials,githubToken:grant.token}),githubRepositoryId:grant.repositoryId,actionsPages:b.flowVersion===2&&grant.actionsPages===true};
 }
 const fields='id,build_job_id,status,stage,target,app_url,webhook_url,commit_sha,system_checks,user_checks,error_code,created_at,updated_at';
 if(b.action==='deploy_target_check'){
  let c;
  try{
   const setup=validateSetup(access.setup);
   if(requirementIssues(project.config,setup).length)return response({error:'請先保存並完成需求與帳號資料'},409);
   const issue=deploymentIssue(project.config,setup,Boolean(provisionRuntime));if(issue)return response({error:issue},409);
   c=await readCredentials();
   if(b.flowVersion===2&&!c.actionsPages)throw Error('github_workflows_permission_required');
   if(b.flowVersion===2&&project.config.secretary?.direction!=='records'&&project.config.cells.slice(0,project.config.grid).some((cell:any)=>cell.action==='web'&&!safeTrialExternal(cell.content)))throw Error('line_menu_invalid_destination');
   const plan=await preflight(project.id,{setup,design:project.config},c,fetcher,b.flowVersion===2);
   return response({plan,designRevision:project.revision,setupRevision:access.setup_revision});
  }catch(e){const code=e instanceof Error&&/^[a-z][a-z0-9_]{0,90}$/.test(e.message)?e.message:'deployment_preflight_failed';console.warn('aprico deployment preflight:',code);return response({error:'授權檢查未通過，請確認本關資料',code},409);}
  finally{if(c)for(const key of ['githubToken','supabaseToken','lineToken','lineSecret','loginSecret'] as const)c[key]='';await release?.().catch(()=>{});}
 }
 if(b.action==='deploy_status'){
  await db.from('line_oa_kit_deployments').update({status:'interrupted',error_code:'worker_interrupted',updated_at:new Date().toISOString()}).eq('project_id',project.id).eq('line_subject',subject).in('status',['queued','running']).lt('created_at',new Date(Date.now()-300000).toISOString());
  const{data,error}=await db.from('line_oa_kit_deployments').select(fields).eq('project_id',project.id).eq('line_subject',subject).order('created_at',{ascending:false}).limit(10);
  if(error)return response({error:'無法讀取部署紀錄'},503);
  const latest=data.find((record:any)=>record.status==='awaiting_acceptance'&&record.system_checks?.pagesMode==='actions'&&!record.system_checks.pagesLive);
  if(latest&&await pagesReleaseLive(latest,fetcher)){
   const checks={...latest.system_checks,pagesLive:true};
   const updated=await db.from('line_oa_kit_deployments').update({system_checks:checks}).eq('id',latest.id).eq('line_subject',subject).eq('project_id',project.id).eq('status','awaiting_acceptance');
   if(!updated.error)latest.system_checks=checks;
  }
  return response({deployments:data});
 }
 if(b.action==='deploy_acceptance'){
  if(typeof b.deploymentId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.deploymentId))return response({error:'部署編號錯誤'},400);
  const current=await db.from('line_oa_kit_deployments').select('system_checks').eq('id',b.deploymentId).eq('project_id',project.id).eq('line_subject',subject).eq('status','awaiting_acceptance').maybeSingle();
  if(current.error)return response({error:'無法核對部署狀態'},503);
  if(current.data?.system_checks?.pagesMode==='actions'&&!current.data.system_checks.pagesLive)return response({error:'GitHub Pages 尚在發布，請更新進度後再驗收'},409);
  const checks:any={};for(const key of ['website','lineMessage','menu','liff'])checks[key]=b.checks?.[key]===true;
  const{data,error}=await db.from('line_oa_kit_deployments').update({user_checks:checks,updated_at:new Date().toISOString()}).eq('id',b.deploymentId).eq('project_id',project.id).eq('line_subject',subject).eq('status','awaiting_acceptance').select(fields).maybeSingle();
  return error?response({error:'保存驗收失敗'},503):data?response({deployment:data}):response({error:'尚無可驗收的部署'},409);
 }
 if(typeof b.jobId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.jobId))return response({error:'請選擇已完成的網站草稿'},400);
 const{data:job,error}=await db.from('line_oa_kit_build_jobs').select('id,status,snapshot,artifact,design_revision,setup_revision').eq('id',b.jobId).eq('project_id',project.id).eq('line_subject',subject).maybeSingle();
 if(error)return response({error:'讀取草稿失敗'},503);
 if(!job||job.status!=='draft_ready')return response({error:'草稿尚未完成'},409);
 if(job.design_revision!==project.revision||job.setup_revision!==access.setup_revision)return response({error:'需求已修改，請重新產生相同版本的草稿再部署'},409);
 const issue=deploymentIssue(job.snapshot.design,job.snapshot.setup,Boolean(provisionRuntime));if(issue)return response({error:issue},409);
 if(b.action==='deploy_start'){
  const{data:existing,error}=await db.from('line_oa_kit_deployments').select('id').eq('build_job_id',job.id).eq('line_subject',subject).maybeSingle();
  if(error)return response({error:'無法檢查部署紀錄'},503);if(existing)return response({deploymentId:existing.id,reused:true},202);
  if(b.confirmPublish!==true)return response({error:'請先確認本次公開發布與目標平台'},400);
 }
 let c;try{c=await readCredentials();}catch(e){
  await release?.().catch(()=>{});
  const code=e instanceof Error&&/^github_[a-z_]+$/.test(e.message)?e.message:undefined;
  return response({error:code?'GitHub 專案部署授權核對未通過':'請確認部署授權仍有效，Secret 應為 32 位英數十六進位。',code},400);
 }
 try{
  if(b.flowVersion===2&&!c.actionsPages)throw Error('github_workflows_permission_required');
  if(b.flowVersion===2&&b.action==='deploy_start'&&job.snapshot.design.secretary?.direction!=='records')decodeMenuImage(b.menuImage);
  const plan=await preflight(project.id,job.snapshot,c,fetcher,b.flowVersion===2);
  if(b.action==='deploy_prepare')return response({plan});
  if(b.expectedBotId!==plan.botId||b.expectedGithub!==plan.githubRepo||b.expectedRef!==plan.ref||b.flowVersion===2&&(b.expectedLoginId!==plan.loginId||b.expectedWebhook!==plan.previousWebhook||b.expectedMenuId!==plan.previousMenuId))return response({error:'部署目標已變更，請重新檢查並確認'},409);
  const{data:started,error}=await db.rpc('line_oa_kit_begin_deployment',{p_job:job.id,p_subject:subject,p_target:plan});
  if(error)return response({error:'建立部署工作失敗'},503);if(started.error)return response({error:'版本已變更或已有部署正在執行，請重新整理'},409);
  if(started.created){const captured=c,cleanup=release;c=undefined;release=undefined;background((async()=>{try{await runDeployment(db,started.id,plan,job.snapshot,job.artifact,captured,job.snapshot.setup.runtimeAiProvider==='platform'?provisionRuntime:undefined,b.flowVersion===2?b.menuImage:undefined);}finally{await cleanup?.().catch(()=>{});}})());}
  return response({deploymentId:started.id,reused:!started.created},202);
 }catch(e){const code=e instanceof Error&&/^[a-z][a-z0-9_]{0,90}$/.test(e.message)?e.message:'deployment_preflight_failed';return response({error:'部署檢查未通過：'+code,code},409);}
 finally{if(c)for(const key of ['githubToken','supabaseToken','lineToken','lineSecret','loginSecret'] as const)c[key]='';await release?.().catch(()=>{});}
}
