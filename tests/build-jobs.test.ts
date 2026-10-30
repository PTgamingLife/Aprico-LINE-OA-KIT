import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runBuildJob} from '../supabase/functions/_shared/run-build-job.ts';
import {readFileSync} from 'node:fs';
function database(claimed=true,finishError=false){
 const calls:any[]=[];const db:any={from(){return this;},update(){return this;},eq(){return this;},select(){return this;},async maybeSingle(){return{data:claimed?{id:'job',snapshot:{design:{name:'fixture'}}}:null,error:null};},async rpc(name:string,args:any){calls.push({name,args});return{error:finishError?Error('unavailable'):null,data:!finishError};}};return{db,calls};
}
const generated={artifact:{summary:'draft',files:[{path:'index.html',content:'<h1>draft</h1>'}],manualSteps:[]},usage:{inputTokens:10,outputTokens:20},model:'mock',responseId:'mock'};
test('duplicate worker claim never calls paid API',async()=>{const{db,calls}=database(false);let count=0;await runBuildJob(db,'job','not-a-key',async()=>{count++;return generated;});assert.equal(count,0);assert.equal(calls.length,0);});
test('successful artifact and usage are persisted once',async()=>{const{db,calls}=database();await runBuildJob(db,'job','not-a-key',async()=>generated);assert.equal(calls.length,1);assert.deepEqual(calls[0].args.p_artifact,generated.artifact);assert.equal(calls[0].args.p_usage.outputTokens,20);});
test('persistence failure never repeats paid generation',async()=>{const{db,calls}=database(true,true);let count=0;await runBuildJob(db,'job','not-a-key',async()=>{count++;return generated;});assert.equal(count,1);assert.equal(calls.length,1);});
test('unexpected provider errors are sanitized before storage',async()=>{const{db,calls}=database();await runBuildJob(db,'job','not-a-key',async()=>{throw Error('private upstream details');});assert.equal(calls[0].args.p_error,'build_request_failed');assert.equal(calls[0].args.p_artifact,null);});
test('five-build entitlement is locked server-side, idempotent before quota, and does not raise platform spend',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261030075819_five_build_credits.sql',import.meta.url),'utf8');
 assert.match(sql,/build_limit integer not null default 5/);assert.match(sql,/status in \('draft_ready','queued','running'\)/);assert.ok(sql.indexOf("'created',false")<sql.indexOf("'build_credits_exhausted'"));assert.ok(sql.indexOf('for update')<sql.indexOf("'build_credits_exhausted'"));assert.match(sql,/from public,anon,authenticated/);assert.doesNotMatch(sql,/set limit_usd|security definer/i);
 const ui=readFileSync(new URL('../src/BuildJobs.jsx',import.meta.url),'utf8');assert.match(ui,/credits\.remaining===0/);assert.match(ui,/失敗不扣/);
});
