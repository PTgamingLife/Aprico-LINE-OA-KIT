import {executeDeployment,type DeployCredentials,type RuntimeDeployment} from './deploy-engine.ts';
export async function runDeployment(db:any,id:string,plan:any,snapshot:any,artifact:unknown,c:DeployCredentials,provisionRuntime?:()=>Promise<RuntimeDeployment>,menuImage?:string){
 let runtime:RuntimeDeployment|undefined;
 try{
  const {data,error}=await db.from('line_oa_kit_deployments').update({status:'running',stage:'checking',updated_at:new Date().toISOString()}).eq('id',id).eq('status','queued').select('id').maybeSingle();if(error||!data)return;
  runtime=await provisionRuntime?.();
  await executeDeployment(plan,snapshot,artifact,c,async(stage,extra={})=>{const {data,error}=await db.from('line_oa_kit_deployments').update({stage,...extra,status:stage==='awaiting_acceptance'?'awaiting_acceptance':'running',updated_at:new Date().toISOString()}).eq('id',id).eq('status','running').select('id').maybeSingle();if(error||!data)throw Error('progress_persist_failed');},fetch,runtime,menuImage);
 }catch(e){
  await runtime?.revoke().catch(()=>{});
  const code=e instanceof Error&&/^[a-z][a-z0-9_]{0,90}$/.test(e.message)?e.message:'deployment_request_failed';
  await db.from('line_oa_kit_deployments').update({status:'failed',error_code:code,updated_at:new Date().toISOString()}).eq('id',id).in('status',['queued','running']);
 }finally{if(runtime)runtime.key='';for(const key of ['githubToken','supabaseToken','lineToken','lineSecret','loginSecret'] as const)c[key]='';}
}
