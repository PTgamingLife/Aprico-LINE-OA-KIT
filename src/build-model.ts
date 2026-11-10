export type BuildSetup={audience:string;purpose:string;scenario:string;success:string;failure:string;human:string;githubRepo:string;supabaseUrl:string;messagingChannelId:string;contactUrl:string;runtimeOwnerId?:string;loginChannelId?:string;runtimeAiProvider:'none'|'openai'|'anthropic'|'platform'};
export function emptySetup():BuildSetup{return {audience:'',purpose:'',scenario:'',success:'',failure:'',human:'',githubRepo:'',supabaseUrl:'',messagingChannelId:'',contactUrl:'',runtimeAiProvider:'none'};}
export function validateSetup(value:unknown):BuildSetup{
 if(!value||typeof value!=='object')throw Error('設定格式不正確');const v=value as BuildSetup;const result=emptySetup();
 for(const key of Object.keys(result) as (keyof BuildSetup)[]){if(key==='runtimeAiProvider')continue;const s=v[key];if(typeof s!=='string'||s.length>2000)throw Error('欄位過長或格式錯誤');result[key]=s.trim();}
 if(!['none','openai','anthropic','platform'].includes(v.runtimeAiProvider))throw Error('AI 供應商不正確');
 if(v.runtimeOwnerId!==undefined&&(typeof v.runtimeOwnerId!=='string'||v.runtimeOwnerId.length>33))throw Error('LINE 使用者 ID 格式錯誤');
 if(v.loginChannelId!==undefined){
  if(typeof v.loginChannelId!=='string'||!/^\d{0,20}$/.test(v.loginChannelId.trim()))throw Error('LINE Login Channel ID 格式錯誤');
  if(v.loginChannelId.trim())result.loginChannelId=v.loginChannelId.trim();
 }
 result.runtimeAiProvider=v.runtimeAiProvider;
 if(v.runtimeAiProvider==='platform'&&v.runtimeOwnerId)result.runtimeOwnerId=v.runtimeOwnerId.trim();
 return result;
}
export function requirementIssues(draft:{name:string;oaName:string;grid:number;cells:{label:string;content:string;action:string;template:string}[];secretary?:{direction:string}},setup:BuildSetup):string[]{
 const issues:string[]=[];
 for(const [value,label] of [[draft.name,'專案名稱'],[draft.oaName,'LINE OA 名稱'],[setup.audience,'服務對象'],[setup.purpose,'主要目的'],[setup.scenario,'使用情境'],[setup.success,'成功條件'],[setup.failure,'「服務遇到問題該如何處理？」'],[setup.human,'轉人工方式']])if(!value.trim())issues.push(`請填寫${label}`);
 if(draft.secretary?.direction!=='records')draft.cells.slice(0,draft.grid).forEach((c,i)=>{if(!c.label.trim()||!c.content.trim())issues.push(`第 ${i+1} 格尚未填完整`);});
 try{const u=new URL(setup.githubRepo);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.search||u.hash||!/^\/[\w.-]+\/[\w.-]+\/?$/.test(u.pathname))throw Error();}catch{issues.push('請填寫正確的 GitHub repository 網址');}
 try{const u=new URL(setup.supabaseUrl);if(u.protocol!=='https:'||!/^\w{20}\.supabase\.co$/.test(u.hostname)||u.username||u.password||!['','/'].includes(u.pathname)||u.search||u.hash)throw Error();}catch{issues.push('請填寫 Supabase Project URL，例如 https://專案代碼.supabase.co');}
 if(!/^\d{6,20}$/.test(setup.messagingChannelId))issues.push('請填寫 Messaging API Channel ID');
 if(setup.runtimeAiProvider==='platform'&&!/^U[0-9a-f]{32}$/.test(setup.runtimeOwnerId||''))issues.push('請填寫同一個 Messaging API Channel 下的 Your user ID，限定誰可以使用營運點數');
 if(draft.cells.slice(0,draft.grid).some(c=>c.template==='health')&&setup.runtimeAiProvider==='none')issues.push('健康檢測需要選擇營運 AI 供應商');
 return issues;
}
export function safeContactUrl(value:unknown):string{
 if(typeof value!=='string')return '';try{const u=new URL(value);return u.protocol==='https:'&&['line.me','www.line.me','lin.ee'].includes(u.hostname)&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export async function passwordsMatch(input:string,expected:string):Promise<boolean>{
 if(!expected||input.length>256)return false;const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(input),digest(expected)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
