import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {processIntroJob,checkIntro} from '../_shared/intro-delivery.ts';
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('not found',{status:404});
 const key=req.headers.get('x-intro-tick')||'';
 if(!/^[0-9a-f]{64}$/.test(key))return new Response('forbidden',{status:403});
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from('line_oa_kit_intro_ticks').update({claimed_at:new Date().toISOString()}).eq('token_hash',hash).is('claimed_at',null).gt('expires_at',new Date().toISOString()).select('id,mode').maybeSingle();
 if(error||!data)return new Response('forbidden',{status:403});
 const token=Deno.env.get('LINE_OA_KIT_MESSAGING_ACCESS_TOKEN')||'';
 let result:any;
 try{
  result=data.mode==='check'?await checkIntro(db,token):await processIntroJob(db,token);
 }catch{result={ok:false,error:'intro_worker_failed'};}
 if(data.mode==='check')await db.from('line_oa_kit_intro_control').update({last_check:result,last_check_at:new Date().toISOString()}).eq('id',true);
 const audit=await db.from('line_oa_kit_intro_ticks').update({result}).eq('id',data.id);
 return Response.json(audit.error?{ok:false,error:'tick_audit_failed'}:result,{status:audit.error?500:200});
});
