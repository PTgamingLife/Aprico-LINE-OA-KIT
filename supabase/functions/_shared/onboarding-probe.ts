// Fixed read-only preflight. Never return LINE tokens or follower IDs.
export async function onboardingProbe(token:string,fetcher:typeof fetch=fetch){
 const get=async(path:string)=>fetcher('https://api.line.me/v2/bot'+path,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!token)return {ok:false,reason:'line_not_configured'};
 const info=await get('/info');
 if(!info.ok)return {ok:false,reason:'line_info_failed',status:info.status};
 const bot=await info.json();
 if(bot.basicId!=='@228srwlt')return {ok:false,reason:'wrong_oa'};
 const list=await get('/followers/ids?limit=1');
 // Do not consume or expose the IDs. Eligibility alone determines scheduling strategy.
 await list.body?.cancel();
 return {ok:true,basicId:bot.basicId,followersListAvailable:list.ok,followersListStatus:list.status};
}
