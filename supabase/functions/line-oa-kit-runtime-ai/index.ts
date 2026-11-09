import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {runtimeAI} from '../_shared/runtime-ai.ts';

Deno.serve(req=>{
 const key=Deno.env.get('LINE_OA_KIT_POINTS_OFFER_ENABLED')==='true'?Deno.env.get('LINE_OA_KIT_BUILD_OPENAI_API_KEY')||'':'';
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 return runtimeAI(req,db,key);
});
