import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {launchGithub} from '../src/github-launch.js';
import {githubNotice,githubInstallationSettings} from '../src/github-result.ts';
import {githubConfiguration,githubSettings,githubCallback,authorizeUrl,digest,randomValue,repositoryChoice,appJwt,installationToken,exchangeCode,choicesForUser,webhookValid} from '../supabase/functions/_shared/github-app.ts';
import {githubAction,githubCallbackAction,githubWebhook,boundedBody} from '../supabase/functions/_shared/github-handler.ts';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const settings={id:'123',clientId:'Iv1.fixture',clientSecret:'fixture-secret',privateKey:pair.privateKey.export({type:'pkcs1',format:'pem'}).toString(),slug:'aprico-test',webhookSecret:'fixture-hook'};
const env=(key:string)=>Object.entries({ENABLED:'true',APP_ID:settings.id,CLIENT_ID:settings.clientId,CLIENT_SECRET:settings.clientSecret,PRIVATE_KEY:settings.privateKey,APP_SLUG:settings.slug,WEBHOOK_SECRET:settings.webhookSecret}).find(([suffix])=>key==='LINE_OA_KIT_GITHUB_'+suffix)?.[1];
const project='00000000-0000-0000-0000-000000000001',flowId='00000000-0000-0000-0000-000000000002';
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
// In-memory PostgREST adapter exercises atomic conditional claims and owner filters.
function memory(initial:any={}){
 const tables:any={line_oa_kit_github_flows:[],line_oa_kit_github_connections:[],...initial};
 const calls:any[]=[];
 return {tables,calls,from(table:string){let changes:any=null;const filters:((r:any)=>boolean)[]=[];let sort=false,limit=Infinity;
  const q:any={update(v:any){changes=v;calls.push({table,changes:v});return q;},select(){return q;},eq(k:string,v:any){filters.push(r=>r[k]===v);return q;},gt(k:string,v:any){filters.push(r=>r[k]>v);return q;},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q;},contains(k:string,v:any[]){filters.push(r=>v.every(part=>(r[k]||[]).some((x:any)=>Object.entries(part).every(([key,value])=>x[key]===value))));return q;},order(){sort=true;return q;},limit(n:number){limit=n;return q;},
   async maybeSingle(){const r=await run();return {data:r.data[0]||null,error:null};},then(a:any,b:any){return run().then(a,b);}};
  async function run(){let rows=tables[table].filter((r:any)=>filters.every(f=>f(r)));if(sort)rows=rows.toReversed();rows=rows.slice(0,limit);if(changes)for(const r of rows)Object.assign(r,changes);return {data:structuredClone(rows),error:null};}return q;
 },async rpc(name:string,args:any){calls.push({name,args});return {data:true,error:null};}};
}
const choice={id:8,full_name:'owner/demo',private:false,permissions:{push:true,admin:true}};
function githubMock(){const calls:any[]=[];const fetcher=async(url:any,options:any={})=>{calls.push({url:String(url),...options});const path=new URL(url).pathname;
 if(path==='/login/oauth/access_token')return json({access_token:'ghu_fixture',expires_in:28800,refresh_token:'never-persist'});
 if(path==='/user')return json({id:7,login:'owner'});
 if(path==='/user/installations')return json({installations:[{id:9,app_id:123},{id:11,app_id:666}]});
 if(path==='/user/installations/9/repositories')return json({repositories:[choice,{...choice,id:12,private:true}]});
 throw Error('unexpected_mock_url');};return {fetcher:fetcher as typeof fetch,calls};}

test('App is closed until every server credential is configured',()=>{assert.ok(githubSettings(env));assert.equal(githubSettings(()=>undefined),null);assert.equal(githubSettings(k=>k.endsWith('PRIVATE_KEY')?undefined:env(k)),null);});
test('readiness returns only safe configuration field codes, never values or credential hashes',()=>{assert.deepEqual(githubConfiguration(env),{configured:true,issues:[]});const broken=githubConfiguration(k=>k.endsWith('APP_SLUG')?'https://github.com/apps/aprico':k.endsWith('CLIENT_SECRET')?'':env(k));assert.deepEqual(broken,{configured:false,issues:['CLIENT_SECRET','APP_SLUG_FORMAT']});assert.doesNotMatch(JSON.stringify(broken),/fixture|BEGIN|https:|ghu_|ghs_/);});
test('mobile OAuth submits in the same window with Origin preserved and clears the temporary form',()=>{
 let form:any,input:any,submitted:any,removed=false;const previous=(globalThis as any).document;
 (globalThis as any).document={createElement(tag:string){if(tag==='input')return input={};return form={appendChild(){},submit(){submitted={target:this.target,rel:this.rel,body:input.value};},remove(){removed=true;}};},body:{appendChild(){}}};
 try{launchGithub('https://example.test',{action:'github_begin',idToken:'fixture-id-token'});assert.equal(submitted.target,'_self');assert.equal(submitted.rel,'noopener');assert.equal(JSON.parse(submitted.body).idToken,'fixture-id-token');assert.equal(input.value,'');assert.ok(removed);}finally{(globalThis as any).document=previous;}
});
test('return notices distinguish direct callback links, browser loss and actual expiry without trusting arbitrary reason text',()=>{assert.equal(githubNotice(new URLSearchParams('github=start'))?.error,false);assert.match(githubNotice(new URLSearchParams('github=failed&reason=browser_context'))!.text,/同一個瀏覽器/);assert.match(githubNotice(new URLSearchParams('github=failed&reason=expired_or_replayed'))!.text,/過期或已使用/);assert.doesNotMatch(githubNotice(new URLSearchParams('github=failed&reason=untrusted-secret'))!.text,/untrusted-secret/);assert.equal(githubNotice(new URLSearchParams()),null);});
test('OAuth uses fixed callback, random state and S256, with no credentials in URL',async()=>{const s=randomValue(),v=randomValue();assert.equal(s.length,43);assert.notEqual(s,v);const url=new URL(authorizeUrl(settings,s,await digest(v)));assert.equal(url.searchParams.get('redirect_uri'),githubCallback);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('state'),s);assert.ok(!url.href.includes(settings.clientSecret));assert.ok(!url.href.includes(v));});
test('only public, administrable, writable repositories are offered',()=>{assert.equal(repositoryChoice(choice,9)?.repositoryId,8);for(const bad of [{private:true},{archived:true},{permissions:{push:true}},{full_name:'owner/demo?escape'}])assert.equal(repositoryChoice({...choice,...bad},9),null);});
test('OAuth listing uses the intersection of app installation and user rights',async()=>{const m=githubMock();const r=await choicesForUser(settings,'fixture',m.fetcher);assert.equal(r.githubUserId,7);assert.deepEqual(r.choices,[{repositoryId:8,installationId:9,fullName:'owner/demo',url:'https://github.com/owner/demo'}]);assert.ok(!m.calls.some(c=>c.url.includes('/11/')));});
test('non-expiring OAuth tokens are refused rather than stored indefinitely',async()=>{await assert.rejects(exchangeCode(settings,'code','verifier',(async()=>json({access_token:'long-lived'})) as typeof fetch),/github_oauth_failed/);});
test('PKCS1 downloaded GitHub PEM produces a valid short-lived RS256 App JWT',async()=>{const now=Date.now(),jwt=await appJwt(settings,now);const [head,body,sig]=jwt.split('.');assert.ok(verify('RSA-SHA256',Buffer.from(head+'.'+body),pair.publicKey,Buffer.from(sig,'base64url')));const data=JSON.parse(Buffer.from(body,'base64url').toString());assert.equal(data.iss,settings.clientId);assert.equal(data.exp-Math.floor(now/1000),540);assert.ok(!jwt.includes(settings.privateKey));});
test('installation token is narrowed to exactly the stored repository and permissions',async()=>{let call:any;const token=await installationToken(settings,{installation_id:9,repository_id:8,full_name:'owner/demo'},'https://github.com/owner/demo',(async(url:any,init:any)=>{call={url,...init};return json({token:'ghs_new_format_token',expires_at:new Date(Date.now()+3600000).toISOString(),permissions:{contents:'write',pages:'write',administration:'write'}});}) as typeof fetch);assert.equal(token,'ghs_new_format_token');assert.deepEqual(JSON.parse(call.body),{repository_ids:[8],permissions:{contents:'write',pages:'write',administration:'write'}});assert.equal(call.redirect,'error');await assert.rejects(installationToken(settings,{installation_id:9,repository_id:8,full_name:'owner/demo',revoked_at:'now'},'https://github.com/owner/demo'),/binding_mismatch/);await assert.rejects(installationToken(settings,{installation_id:9,repository_id:8,full_name:'owner/demo'},'https://github.com/attacker/demo'),/binding_mismatch/);});
test('callback is bound to initiating browser and one-time state, never returns a token',async()=>{const state=randomValue(),browser=randomValue(),row={id:flowId,status:'pending',state_hash:await digest(state),browser_hash:await digest(browser),verifier:randomValue(),expires_at:new Date(Date.now()+600000).toISOString()};const db=memory({line_oa_kit_github_flows:[row]}),m=githubMock();const url=githubCallback+'?code=fixture&state='+state;
 assert.equal(new URL((await githubCallbackAction(new Request(url),db,env,m.fetcher)).headers.get('location')!).searchParams.get('github'),'failed');assert.equal(db.calls.length,0);
 const request=new Request(url,{headers:{cookie:`aprico_gh_${state.slice(0,16)}=${browser}`}});const result=await githubCallbackAction(request,db,env,m.fetcher);assert.equal(result.status,303);assert.equal(new URL(result.headers.get('location')!).searchParams.get('github'),'complete');assert.equal(row.status,'ready');assert.equal(row.verifier,'');assert.doesNotMatch(JSON.stringify(row),/ghu_fixture|never-persist/);assert.doesNotMatch(await result.text(),/ghu_fixture|never-persist|code=fixture/);
 const before=m.calls.length;assert.equal(new URL((await githubCallbackAction(request,db,env,m.fetcher)).headers.get('location')!).searchParams.get('github'),'failed');assert.equal(m.calls.length,before);
});
test('OAuth launch is a same-browser secure cookie + redirect, not a bearer link',async()=>{const db=memory();const r=await githubAction({action:'github_begin'},db,'subject',{id:project},json,env);assert.equal(r.status,303);assert.match(r.headers.get('set-cookie')!,/HttpOnly; Secure; SameSite=Lax/);assert.match(r.headers.get('location')!,/^https:\/\/github.com\/login\/oauth\/authorize/);assert.equal(db.calls[0].args.p_subject,'subject');assert.doesNotMatch(JSON.stringify(db.calls),/fixture-secret/);});
test('repository choice accepts no installation ID from browser and scopes to LINE owner',async()=>{const db=memory();await githubAction({action:'github_select',flowId,repositoryId:8,installationId:666},db,'verified-subject',{id:project},json,env);assert.deepEqual(db.calls[0].args,{p_project:project,p_subject:'verified-subject',p_flow:flowId,p_repository:8});});
test('status omits state, PKCE verifier, other owners and expired choices',async()=>{const db=memory({line_oa_kit_github_connections:[{project_id:project,line_subject:'other',full_name:'private/repo'}]});const r=await githubAction({action:'github_status'},db,'owner',{id:project},json,env);assert.equal((await r.json()).connection,null);});
test('webhook signature rejects alterations; revocation only invalidates matching installation',async()=>{const payload=JSON.stringify({action:'removed',installation:{id:9}}),raw=new TextEncoder().encode(payload),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(settings.webhookSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig='sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,raw)).toString('hex');assert.equal(await webhookValid(raw,sig,settings.webhookSecret),true);assert.equal(await webhookValid(new Uint8Array([1]),sig,settings.webhookSecret),false);
 const first={installation_id:9,revoked_at:null},other={installation_id:10,revoked_at:null};const f={status:'ready',choices:[{installationId:9}]},f2={status:'ready',choices:[{installationId:10}]};const db=memory({line_oa_kit_github_connections:[first,other],line_oa_kit_github_flows:[f,f2]});const headers={'x-github-event':'installation_repositories','x-hub-signature-256':sig};assert.equal((await githubWebhook(new Request(githubCallback+'/webhook',{method:'POST',body:payload,headers}),db,env)).status,204);assert.ok(first.revoked_at);assert.equal(other.revoked_at,null);assert.equal(f.status,'failed');assert.equal(f2.status,'ready');
});
test('oversized callback API bodies stop reading, and SQL uses service-only owner-scoped single use binding',async()=>{await assert.rejects(boundedBody(new Request('https://example.test',{method:'POST',body:'12345'}),4),/body_limit/);const sql=readFileSync(new URL('../supabase/github-app.sql',import.meta.url),'utf8');assert.match(sql,/security invoker/);assert.match(sql,/status='ready' and expires_at>now\(\) for update/);assert.match(sql,/line_subject=p_subject/);assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/enable row level security/);});
test('Actions authorization distinguishes installation permissions from App authentication and token issuance',async()=>{
 const connection={installation_id:9,repository_id:8,full_name:'owner/demo'};
 const repo='https://github.com/owner/demo';
 const basePermissions={contents:'write',pages:'write',administration:'write'};
 const permissions={...basePermissions,workflows:'write'};
 const calls:any[]=[];
 const mock=(installation:Response,token?:Response)=>(async(url:any,init:any)=>{
  calls.push([String(url),init.method,init.body]);
  if(init.method==='DELETE')return new Response(null,{status:204});
  if(init.method==='GET')return installation;
  return token!;
 }) as typeof fetch;
 await assert.rejects(installationToken(settings,connection,repo,mock(json({id:9,target_type:'User',permissions:basePermissions})),true),{
  message:'github_workflows_permission_required',installationSettingsUrl:'https://github.com/settings/installations/9'
 });
 assert.equal(githubInstallationSettings('https://github.com/organizations/team-demo/settings/installations/9'),'https://github.com/organizations/team-demo/settings/installations/9');
 assert.equal(githubInstallationSettings('https://github.com.evil.test/settings/installations/9'),'https://github.com/settings/installations');
 assert.equal(calls.length,1);
 await assert.rejects(installationToken(settings,connection,repo,mock(json({},401)),true),/github_app_auth_failed/);
 await assert.rejects(installationToken(settings,connection,repo,mock(json({},404)),true),/github_installation_unavailable/);
 await assert.rejects(installationToken(settings,connection,repo,mock(json({id:9,permissions}),json({},422)),true),/github_installation_unavailable/);
 const grant={token:'fixture-token',expires_at:new Date(Date.now()+3600000).toISOString()};
 await assert.rejects(installationToken(settings,connection,repo,mock(json({id:9,permissions}),json({...grant,permissions:basePermissions})),true),/github_installation_unavailable/);
 assert.deepEqual(calls.at(-1)?.slice(0,2),['https://api.github.com/installation/token','DELETE']);
 assert.equal(await installationToken(settings,connection,repo,mock(json({id:9,permissions}),json({...grant,permissions})),true),'fixture-token');
 assert.deepEqual(JSON.parse(calls.at(-1)?.[2]),{repository_ids:[8],permissions});
});
