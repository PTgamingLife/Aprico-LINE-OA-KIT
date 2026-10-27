import {validateArtifact} from './source-builder.ts';
export type DeployCredentials={githubToken:string;supabaseToken:string;lineToken:string;lineSecret:string};
export function credentials(value:any):DeployCredentials{
 const out:any={};for(const key of ['githubToken','supabaseToken','lineToken','lineSecret']){if(typeof value?.[key]!=='string'||!value[key].trim()||value[key].length>6000||/[\r\n]/.test(value[key]))throw Error('credentials_required');out[key]=value[key].trim();}if(!/^[a-f0-9]{32}$/i.test(out.lineSecret))throw Error('line_secret_format');return out;
}
export function deploymentTarget(projectId:string,setup:any,projectName=''){
 if(!/^[a-f0-9-]{36}$/i.test(projectId))throw Error('invalid_target');
 const repo=new URL(setup.githubRepo),supa=new URL(setup.supabaseUrl);
 if(repo.origin!=='https://github.com'||repo.username||repo.password||repo.search||repo.hash||!/^\/[\w.-]+\/[\w.-]+\/?$/.test(repo.pathname)||!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(supa.href))throw Error('invalid_target');
 const [owner,name]=repo.pathname.split('/').filter(Boolean);if(name.toLowerCase().endsWith('.git'))throw Error('invalid_target');
 const suffix=projectId.replaceAll('-','').toLowerCase();
 const projectPrefix=projectName.replace(/[^a-z0-9]/gi,'_').replace(/^_+|_+$/g,'').slice(0,16).toUpperCase()||'APRICO';
 return{owner,repo:name,ref:supa.hostname.split('.')[0],branch:`aprico-${suffix}`,slug:`aprico-${suffix}`,prefix:`${projectPrefix}_${suffix.toUpperCase()}`,repoPath:`/repos/${owner}/${name}`};
}
export function apiClient(c:DeployCredentials,fetcher:typeof fetch=fetch){
 async function request(service:'github'|'supabase'|'line',path:string,method='GET',body?:any,allow404=false){
  const base={github:'https://api.github.com',supabase:'https://api.supabase.com',line:'https://api.line.me'}[service];
  if(!path.startsWith('/')||path.includes('://'))throw Error('invalid_api_path');
  const headers:any={Authorization:`Bearer ${c[service==='github'?'githubToken':service==='supabase'?'supabaseToken':'lineToken']}`};
  if(service==='github'){headers.Accept='application/vnd.github+json';headers['X-GitHub-Api-Version']='2026-03-10';headers['User-Agent']='Aprico-LINE-OA-KIT';}
  if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetcher(base+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(allow404&&r.status===404)return null;if(!r.ok)throw Error(`${service}_${r.status}`);return r.status===204?{}:await r.json();
 }
 return request;
}
export async function preflight(projectId:string,snapshot:any,c:DeployCredentials,fetcher:typeof fetch=fetch){
 const t=deploymentTarget(projectId,snapshot.setup,snapshot.design.name),call=apiClient(c,fetcher);
 const repo=await call('github',t.repoPath);
 if(repo.full_name?.toLowerCase()!==`${t.owner}/${t.repo}`.toLowerCase()||!repo.permissions?.push||repo.private||repo.archived)throw Error('repository_not_public_writable');
 // Refuse empty repos: never initialize or rewrite the user's default branch implicitly.
 const head=await call('github',`${t.repoPath}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
 if(!head.object?.sha)throw Error('repository_initialize_readme');
 if(await call('github',`${t.repoPath}/pages`,'GET',undefined,true))throw Error('existing_pages_requires_review');
 if(await call('github',`${t.repoPath}/git/ref/heads/${t.branch}`,'GET',undefined,true))throw Error('existing_branch_requires_review');
 const supa=await call('supabase',`/v1/projects/${t.ref}`);
 if(supa.id!==t.ref&&supa.ref!==t.ref)throw Error('supabase_project_mismatch');
 if(await call('supabase',`/v1/projects/${t.ref}/functions/${t.slug}`,'GET',undefined,true))throw Error('existing_function_requires_review');
 const bot=await call('line','/v2/bot/info');
 // Long-lived Messaging API token verification returns its issuing channel ID.
 const verified=await fetcher('https://api.line.me/v2/oauth/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({access_token:c.lineToken}),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!verified.ok)throw Error('line_token_verify_failed');const tokenInfo=await verified.json();
 if(String(tokenInfo.client_id)!==snapshot.setup.messagingChannelId)throw Error('line_channel_mismatch');
 const webhook=await call('line','/v2/bot/channel/webhook/endpoint');
 if(webhook.endpoint)throw Error('existing_webhook_requires_review');
 return{...t,headSha:head.object.sha,botId:bot.userId,botName:bot.displayName,botBasicId:bot.basicId,supabaseName:supa.name,githubRepo:repo.full_name,appUrl:`https://${t.owner.toLowerCase()}.github.io/${t.repo}/`,webhookUrl:`https://${t.ref}.supabase.co/functions/v1/${t.slug}`};
}
// Trusted, deterministic backend. AI-generated files never run on the server.
export function webhookSource(prefix:string,replies:Record<string,string>,fallback:string){
 return `const replies=${JSON.stringify(replies)};const fallback=${JSON.stringify(fallback)};
Deno.serve(async req=>{if(req.method!=='POST')return new Response('Method not allowed',{status:405});
if(Number(req.headers.get('content-length')||0)>100000)return new Response('',{status:413});
const reader=req.body?.getReader();if(!reader)return new Response('',{status:400});let size=0;const parts=[];while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>100000){await reader.cancel();return new Response('',{status:413});}parts.push(p.value);}const raw=new Uint8Array(size);let offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length;}
const secret=Deno.env.get('${prefix}_LINE_SECRET')||'',token=Deno.env.get('${prefix}_LINE_TOKEN')||'';if(!secret||!token)return new Response('',{status:503});
let valid=false;try{const signature=Uint8Array.from(atob(req.headers.get('x-line-signature')||''),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('HMAC',key,signature,raw);}catch{}if(!valid)return new Response('',{status:401});
let data;try{data=JSON.parse(new TextDecoder().decode(raw));}catch{return new Response('',{status:400});}if(!Array.isArray(data.events)||data.events.length>20)return new Response('',{status:400});
for(const event of data.events){if(event.deliveryContext?.isRedelivery||event.type!=='message'||event.message?.type!=='text'||!event.replyToken)continue;const text=Object.hasOwn(replies,event.message.text)?replies[event.message.text]:fallback;try{const r=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({replyToken:event.replyToken,messages:[{type:'text',text:text.slice(0,4900)}]}),signal:AbortSignal.timeout(8000)});if(!r.ok)return new Response('',{status:502});}catch{return new Response('',{status:502});}}
return new Response('OK');});`;
}
export async function executeDeployment(plan:any,snapshot:any,artifact:unknown,c:DeployCredentials,report:(stage:string,extra?:any)=>Promise<void>,fetcher:typeof fetch=fetch){
 const a=validateArtifact(artifact),call=apiClient(c,fetcher),t=plan;
 await report('github_files');
 const files=a.files.filter(f=>f.path!=='.nojekyll');files.push({path:'.nojekyll',content:''});
 const tree=await call('github',`${t.repoPath}/git/trees`,'POST',{tree:files.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))});
 const commit=await call('github',`${t.repoPath}/git/commits`,'POST',{message:'Aprico: publish reviewed website draft',tree:tree.sha,parents:[t.headSha]});
 await call('github',`${t.repoPath}/git/refs`,'POST',{ref:`refs/heads/${t.branch}`,sha:commit.sha});
 await report('github_pages',{commit_sha:commit.sha});
 await call('github',`${t.repoPath}/pages`,'POST',{build_type:'legacy',source:{branch:t.branch,path:'/'}});
 await report('supabase_secrets');
 await call('supabase',`/v1/projects/${t.ref}/secrets`,'POST',[{name:`${t.prefix}_LINE_SECRET`,value:c.lineSecret},{name:`${t.prefix}_LINE_TOKEN`,value:c.lineToken}]);
 await report('supabase_function');
 const replies=Object.fromEntries(snapshot.design.cells.slice(0,snapshot.design.grid).filter((cell:any)=>cell.action==='message').map((cell:any)=>[cell.label,cell.content]));
 const form=new FormData();form.append('metadata',JSON.stringify({name:t.slug,entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([webhookSource(t.prefix,replies,snapshot.setup.failure||'請聯絡服務人員。')],{type:'application/typescript'}),'index.ts');
 await call('supabase',`/v1/projects/${t.ref}/functions/deploy?slug=${t.slug}`,'POST',form);
 await report('webhook_test');
 // LINE test sends an authentic signature, detecting a Channel Secret from the wrong OA.
 const tested=await call('line','/v2/bot/channel/webhook/test','POST',{endpoint:t.webhookUrl});
 if(tested.success!==true)throw Error('webhook_signature_or_readiness_failed');
 await report('webhook_connect');
 // Recheck before replacing an endpoint; never overwrite a service that appeared meanwhile.
 const current=await call('line','/v2/bot/channel/webhook/endpoint');if(current.endpoint)throw Error('existing_webhook_requires_review');
 await call('line','/v2/bot/channel/webhook/endpoint','PUT',{endpoint:t.webhookUrl});
 await report('awaiting_acceptance',{app_url:t.appUrl,webhook_url:t.webhookUrl,commit_sha:commit.sha,system_checks:{webhookSignature:true,sourceCommitted:true,pagesRequested:true}});
}
