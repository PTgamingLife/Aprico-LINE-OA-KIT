export function tutorialScene(unit:{key?:string;title:string;text:string;rows?:string[]}){
 const [page='',part='']=String(unit.key||'').split('.');
 let platform='Aprico',address='Aprico · 你的專案',heading='建置中心',rows=unit.rows||['開啟對應裝備任務',unit.title,'保存或完成驗證'],focus=1,source='';
 if(page==='automatic'){
  platform='Supabase';address='supabase.com/dashboard';heading='系統部署的位置';rows=['自己的專案 → Edge Functions','Functions：本次後端','Secrets：系統配置的 LINE 金鑰','等待任務結果，再開始實測'];focus=1;source='https://supabase.com/docs/guides/functions/secrets';
 }else if(page.startsWith('github')){
  platform='GitHub';source='https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository';address='github.com';
  if(page==='github-create'){heading='Create a new repository';rows=['Owner：你的帳號','Repository name：你的專案','Visibility：Public','Add README：選填','Create repository'];focus=({owner:0,name:1,public:2,readme:3,created:4} as Record<string,number>)[part]??0;address='github.com/new';}
  else if(page==='github-signup'){heading='Sign up / Sign in';rows=['建立帳號，或 Sign in','Email／帳號與密碼（自己填）','依要求完成驗證','你的帳號 · Repositories'];focus=part==='verified'?2:part==='owner'?3:0;}
  else if(page==='githubToken'){heading='Aprico GitHub App';rows=['Install Aprico GitHub App','Only select repositories','選擇本次專用 repo','Authorize / Install','回 Aprico 核對與綁定'];focus=part==='limited'?1:part==='account'?3:part==='repository'?4:0;source='https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party';}
  else{heading='你的帳號 / 你的專案';rows=['網址列：github.com/帳號/專案','Code · Issues · Settings','README.md','回 Aprico 貼上 repository 網址'];focus=part==='input'||part==='save'?3:0;}
 }else if(page.startsWith('supabase')){
  platform='Supabase';address='supabase.com/dashboard';source='https://supabase.com/docs/guides/getting-started/api-keys';
  if(page==='supabase-signup'){heading='Get started';rows=['Continue with GitHub','或 Email / Password','完成信箱或帳號驗證','自己的 Dashboard'];focus=part==='verified'?2:part==='owner'?3:0;}
  else if(page==='supabase-create'){heading='Create a new project';rows=['Organization：自己的組織','Project name：你的專案','Database password：自行保管','Region：選服務區域','核對 Plan → Create new project'];focus=({organization:0,name:1,password:2,region:3,plan:4,created:4} as Record<string,number>)[part]??0;}
  else if(page==='supabaseToken'){heading='Account · Access Tokens';rows=['Generate new token','Project：選組織與本次專案','Project Settings：Read','Edge Functions / Secrets：Read-write','Review access → 確認後產生'];focus=part==='input'?4:part==='scope'?1:0;source='https://supabase.com/docs/guides/platform/personal-access-tokens';}
  else{heading='你的專案 · Project Settings';rows=['Project Settings → General','Project ID → Copy','https:// 加上代碼，再加 .supabase.co','或使用 Connect 核對 Project URL','回 Aprico 貼上完整網址並保存'];focus=part==='connect'?1:part==='input'||part==='save'?4:0;}
 }else if(['messagingChannelId','lineSecret','lineToken','webhook','liff','loginChannelId','loginSecret','loginPublish'].includes(page)){
  platform='LINE Developers';address='developers.line.biz/console';source='https://developers.line.biz/en/docs/messaging-api/building-bot/';
  heading='你的 Channel';
  if(page==='lineSecret'||page==='messagingChannelId'){rows=['Messaging API Channel','Basic settings','Channel ID：你的編號','Channel secret：••••••••','回 Aprico 的對應安全欄位'];focus=page==='lineSecret'?part==='input'?4:3:2;}
  else if(page==='lineToken'){heading='Messaging API';rows=['Messaging API 分頁','Channel access token（long-lived）','已有 Token：沿用現有值','沒有 Token：Issue','回 Aprico 安全貼上'];focus=part==='input'?4:1;}
  else if(page==='webhook'){heading='Messaging API · Webhook settings';rows=['開啟同一個 Messaging API Channel','Use webhook：有開關就開啟','網址由 Aprico 部署後設定','手機傳訊息測試'];focus=1;}
  else if(page.startsWith('login')){heading='LINE Login Channel';rows=['進入自己的 Provider → LINE Login Channel','Basic settings：複製 Channel ID','Basic settings：複製 Channel Secret','一般好友要使用時，發布 Channel'];focus=page==='loginPublish'?3:page==='loginSecret'?2:1;source='https://developers.line.biz/en/docs/line-login/developing-a-line-login-channel/';}
  else{heading='LINE · App 入口驗收';rows=['回到自己的官方帳號','點開半頁／全頁 App','操作並確認顯示的內容','回 Aprico 保存結果'];focus=1;source='https://developers.line.biz/en/docs/liff/opening-liff-app/';}
 }else if(page==='menu'){platform='LINE OA Manager';address='manager.line.biz';heading='圖文選單';rows=['開啟本次官方帳號','開啟由系統建立的圖文選單','核對每格名稱','在手機逐格點選測試','回 Aprico 保存實測回報'];focus=part==='open'?0:part==='report'?4:3;source='https://developers.line.biz/en/docs/messaging-api/using-rich-menus/';}
 return {platform,address,heading,rows,focus,source};
}
