// Fixed GitHub endpoints only. No tokens or private keys are returned to clients.
export const githubCallback='https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-github';
export const githubReturn='https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/build.html';
export const appPermissions={contents:'write',pages:'write',administration:'write'};
export type GithubSettings={id:string;clientId:string;clientSecret:string;privateKey:string;slug:string;webhookSecret:string};
// Only field names/status are public; never return their contents or digests.
export function githubConfiguration(env:(key:string)=>string|undefined){
 const issues:string[]=[];
 if(env('LINE_OA_KIT_GITHUB_ENABLED')!=='true')issues.push('ENABLED');
 for(const suffix of ['APP_ID','CLIENT_ID','CLIENT_SECRET','PRIVATE_KEY','APP_SLUG','WEBHOOK_SECRET'])if(!env('LINE_OA_KIT_GITHUB_'+suffix)?.trim())issues.push(suffix);
 const id=env('LINE_OA_KIT_GITHUB_APP_ID'),slug=env('LINE_OA_KIT_GITHUB_APP_SLUG');
 if(id&&!/^\d+$/.test(id))issues.push('APP_ID_FORMAT');
 if(slug&&!/^[\w.-]+$/.test(slug))issues.push('APP_SLUG_FORMAT');
 return {configured:issues.length===0,issues};
}
export function githubSettings(env:(key:string)=>string|undefined):GithubSettings|null{
 if(env('LINE_OA_KIT_GITHUB_ENABLED')!=='true')return null;
 const get=(suffix:string)=>env('LINE_OA_KIT_GITHUB_'+suffix)||'';
 const c={id:get('APP_ID'),clientId:get('CLIENT_ID'),clientSecret:get('CLIENT_SECRET'),privateKey:get('PRIVATE_KEY'),slug:get('APP_SLUG'),webhookSecret:get('WEBHOOK_SECRET')};
 return /^\d+$/.test(c.id)&&/^[\w.-]+$/.test(c.slug)&&Object.values(c).every(Boolean)?c:null;
}
const bytes=(s:string)=>new TextEncoder().encode(s);
export function base64url(value:Uint8Array){return btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export const randomValue=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value))));}
export function authorizeUrl(settings:GithubSettings,state:string,challenge:string){
 const u=new URL('https://github.com/login/oauth/authorize');u.search=new URLSearchParams({client_id:settings.clientId,redirect_uri:githubCallback,state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();return u.href;
}
export async function ghRequest(path:string,token:string,method='GET',body?:unknown,fetcher:typeof fetch=fetch){
 if(!/^\/[a-zA-Z0-9_/?=&.%+-]+$/.test(path))throw Error('github_path_invalid');
 const r=await fetcher('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'Aprico-LINE-OA-KIT',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('github_access_unavailable');return r.status===204?{}:await r.json();
}
export function repositoryChoice(repo:any,installationId:number){
 if(!Number.isSafeInteger(repo?.id)||!Number.isSafeInteger(installationId)||repo.private!==false||repo.archived||repo.disabled||!repo.permissions?.push||!repo.permissions?.admin||typeof repo.full_name!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(repo.full_name))return null;
 return {repositoryId:repo.id,installationId,fullName:repo.full_name,url:'https://github.com/'+repo.full_name};
}
export async function exchangeCode(settings:GithubSettings,code:string,verifier:string,fetcher:typeof fetch=fetch){
 const r=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:settings.clientId,client_secret:settings.clientSecret,code,redirect_uri:githubCallback,code_verifier:verifier}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const v=await r.json();if(!r.ok||typeof v.access_token!=='string'||!v.access_token||!Number.isFinite(v.expires_in)||v.expires_in<=0)throw Error('github_oauth_failed');
 return v.access_token as string; // Refresh tokens, if supplied, are deliberately not persisted.
}
export async function choicesForUser(settings:GithubSettings,token:string,fetcher:typeof fetch=fetch){
 const user=await ghRequest('/user',token,'GET',undefined,fetcher);if(!Number.isSafeInteger(user.id)||typeof user.login!=='string')throw Error('github_identity_invalid');
 const choices:any[]=[];let installations=0,truncated=false;
 // Bound work; large accounts can narrow installed repositories and reconnect.
 for(let page=1;page<=3;page++){
  const list=await ghRequest('/user/installations?per_page=100&page='+page,token,'GET',undefined,fetcher);
  for(const ins of list.installations||[]){
   if(String(ins.app_id)!==settings.id||ins.suspended_at||!Number.isSafeInteger(ins.id))continue;
   installations++;
   for(let rp=1;rp<=3;rp++){
    const repos=await ghRequest(`/user/installations/${ins.id}/repositories?per_page=100&page=${rp}`,token,'GET',undefined,fetcher);
    for(const repo of repos.repositories||[]){const c=repositoryChoice(repo,ins.id);if(c)choices.push(c);}
    if((repos.repositories||[]).length<100)break;if(rp===3)truncated=true;
   }
  }
  if((list.installations||[]).length<100)break;if(page===3)truncated=true;
 }
 return {githubUserId:user.id,login:user.login.slice(0,100),choices:choices.slice(0,300),truncated:truncated||choices.length>300,installations};
}
function der(tag:number,content:Uint8Array){const n=content.length;const len=n<128?[n]:n<256?[129,n]:[130,n>>8,n&255];return new Uint8Array([tag,...len,...content]);}
export function privateKeyBytes(pem:string){
 const normalized=pem.replaceAll('\\n','\n');const pkcs1=normalized.includes('BEGIN RSA PRIVATE KEY');
 const raw=Uint8Array.from(atob(normalized.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0));
 if(!pkcs1)return raw;
 // GitHub's downloaded RSA PEM uses PKCS#1; WebCrypto imports PKCS#8.
 return der(0x30,new Uint8Array([2,1,0,48,13,6,9,42,134,72,134,247,13,1,1,1,5,0,...der(4,raw)]));
}
export async function appJwt(settings:GithubSettings,now=Date.now()){
 const time=Math.floor(now/1000),head=base64url(bytes(JSON.stringify({alg:'RS256',typ:'JWT'}))),body=base64url(bytes(JSON.stringify({iat:time-60,exp:time+540,iss:settings.clientId})));
 const key=await crypto.subtle.importKey('pkcs8',privateKeyBytes(settings.privateKey),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 return head+'.'+body+'.'+base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,bytes(head+'.'+body))));
}
export async function installationToken(settings:GithubSettings,connection:any,repoUrl:string,fetcher:typeof fetch=fetch,actionsPages=false){
 if(connection?.revoked_at||!Number.isSafeInteger(connection?.installation_id)||!Number.isSafeInteger(connection?.repository_id)||repoUrl.replace(/\/$/,'').toLowerCase()!==('https://github.com/'+connection.full_name).toLowerCase())throw Error('github_binding_mismatch');
 const jwt=await appJwt(settings);
 const permissions=actionsPages?{...appPermissions,workflows:'write'}:appPermissions;
 const issued=await ghRequest(`/app/installations/${connection.installation_id}/access_tokens`,jwt,'POST',{repository_ids:[connection.repository_id],permissions},fetcher);
 if(typeof issued.token!=='string'||!issued.token||!Number.isFinite(Date.parse(issued.expires_at))||Date.parse(issued.expires_at)<=Date.now()||Object.keys(permissions).some(key=>issued.permissions?.[key]!=='write'))throw Error('github_installation_unavailable');
 return issued.token as string;
}
export async function webhookValid(raw:Uint8Array,signature:string,secret:string){
 if(!/^sha256=[a-f0-9]{64}$/.test(signature)||!secret)return false;
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.slice(7).match(/../g)!,s=>parseInt(s,16)),raw);
}
