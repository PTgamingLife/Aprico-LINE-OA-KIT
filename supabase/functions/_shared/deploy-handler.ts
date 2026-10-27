import {credentials,preflight} from './deploy-engine.ts';
import {runDeployment} from './run-deployment.ts';
export async function deploymentAction(b:any,db:any,subject:string,project:any,access:any,response:(value:any,status?:number)=>Response,background:(p:Promise<void>)=>void){
 const fields='id,build_job_id,status,stage,target,app_url,webhook_url,commit_sha,system_checks,user_checks,error_code,created_at,updated_at';
 if(b.action==='deploy_status'){
  await db.from('line_oa_kit_deployments').update({status:'interrupted',error_code:'worker_interrupted',updated_at:new Date().toISOString()}).eq('project_id',project.id).eq('line_subject',subject).in('status',['queued','running']).lt('created_at',new Date(Date.now()-300000).toISOString());
  const{data,error}=await db.from('line_oa_kit_deployments').select(fields).eq('project_id',project.id).eq('line_subject',subject).order('created_at',{ascending:false}).limit(10);return error?response({error:'無法讀取部署紀錄'},503):response({deployments:data});
 }
 if(b.action==='deploy_acceptance'){
  if(typeof b.deploymentId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.deploymentId))return response({error:'部署編號錯誤'},400);
  const checks:any={};for(const key of ['website','lineMessage','menu','liff'])checks[key]=b.checks?.[key]===true;
  const{data,error}=await db.from('line_oa_kit_deployments').update({user_checks:checks,updated_at:new Date().toISOString()}).eq('id',b.deploymentId).eq('project_id',project.id).eq('line_subject',subject).eq('status','awaiting_acceptance').select(fields).maybeSingle();
  return error?response({error:'保存驗收失敗'},503):data?response({deployment:data}):response({error:'尚無可驗收的部署'},409);
 }
 if(typeof b.jobId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.jobId))return response({error:'請選擇已完成的網站草稿'},400);
 const{data:job,error}=await db.from('line_oa_kit_build_jobs').select('id,status,snapshot,artifact,design_revision,setup_revision').eq('id',b.jobId).eq('project_id',project.id).eq('line_subject',subject).maybeSingle();
 if(error)return response({error:'讀取草稿失敗'},503);
 if(!job||job.status!=='draft_ready')return response({error:'草稿尚未完成'},409);
 if(job.design_revision!==project.revision||job.setup_revision!==access.setup_revision)return response({error:'需求已修改，請重新產生相同版本的草稿再部署'},409);
 // First release: deploy static apps + fixed text replies only, never pretend AI/database features work.
 if(job.snapshot.setup.runtimeAiProvider!=='none'||job.snapshot.design.cells.slice(0,job.snapshot.design.grid).some((c:any)=>c.template==='health'))return response({error:'本版自動部署支援靜態互動與固定文字回覆；營運 AI／健康檢測後端尚未開放'},409);
 if(b.action==='deploy_start'){
  const{data:existing,error}=await db.from('line_oa_kit_deployments').select('id').eq('build_job_id',job.id).eq('line_subject',subject).maybeSingle();
  if(error)return response({error:'無法檢查部署紀錄'},503);if(existing)return response({deploymentId:existing.id,reused:true},202);
  if(b.confirmPublish!==true)return response({error:'請先確認本次公開發布與目標平台'},400);
 }
 let c;try{c=credentials(b.credentials);}catch{return response({error:'請填寫四項一次性部署憑證，Secret 應為 32 位英數十六進位'},400);}
 try{
  const plan=await preflight(project.id,job.snapshot,c);
  if(b.action==='deploy_prepare')return response({plan});
  if(b.expectedBotId!==plan.botId||b.expectedGithub!==plan.githubRepo||b.expectedRef!==plan.ref)return response({error:'部署目標已變更，請重新檢查並確認'},409);
  const{data:started,error}=await db.rpc('line_oa_kit_begin_deployment',{p_job:job.id,p_subject:subject,p_target:plan});
  if(error)return response({error:'建立部署工作失敗'},503);if(started.error)return response({error:'版本已變更或已有部署正在執行，請重新整理'},409);
  if(started.created){const captured=c;c=undefined;background(runDeployment(db,started.id,plan,job.snapshot,job.artifact,captured));}
  return response({deploymentId:started.id,reused:!started.created},202);
 }catch(e){const code=e instanceof Error&&/^[a-z][a-z0-9_]{0,90}$/.test(e.message)?e.message:'deployment_preflight_failed';return response({error:'部署檢查未通過：'+code,code},409);}
 finally{if(c)for(const key of Object.keys(c) as (keyof typeof c)[])c[key]='';}
}
