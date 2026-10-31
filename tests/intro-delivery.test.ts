import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {processIntroJob,introFollowGateway} from '../supabase/functions/_shared/intro-delivery.ts';
import {oaWelcomeCard} from '../src/onboarding-cards.ts';
const subject='U'+'1'.repeat(32),id='12345678-1234-4234-8234-123456789abc',claim='22345678-1234-4234-8234-123456789abc';
const event={type:'follow',webhookEventId:'event-1',timestamp:Date.now(),source:{type:'user',userId:subject},follow:{isUnblocked:false}};
function fixture(options:any={}){
 const calls:any[]=[],network:any[]=[];
 const job={id,claim_key:claim,kind:options.broadcast?'broadcast':'push',subject:options.broadcast?null:subject,card:1,config:oaWelcomeCard()};
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});
  if(name==='line_oa_kit_intro_claim')return {data:options.idle?{}:job};
  if(name==='line_oa_kit_intro_begin')return {data:!options.beginDenied};
  if(name==='line_oa_kit_intro_finish')return {data:!options.auditFailed};
  throw Error('unexpected RPC');
 }};
 const fetcher:typeof fetch=async(url,init)=>{
  const path=String(url).replace('https://api.line.me/v2/bot','');network.push({path,init});
  if(path==='/info')return Response.json({basicId:options.wrongBot?'@wrong':'@228srwlt'});
  if(path==='/message/quota')return Response.json({type:'limited',value:options.noQuota?0:200});
  if(path==='/message/quota/consumption')return Response.json({totalUsage:0});
  if(path.startsWith('/insight/followers'))return Response.json({status:'ready',followers:4});
  if(path.startsWith('/message/validate/'))return Response.json({});
  if(path==='/message/push'||path==='/message/broadcast'){
   assert.ok(calls.some(c=>c.name==='line_oa_kit_intro_begin'));
   assert.equal(new Headers(init?.headers).get('x-line-retry-key'),id);
   if(options.timeout)throw Error('private-key-never-return');
   return new Response('{}',{status:options.sendStatus||200,headers:{'x-line-request-id':'fixture-request'}});
  }
  throw Error('unexpected network path');
 };
 return {db,fetcher,calls,network};
}
test('only authenticated Aprico direct-user follow events can enroll',async()=>{
 let calls=0;const db={rpc:async()=>{calls++;return {data:{}};}};
 for(const e of [event,{...event,source:{type:'group',userId:subject}},{...event,type:'message'},{...event,source:{type:'user',userId:'bad'}}]){
  await introFollowGateway(e,{authenticated:false,db,token:''});
 }
 assert.equal(calls,0);
 assert.equal(await introFollowGateway(event,{authenticated:true,db,token:''}),true);assert.equal(calls,1);
});
test('follow only runs first job returned by the atomic enrollment',async()=>{
 const seen:any[]=[];const db={rpc:async(name:string,args:any)=>{seen.push({name,args});return {data:{firstJob:id}};}};
 await introFollowGateway(event,{authenticated:true,db,token:'',process:async(job)=>{seen.push(job);}});
 assert.equal(seen[1],id);assert.equal(seen[0].args.p_unblocked,false);
});
test('idle or claim errors never touch LINE',async()=>{
 const f=fixture({idle:true});assert.deepEqual(await processIntroJob(f.db,'token',null,f.fetcher),{idle:true});assert.equal(f.network.length,0);
 await assert.rejects(processIntroJob({rpc:async()=>({error:{}})},'token',null,f.fetcher));assert.equal(f.network.length,0);
});
test('send happens once after begin, with a stable retry key and audit',async()=>{
 const f=fixture();const r=await processIntroJob(f.db,'token',id,f.fetcher);assert.equal(r.status,'accepted');assert.equal(r.auditSaved,true);
 assert.deepEqual(f.network.filter(n=>n.path==='/message/push').map(n=>JSON.parse(n.init.body).to),[subject]);
 assert.equal(f.calls.at(-1).args.p_status,'accepted');
});
test('broadcast never uses a fabricated website-user audience',async()=>{
 const f=fixture({broadcast:true});await processIntroJob(f.db,'token',null,f.fetcher);
 const sends=f.network.filter(n=>n.path==='/message/broadcast');assert.equal(sends.length,1);assert.equal(JSON.parse(sends[0].init.body).to,undefined);
});
test('failed preflight or rejected second claim cannot send',async()=>{
 for(const opts of [{wrongBot:true},{noQuota:true},{beginDenied:true}]){
  const f=fixture(opts);await processIntroJob(f.db,'token',id,f.fetcher);assert.equal(f.network.filter(n=>n.path==='/message/push').length,0);
 }
});
test('unknown send is audited and never retried inside worker',async()=>{
 const f=fixture({timeout:true});const r=await processIntroJob(f.db,'token',id,f.fetcher);assert.equal(r.status,'unknown');assert.equal(f.calls.at(-1).args.p_status,'unknown');assert.equal(f.network.filter(n=>n.path==='/message/push').length,1);assert.doesNotMatch(JSON.stringify(r),/private-key/);
});
test('audit failure does not retry the send',async()=>{
 const f=fixture({auditFailed:true});const r=await processIntroJob(f.db,'token',id,f.fetcher);assert.equal(r.auditSaved,false);assert.equal(f.network.filter(n=>n.path==='/message/push').length,1);
});
test('queue auth never accepts browser keys, arbitrary URLs, or caller-provided mode',()=>{
 const source=readFileSync(new URL('../supabase/functions/line-oa-kit-intro/index.ts',import.meta.url),'utf8');
 assert.match(source,/x-intro-tick/);assert.match(source,/\.is\('claimed_at',null\)/);assert.match(source,/\.gt\('expires_at'/);assert.match(source,/data.mode==='check'/);assert.doesNotMatch(source,/req\.json|SUPABASE_ANON_KEY|Access-Control-Allow-Origin/);
});
test('LINE receives 503 rather than a success acknowledgement if follow persistence fails',async()=>{
 const source=readFileSync(new URL('../supabase/functions/line-assistant/index.ts',import.meta.url),'utf8');
 const code=stripTypeScriptTypes(source.split('\n').filter(line=>!line.startsWith('import ')).join('\n'));
 let handler:any;
 new Function('Deno','createClient','validLineSignature','trialLine','exitTrial','routeAssistantEvent','broadcastGateway','introFollowGateway','processIntroJob',code)(
  {env:{get:()=>''},serve:(f:any)=>{handler=f;}},()=>({}),async()=>true,()=>async()=>{},async()=>{},async()=>{},async()=>false,async()=>{throw Error('database unavailable');},async()=>{throw Error('must not send');}
 );
 const result=await handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({events:[event]})}));assert.equal(result.status,503);
});
