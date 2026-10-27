import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {credentials,deploymentTarget,preflight,executeDeployment,webhookSource} from '../supabase/functions/_shared/deploy-engine.ts';
const project='11111111-1111-4111-8111-111111111111';
const setup={githubRepo:'https://github.com/customer/demo',supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',messagingChannelId:'1234567890',failure:'請聯絡專員'};
const snapshot={setup,design:{name:'My project',grid:4,cells:[{label:'預約',action:'message',content:'請留下時間'}]}};
const c={githubToken:'github-fixture',supabaseToken:'supabase-fixture',lineToken:'line-fixture',lineSecret:'0'.repeat(32)};
const artifact={summary:'draft',files:[{path:'index.html',content:'<h1>hello</h1>'}],manualSteps:[]};
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
