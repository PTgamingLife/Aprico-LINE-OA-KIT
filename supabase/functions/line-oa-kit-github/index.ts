import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {githubAction,githubCallbackAction,githubWebhook,boundedBody} from '../_shared/github-handler.ts';
import {githubConfiguration,githubReturn} from '../_shared/github-app.ts';
const origins=new Set(['https://ptgaminglife.github.io','https://facialmonitor-line-kit.ptchen321.chatgpt.site']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin'),env=(k:string)=>Deno.env.get(k);
 const headers={'Access-Control-Allow-Origin':origin&&origins.has(origin)?origin:'https://ptgaminglife.github.io','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
 const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 const db=()=>createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const path=new URL(req.url).pathname;
  if(path.endsWith('/health')&&req.method==='GET')return response(githubConfiguration(env));
  if(req.method==='GET'&&path.endsWith('/line-oa-kit-github')){
   if(!new URL(req.url).search)return new Response(null,{status:303,headers:{Location:githubReturn+'?github=start','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
   return await githubCallbackAction(req,db(),env);
  }
  if(req.method==='GET')return response({error:'Not found'},404);
  if(new URL(req.url).pathname.endsWith('/webhook')&&req.method==='POST')return await githubWebhook(req,db(),env);
  if(origin&&!origins.has(origin))return response({error:'來源不允許'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return response({error:'Method not allowed'},405);
  let b;try{const raw=new TextDecoder().decode(await boundedBody(req,20000));b=JSON.parse(req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')?new URLSearchParams(raw).get('payload')||'':raw);}catch{return response({error:'內容格式錯誤或過大'},400);}
  if(b.action==='github_begin'&&(!origin||!origins.has(origin)))return response({error:'請從 Aprico 建置中心開始連線'},403);
  if(!['github_status','github_begin','github_select','github_disconnect'].includes(b.action))return response({error:'不支援的操作'},400);
  if(typeof b.idToken!=='string'||!b.idToken||b.idToken.length>10000)return response({error:'請先使用 LINE 登入'},401);
  const r=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:b.idToken,client_id:'2012197506'}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)return response({error:'登入已失效'},401);const identity=await r.json();
  if(identity.aud!=='2012197506'||identity.iss!=='https://access.line.me'||!/^U[a-f0-9]{32}$/.test(identity.sub)||!Number.isFinite(identity.exp)||identity.exp*1000<=Date.now())return response({error:'登入憑證不符'},401);
  if(typeof b.projectId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.projectId))return response({error:'請先選擇專案'},400);
  const client=db();
  const p=await client.from('line_oa_kit_designs').select('id').eq('id',b.projectId).eq('line_subject',identity.sub).maybeSingle();
  if(p.error)return response({error:'讀取專案失敗'},503);if(!p.data)return response({error:'專案不存在或無權限'},404);
  const access=await client.from('line_oa_kit_build_access').select('project_id').eq('project_id',b.projectId).eq('line_subject',identity.sub).maybeSingle();
  if(access.error)return response({error:'讀取開通狀態失敗'},503);if(!access.data)return response({error:'請先開通此專案'},403);
  return await githubAction(b,client,identity.sub,p.data,response,env);
 }catch{return response({error:'GitHub 連線暫時無法完成，請稍後重試'},503);}
});
