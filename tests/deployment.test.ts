import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {credentials,deploymentTarget,preflight,executeDeployment,webhookSource} from '../supabase/functions/_shared/deploy-engine.ts';
import {deploymentAction} from '../supabase/functions/_shared/deploy-handler.ts';
import {emptyDraft} from '../src/model.ts';
import {emptySetup} from '../src/build-model.ts';
const project='11111111-1111-4111-8111-111111111111';
const setup={githubRepo:'https://github.com/customer/demo',supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',messagingChannelId:'1234567890',failure:'請聯絡專員'};
const snapshot={setup,design:{name:'My project',grid:4,cells:[{label:'預約',action:'message',content:'請留下時間'}]}};
const c={githubToken:'github-fixture',supabaseToken:'supabase-fixture',lineToken:'line-fixture',lineSecret:'0'.repeat(32)};
const artifact={summary:'draft',files:[{path:'index.html',content:'<h1>hello</h1>'}],manualSteps:[]};
function completeTargets(){const design=emptyDraft();design.name='Fixture';design.oaName='Fixture OA';design.cells.forEach(cell=>{cell.label='服務';cell.content='固定文字';});const s={...emptySetup(),...setup,audience:'顧客',purpose:'服務',scenario:'詢問',success:'收到回覆',human:'客服'};return{project:{id:project,revision:7,config:design},access:{setup:s,setup_revision:4}};}
test('pre-generation target check is read-only, uses saved targets and returns no credentials',async()=>{
 const f=completeTargets(),m=mock();const r=await deploymentAction({action:'deploy_target_check',credentials:c,setup:{githubRepo:'https://evil.example'}},{},'verified-subject',f.project,f.access,(v,s=200)=>Response.json(v,{status:s}),()=>{throw Error('must not start work');},m.fetcher);
 assert.equal(r.status,200);const out=await r.json();assert.equal(out.plan.githubRepo,'customer/demo');assert.equal(out.designRevision,7);assert.equal(out.setupRevision,4);assert.ok(!JSON.stringify(out).includes(c.lineToken));assert.ok(m.calls.every(x=>x.method==='GET'||x.url==='https://api.line.me/v2/oauth/verify'));
});
test('unsupported runtime modules are refused before any network or paid generation',async()=>{
 const f=completeTargets();f.access.setup.runtimeAiProvider='openai';let calls=0;
 const r=await deploymentAction({action:'deploy_target_check',credentials:c},{},'verified',f.project,f.access,(v,s=200)=>Response.json(v,{status:s}),()=>{throw Error('must not start work');},async()=>{calls++;throw Error('must not call');});assert.equal(r.status,409);assert.equal(calls,0);
});
test('App preflight uses a server-resolved repository identity and revokes its token after checking',async()=>{
 const f=completeTargets(),m=mock();let released=0,resolved=0;
 const fetcher=(async(url:any,init:any)=>{const r=await m.fetcher(url,init);if(new URL(url).pathname==='/repos/customer/demo')return Response.json({...await r.json(),id:8,permissions:undefined});return r;}) as typeof fetch;
 const result=await deploymentAction({action:'deploy_target_check',githubApp:true,credentials:{...c,githubToken:''}},{},'verified',f.project,f.access,(v,s=200)=>Response.json(v,{status:s}),()=>{},fetcher,async()=>{resolved++;return {token:'installation-fixture',repositoryId:8,release:async()=>{released++;}};});
 assert.equal(result.status,200);assert.equal(resolved,1);assert.equal(released,1);assert.ok(m.calls.filter(x=>x.url.startsWith('https://api.github.com')).every(x=>x.headers.Authorization==='Bearer installation-fixture'));assert.ok(!(await result.text()).includes('installation-fixture'));
});
test('failed App preflight revokes its token and cannot fall back to a supplied manual token',async()=>{
 const f=completeTargets(),m=mock({error:true});let released=0;
 const result=await deploymentAction({action:'deploy_target_check',githubApp:true,credentials:c},{},'verified',f.project,f.access,(v,s=200)=>Response.json(v,{status:s}),()=>{},m.fetcher,async()=>({token:'app-fixture',repositoryId:8,release:async()=>{released++;}}));
 assert.equal(result.status,409);assert.equal(released,1);assert.ok(m.calls.every(x=>x.headers.Authorization!=='Bearer '+c.githubToken));
 assert.equal((credentials({...c,githubRepositoryId:8}) as any).githubRepositoryId,undefined);
});
function mock(options:any={}){
 const calls:any[]=[];
 const fetcher=(async(url:any,init:any={})=>{const u=new URL(url),path=u.pathname;calls.push({url:String(url),method:init.method||'GET',body:init.body,headers:init.headers,redirect:init.redirect});
  if(options.error)return new Response('sensitive provider details',{status:403});
  let value:any={};let status=200;
  if(path==='/repos/customer/demo')value={full_name:'customer/demo',permissions:{push:true},private:false,default_branch:'main'};
  else if(path.endsWith('/git/ref/heads/main'))value={object:{sha:'initial'}};
  else if(path.endsWith('/pages')&&init.method==='GET'){if(options.existingPages)value={source:{branch:'main'}};else status=404;}
  else if(path.includes('/git/ref/heads/aprico-')||path.includes('/functions/aprico-'))status=404;
  else if(path==='/v1/projects/abcdefghijklmnopqrst')value={id:'abcdefghijklmnopqrst',name:'Customer project'};
  else if(path==='/v2/bot/info')value={userId:'U'+'1'.repeat(32),displayName:'Customer OA',basicId:'@demo'};
  else if(path==='/v2/oauth/verify')value={client_id:options.wrongChannel?'55555555':setup.messagingChannelId};
  else if(path==='/v2/bot/channel/webhook/endpoint')value={endpoint:init.method==='GET'&&options.existingWebhook?'https://existing.example/hook':''};
  else if(path.endsWith('/git/trees'))value={sha:'tree'};
  else if(path.endsWith('/git/commits'))value={sha:'commit'};
  else if(path==='/v2/bot/channel/webhook/test')value={success:options.badSignature?false:true};
  return Response.json(value,{status});}) as typeof fetch;
 return{fetcher,calls};
}
test('credentials and target validation reject missing secrets and SSRF',()=>{assert.throws(()=>credentials({...c,lineSecret:'wrong'}));assert.throws(()=>deploymentTarget(project,{...setup,supabaseUrl:'https://attacker.example'}));assert.throws(()=>deploymentTarget(project,{...setup,githubRepo:'https://github.com@attacker.example/a/b'}));assert.equal(deploymentTarget(project,setup,'My project').prefix.startsWith('MY_PROJECT_'),true);});
test('preflight makes no resource writes and never returns credentials',async()=>{const{fetcher,calls}=mock();const plan=await preflight(project,snapshot,c,fetcher);assert.equal(plan.botName,'Customer OA');assert.ok(!JSON.stringify(plan).includes(c.lineToken));assert.ok(calls.every(x=>x.method==='GET'||x.url==='https://api.line.me/v2/oauth/verify'));assert.ok(calls.every(x=>x.redirect==='error'));});
test('existing website, mismatched channel and existing webhook block deployment',async()=>{for(const options of [{existingPages:true},{wrongChannel:true},{existingWebhook:true}]){const{fetcher,calls}=mock(options);await assert.rejects(preflight(project,snapshot,c,fetcher));assert.ok(calls.every(x=>x.method==='GET'||x.url==='https://api.line.me/v2/oauth/verify'));}});
test('deployment writes only isolated branch, project secrets and signed webhook',async()=>{const{fetcher,calls}=mock();const plan=await preflight(project,snapshot,c,fetcher),stages:string[]=[];await executeDeployment(plan,snapshot,artifact,c,async s=>{stages.push(s);},fetcher);assert.equal(stages.at(-1),'awaiting_acceptance');const ref=calls.find(x=>x.url.endsWith('/git/refs'));assert.ok(JSON.parse(ref.body).ref.startsWith('refs/heads/aprico-'));assert.ok(!calls.some(x=>x.method==='PATCH'||x.method==='DELETE'));const tree=calls.find(x=>x.url.endsWith('/git/trees'));assert.ok(!tree.body.includes(c.lineSecret));const form=calls.find(x=>x.url.includes('functions/deploy')).body;assert.equal(JSON.parse(form.get('metadata')).verify_jwt,false);const source=await form.get('file').text();assert.ok(source.includes("crypto.subtle.verify('HMAC'"));assert.ok(!source.includes(c.lineSecret));});
test('wrong Channel Secret test stops before switching OA webhook',async()=>{const{fetcher,calls}=mock({badSignature:true});const plan=await preflight(project,snapshot,c,fetcher);await assert.rejects(executeDeployment(plan,snapshot,artifact,c,async()=>{},fetcher),/webhook_signature_or_readiness_failed/);assert.ok(!calls.some(x=>x.method==='PUT'));});
test('upstream error responses never disclose credentials or response bodies',async()=>{const{fetcher}=mock({error:true});await assert.rejects(preflight(project,snapshot,c,fetcher),e=>e instanceof Error&&e.message==='github_403');});
test('backend ignores unsigned events, redirects and repeat delivery',()=>{const source=webhookSource('TEST',{'__proto__':'safe'},'fallback');assert.ok(source.includes('Object.hasOwn'));assert.ok(source.includes('isRedelivery'));assert.ok(source.includes('status:401'));assert.ok(!source.includes('console.log'));});
test('trusted webhook actually verifies HMAC before processing events',async()=>{
 let handler:any;let replies=0;const secret='fixture-secret';
 vm.runInNewContext(webhookSource('TEST',{'預約':'已收到預約'},'fallback'),{Deno:{serve(fn:any){handler=fn;},env:{get(key:string){return key.endsWith('_SECRET')?secret:'fixture-token';}}},crypto,TextEncoder,TextDecoder,Uint8Array,Response,AbortSignal,atob,fetch:async()=>{replies++;return new Response('{}');}});
 const body=JSON.stringify({events:[{type:'message',message:{type:'text',text:'預約'},replyToken:'fixture'}]});
 assert.equal((await handler(new Request('https://example.test',{method:'POST',body}))).status,401);assert.equal(replies,0);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))));
 assert.equal((await handler(new Request('https://example.test',{method:'POST',body,headers:{'x-line-signature':sig}}))).status,200);assert.equal(replies,1);
 const altered=body.replace('預約','其他');assert.equal((await handler(new Request('https://example.test',{method:'POST',body:altered,headers:{'x-line-signature':sig}}))).status,401);assert.equal(replies,1);
});
