import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { validateDraft } from '../../../src/model.ts';

const allowedOrigins = new Set(['https://facialmonitor-line-kit.ptchen321.chatgpt.site','https://ptgaminglife.github.io']);
const channelId = '2012197506';
Deno.serve(async(req:Request)=>{
  const requestOrigin=req.headers.get('origin');
  const origin=requestOrigin&&allowedOrigins.has(requestOrigin)?requestOrigin:'https://facialmonitor-line-kit.ptchen321.chatgpt.site';
  const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
  const response = (value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(requestOrigin&&!allowedOrigins.has(requestOrigin))return response({error:'來源不允許'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='POST') return response({error:'Method not allowed'},405);
  try {
    // Bound the stream before parsing; never log bodies or LINE credentials.
    const reader=req.body?.getReader();if(!reader)return response({error:'缺少內容'},400);
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>100000){await reader.cancel();return response({error:'內容過大'},413);}chunks.push(part.value);}
    const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
    let b;try{b=JSON.parse(new TextDecoder().decode(raw));}catch{return response({error:'格式錯誤'},400);}
    if(b.action==='config')return response({liffId:Deno.env.get('LINE_OA_KIT_LIFF_ID')||'',loginChannelId:channelId});
    if(!['list','save'].includes(b.action))return response({error:'不支援的操作'},400);
    if(typeof b.idToken!=='string'||b.idToken.length>10000||!b.idToken)return response({error:'請先使用 LINE 登入'},401);
    const verified=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:b.idToken,client_id:channelId}),signal:AbortSignal.timeout(10000)});
    if(!verified.ok)return response({error:'登入已失效，請重新登入'},401);
    const identity=await verified.json();
    if(identity.aud!==channelId||identity.iss!=='https://access.line.me'||typeof identity.sub!=='string'||!/^U[0-9a-f]{32}$/.test(identity.sub)||!Number.isFinite(identity.exp)||identity.exp*1000<=Date.now())return response({error:'登入憑證不符'},401);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    // Every query is scoped to the server-verified LINE subject, never a client owner ID.
    if(b.action==='list'){
      const {data,error}=await db.from('line_oa_kit_designs').select('id,config,revision,updated_at').eq('line_subject',identity.sub).order('updated_at',{ascending:false}).limit(50);
      if(error)return response({error:'讀取失敗，請稍後重試'},503);
      return response({projects:data,displayName:typeof identity.name==='string'?identity.name:'LINE 會員'});
    }
    let config;try{config=validateDraft(b.config);}catch{return response({error:'請檢查欄位內容與長度'},400);}
    if(typeof b.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id)||!Number.isSafeInteger(b.revision)||b.revision<0)return response({error:'專案版本不正確'},400);
    if(b.revision===0){
      const {data,error}=await db.from('line_oa_kit_designs').insert({id:b.id,line_subject:identity.sub,config,revision:1}).select('id,revision,updated_at').single();
      if(error)return response({error:error.code==='23505'?'此專案已保存，請重新載入確認版本':'保存失敗，請稍後重試'},error.code==='23505'?409:503);
      return response({project:data});
    }
    const {data,error}=await db.from('line_oa_kit_designs').update({config,revision:b.revision+1,updated_at:new Date().toISOString()}).eq('id',b.id).eq('line_subject',identity.sub).eq('revision',b.revision).select('id,revision,updated_at').maybeSingle();
    if(error)return response({error:'保存失敗，請稍後重試'},503);
    if(!data)return response({error:'版本已變更或專案不存在，請先重新載入'},409);
    return response({project:data});
  }catch{return response({error:'暫時無法連線，請保留內容後重試'},503);}
});


