// Coordinates are percentages of the original screenshot, never of a recreated UI.
export type TutorialFrame={file:string;box:[number,number,number,number];caption?:string;instruction?:string};
export type TutorialShot=TutorialFrame&{label:string;source:string;credit:string;note?:string;frames?:TutorialFrame[]};
const githubDocs='https://docs.github.com/en/repositories/creating-and-managing-repositories/quickstart-for-repositories';
const appDocs='https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party';
function suppliedProjectTutorial(page:string,part:string):TutorialShot|null{
 if(!['supabaseUrl','automatic'].includes(page)&&!(page==='supabase-create'&&['open','created'].includes(part))&&!(page==='supabase-signup'&&part==='owner'))return null;
 const toolbar:TutorialFrame={file:'supabase-projects-toolbar.png',box:[85,70,14,27],caption:'Projects：建立或選擇自己的專案',instruction:'登入後進入自己的 Projects。沒有本次專用專案才按 New project；已有專案則直接開啟。此圖不含帳號身分資訊，請在自己的後台另外核對登入帳號與組織。'};
 const card:TutorialFrame={file:'supabase-project-example-card.png',box:[2,5,96,40],caption:'選擇本次專用專案',instruction:'專案啟動後，點選你自己的專用專案卡片。圖中的 heart-cards 只是拍攝範例，不是要求你選的平台專案，也不會自動填入你的設定。'};
 const settings:TutorialFrame={file:'supabase-project-settings-nav.png',box:[1,91,98,7.5],caption:'Project Settings',instruction:'進入自己的專案後，展開左側導覽選單，選 Project Settings。這是專案設定入口，不是 Token 表單裡的權限選項。'};
 const general:TutorialFrame={file:'supabase-general-nav.png',box:[4,56,92,17],caption:'Configuration → General',instruction:'在 Project Settings 的 Configuration 下選 General，再找 Project ID。Project ID 是專案代碼，不是任何金鑰。'};
 const projectId:TutorialFrame={file:'supabase-project-id.png',box:[49,24,49,53],caption:'複製 Project ID，組成 Project URL',instruction:'在 General 的 Project ID 按 Copy。完整 Project URL 是 https:// 加上你自己的 Project ID，再加 .supabase.co。也可從 Connect 核對網址；不要貼 supabase.com/dashboard 後台網址，不要照抄截圖裡的代碼。'};
 const fillUrl:TutorialFrame={...projectId,caption:'把完整 Project URL 填回 Aprico',instruction:'回到 Aprico 的「Supabase Project URL」欄，貼上 https://你的專案代碼.supabase.co 並保存。只貼 Project ID 還不是完整網址；網址填好也不代表部署授權已完成。'};
 const edge:TutorialFrame={file:'supabase-functions-nav.png',box:[1,42,98,7],caption:'Edge Functions：後端部署位置',instruction:'自動建置會把本次後端部署到指定專案的 Edge Functions。這裡只說明位置，不必自己按 Deploy a new function 建立範例函式，也不會因看完教學就完成部署。'};
 const secrets:TutorialFrame={file:'supabase-functions-secrets-nav.png',box:[4,72,92,20],caption:'Edge Functions → Secrets',instruction:'Edge Functions 的左側可切換 Functions 與 Secrets。Secrets 用來保存後端使用的值；它不是 Account → Access Tokens，也不是設定 Token 權限的畫面。'};
 const emptyForm:TutorialFrame={file:'supabase-secrets-empty-form.png',box:[59,43,39,36],caption:'空白 Secrets 表單：必要時才補填',instruction:'一般流程由系統配置 LINE Secrets。只有部署結果提示需要補填時，才使用本頁：Name 填建置結果列出的完整變數名稱（含專案前綴），Value 填對應值，再按 Save。CLIENT_KEY 是畫面佔位範例；不要照填，也不要把 Supabase Access Token 填到這裡。'};
 const frames=page==='automatic'?[edge,secrets,emptyForm]:page==='supabase-signup'?[toolbar,card,settings]:page==='supabase-create'?(part==='open'?[toolbar,card,settings]:[card,settings,general]):part==='open'?[card,settings,general]:part==='connect'?[settings,general,projectId]:[general,projectId,fillUrl];
 return {...frames[0],frames,label:'Supabase 桌面版實際截圖',source:page==='automatic'?'https://supabase.com/docs/guides/functions/secrets':'https://supabase.com/docs/guides/getting-started/api-keys',credit:'使用者提供 · 2026-11-05',note:'原圖僅裁切，未重繪介面；已排除帳號列、用量及既有函式／Secret 清單。範例專案與 Project ID 不可照抄。這些是專案後台位置，不是 Token 權限選擇器。'};
}
export function tutorialMedia(unit:{key?:string}):TutorialShot|null{
 const [page,part]=String(unit.key||'').split('#')[0].split('.');
 const projectTutorial=suppliedProjectTutorial(page,part);if(projectTutorial)return projectTutorial;
 const mobile=(file:string,box:TutorialShot['box'],source=githubDocs):TutorialShot=>({file,label:'手機版實際截圖',source,credit:'Aprico 拍攝 · 2026-11-05',box,note:'畫面中的公開帳號是拍攝範例；請使用自己的專案。'});
 const official=(file:string,box:TutorialShot['box'],source:string,credit:string,note='官方範例截圖，可能是桌面版；手機版位置與語言可能不同。請勿照抄範例值。'):TutorialShot=>({file,label:'官方實際截圖',box,source,credit,note});
 if(page==='github-create'){
  if(['public','readme','created'].includes(part))return mobile('github-create-options-mobile.jpg',part==='readme'?[14,37.5,78,14]:part==='created'?[56,81.5,37,6]:[14,23.5,78,13]);
  return mobile('github-create-mobile.jpg',part==='name'?[14,36,78,8]:[14,27,78,8]);
 }
 if(page==='githubRepo')return {...mobile('github-repository-mobile.jpg',[4,4,90,16]),note:'這張實拍用來辨識 Repository 頁面。手機瀏覽器的網址列不在網頁截圖內；請用瀏覽器選單複製網址，不要按 Code 複製 .git。'};
 if(page==='githubToken'&&['install','limited','account','repository'].includes(part))return official(part==='account'?'github-app-authorize.png':'github-app-install.png',part==='account'?[4,70,90,25]:[4,25,90,12],appDocs,'GitHub Docs', '這是 GitHub 官方範例 App。Aprico 的名稱與權限不同；請選 Only select repositories，只勾本次專案，不選 All repositories。');
 if(page==='supabase-create')return official('supabase-project-create-standard.png',({organization:[28,28,48,9],name:[28,38,48,8],password:[28,48,48,10],region:[28,64,48,9],plan:[28,78,48,9],created:[65,90,10,5]} as Record<string,TutorialShot['box']>)[part]||[27,12,49,16],'https://supabase.com/docs/guides/integrations/appsmith','Supabase Docs','官方舊版實際截圖；組織、名稱、區域與費用以你當下畫面為準。保留標準 Postgres，不選預覽版資料庫。');
 if(page==='supabaseToken'){
  const entry:TutorialFrame={file:'supabase-token-entry.png',box:[74,89,24,10],caption:'開啟 Generate new token',instruction:'進入 Account → Access Tokens，按 Generate new token，開啟新的限權申請表單；不要選 Create legacy token。'};
  const scope:TutorialFrame={file:'supabase-token-scope.png',box:[59,30,39,13],caption:'限本次專案與有效期限',instruction:'Name 填容易辨識的名稱；Expires in 選涵蓋本次部署的短效期限。Resource access 保持 Project，選自己的組織及本次專案，不選整個 Organization。'};
  const project:TutorialFrame={file:'supabase-token-permissions.png',box:[1,42,97,10],caption:'Project → Project Settings',instruction:'保留 Preset：No access 作起點，展開 Project，只將 Project Settings 設為 Read。圖中尚未展開細項，Read 選項不在這張截圖內。'};
  const services:TutorialFrame={file:'supabase-token-permissions.png',box:[1,60,97,11],caption:'Application services → 後端部署權限',instruction:'展開 Application services，將 Edge Functions 與 Edge Function Secrets 設為 Read-write，其餘維持 No access。再按 Review access，核對只有本次專案與這三項權限，確認後才產生 Token。展開選項、確認頁與產生結果尚未拍攝。'};
  const review:TutorialFrame={file:'supabase-token-scope.png',box:[81,94,18,5],caption:'核對後才產生並貼回',instruction:'完成範圍與權限設定後按 Review access，核對目標專案、到期時間與三項權限。由你本人確認產生後，只把新 Token 貼回 Aprico 的本頁安全欄位；不要填成 anon、service_role 或 Project URL。'};
  const frames=part==='scope'?[scope,project,services]:part==='input'?[scope,services,review]:[entry,scope,services];
  return {...frames[0],frames,label:'Supabase 桌面版實際截圖',source:'https://supabase.com/docs/guides/platform/personal-access-tokens',credit:'使用者提供 · 2026-11-05',note:'僅保留申請表單及入口，不含既有 Token 清單。這是桌面版實拍，手機位置可能不同；截圖未展開細項或顯示最終核准結果。'};
 }
 if(page==='lineSecret')return official('line-channel-secret.png',[1,14,80,70],'https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/','LINE Developers / LY Corporation','紅框是 Channel secret 與複製圖示。右邊 Issue 是重新發行，不要為了複製而按它。圖中的字串為官方範例。');
 if(page==='messagingChannelId')return official('line-channels.png',[53,44,45,53],'https://developers.line.biz/en/docs/messaging-api/getting-started/','LINE Developers / LY Corporation','先選 Messaging API Channel，再到 Basic settings 取得 Channel ID。此圖是選擇 Channel 的畫面，未顯示 Channel ID 欄位。');
 if(page==='webhook')return official('line-webhook.png',part==='switch'?[2,72,33,23]:[2,20,60,42],'https://developers.line.biz/en/docs/messaging-api/building-bot/','LINE Developers / LY Corporation');
 if(page==='liff')return official('line-liff-list.webp',part==='open'?[14,1,6,8]:[35,40,23,14],'https://developers.line.biz/en/docs/liff/registering-liff-apps/','LINE Developers / LY Corporation','此圖顯示 LIFF 清單；新增時另填 Size 與 Endpoint URL，這張圖沒有示範新增表單。');
 return null;
}
export function tutorialFrame(media:TutorialShot|null,index:number):TutorialFrame|null{
 if(!media)return null;
 return media.frames?.[Math.max(0,Math.min(2,Math.trunc(Number.isFinite(index)?index:0)))]||media;
}
export function shotCamera(width:number,height:number,box:TutorialShot['box'],zoom:boolean){
 if(!zoom)return `0 0 ${width} ${height}`;
 const [x,y,w,h]=box,centerX=(x+w/2)*width/100,centerY=(y+h/2)*height/100;
 const cropW=Math.min(width,Math.max(w*width/100*1.25,h*height/100*1.25*1.3));
 const cropH=Math.min(height,Math.max(cropW/1.3,h*height/100*1.4));
 return `${Math.max(0,Math.min(width-cropW,centerX-cropW/2))} ${Math.max(0,Math.min(height-cropH,centerY-cropH/2))} ${cropW} ${cropH}`;
}
