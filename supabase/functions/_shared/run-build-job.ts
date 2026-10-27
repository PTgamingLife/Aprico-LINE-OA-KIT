import {generateSource} from './source-builder.ts';
export async function runBuildJob(db:any,jobId:string,apiKey:string,generator:typeof generateSource=generateSource){
 const {data:job,error}=await db.from('line_oa_kit_build_jobs').update({status:'running',updated_at:new Date().toISOString()}).eq('id',jobId).eq('status','queued').select('id,snapshot').maybeSingle();
 if(error||!job)return;
 try{
  const generated=await generator(apiKey,job.snapshot);
  const {error:finishError}=await db.rpc('line_oa_kit_finish_build',{p_job:job.id,p_artifact:generated.artifact,p_usage:{...generated.usage,model:generated.model,responseId:generated.responseId},p_error:null});
  // Do not rerun paid generation if result persistence fails. The job remains visible for review.
  if(finishError)return;
 }catch(e){
  const code=e instanceof Error&&/^(openai_\d+|generation_incomplete|invalid_generation_json|invalid_artifact|invalid_artifact_path|secret_in_artifact|missing_index|spec_too_large|build_key_missing)$/.test(e.message)?e.message:'build_request_failed';
  await db.rpc('line_oa_kit_finish_build',{p_job:job.id,p_artifact:null,p_usage:null,p_error:code});
 }
}
