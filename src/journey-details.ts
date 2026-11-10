import {questSteps,questProof,entered} from './journey.ts';

export type Detail={id:string;title:string;kind:string;text:string;url?:string;field?:string;label?:string;hint?:string;rows?:string[]};
const guideTasks:Record<string,Detail[]>={
 'github-signup':[
  {id:'open',kind:'link',title:'開啟 GitHub 註冊／登入頁',url:'https://github.com/signup',text:'使用自己的帳號。已有帳號也可以直接登入；按連結只記錄你已開啟頁面。'},
  {id:'account',kind:'confirm',title:'完成註冊，或登入既有帳號',text:'依 GitHub 提示使用 Google 或 Email。帳號密碼只填在 GitHub，不填回本站。'},
  {id:'verified',kind:'confirm',title:'完成信箱或帳號驗證',text:'若 GitHub 要求驗證，請依畫面完成；已有帳號且已驗證可直接確認。'},
  {id:'owner',kind:'confirm',title:'確認登入的是自己的 GitHub',text:'看右上角個人頭像與帳號，再返回教學。這是你的確認，尚未授權部署。'}],
 'github-create':[
  {id:'open',kind:'link',title:'開啟建立 Repository 頁',url:'https://github.com/new',text:'為這個 OA 使用專用 repo；已有符合條件的專案也可以開啟檢查。'},
  {id:'owner',kind:'confirm',title:'Owner 選自己的帳號',text:'確認新專案會建立在你自己的 GitHub 帳號底下。'},
  {id:'name',kind:'confirm',title:'填入 Repository name',text:'在 GitHub 填這個 OA 的專案名稱，建議用英文、數字與連字號。'},
  {id:'public',kind:'confirm',title:'Visibility 選 Public',text:'目前的部署流程需要公開 repo。公開程式碼中不能放金鑰。'},
  {id:'created',kind:'confirm',title:'按 Create repository，開啟專案頁',text:'可以保留空白，部署時會自動建立第一筆提交。已有專案時，確認尚未啟用 Pages。'}],
 'githubRepo':[
  {id:'open',kind:'link',title:'開啟自己的 Repository',url:'https://github.com/',text:'在 GitHub 進入本次專用專案，不是個人帳號首頁。'},
  {id:'copy',kind:'confirm',title:'複製專案頁上方的網址',text:'格式是 https://github.com/帳號/專案；不用複製 .git 或 .github.io 網址。'},
  {id:'input',kind:'field',field:'githubRepo',label:'GitHub repository 網址',title:'貼上 GitHub 專案網址',hint:'https://github.com/你的帳號/你的專案',text:'系統先檢查網址格式；網址正確不代表已有部署權限。'},
  {id:'save',kind:'save',title:'保存這個網址',text:'保存後會綁在你的 Aprico 專案設定，切換頁面仍可找回。'}],
 'supabase-signup':[
  {id:'open',kind:'link',title:'開啟 Supabase 註冊／登入頁',url:'https://supabase.com/dashboard/sign-up',text:'已有帳號可登入；使用 LINE 登入本站，不代表已經擁有 Supabase 帳號。'},
  {id:'account',kind:'confirm',title:'選 GitHub 或 Email 完成登入',text:'可以沿用自己的 GitHub 帳號，或用自己的 Email 註冊。'},
  {id:'verified',kind:'confirm',title:'依要求完成帳號驗證',text:'若要求信箱驗證，先到自己的信箱操作；已驗證帳號可以直接確認。'},
  {id:'owner',kind:'confirm',title:'確認進入自己的 Dashboard',text:'看目前帳號與組織，再返回教學。這不等於已授權 Aprico 操作專案。'}],
 'supabase-create':[
  {id:'open',kind:'link',title:'開啟 Supabase Dashboard',url:'https://supabase.com/dashboard',text:'已有專用專案可直接開啟；建立新專案時，依下列格子完成。'},
  {id:'organization',kind:'confirm',title:'選自己的 Organization',text:'沒有組織時，先依平台畫面建立自己的組織。'},
  {id:'name',kind:'confirm',title:'在 New project 填專案名稱',text:'用容易識別這個 LINE OA 的名稱，確認不是平台或別人的專案。'},
  {id:'password',kind:'confirm',title:'設定並保管 Database password',text:'這個密碼由你自行保管，不用填入 Aprico，也不要貼到聊天。'},
  {id:'region',kind:'confirm',title:'選擇服務 Region',text:'依使用者所在區域與平台提供的選項選擇服務區域。'},
  {id:'plan',kind:'confirm',title:'確認方案、配額與費用',text:'若需要付費，先確認金額再決定；已有可用專案可直接確認。'},
  {id:'created',kind:'confirm',title:'建立專案並等待啟動',text:'按 Create new project，等 Dashboard 可以開啟專案後再確認。'}],
 'supabaseUrl':[
  {id:'open',kind:'link',title:'開啟自己的 Supabase 專案',url:'https://supabase.com/dashboard',text:'進入剛才建立或已經存在的專用專案。'},
  {id:'connect',kind:'confirm',title:'從 Project ID 取得 Project URL',text:'進入 Project Settings → General，複製 Project ID；完整網址是 https:// 加上這個代碼，再加 .supabase.co。也可從 Connect 核對，請勿照抄教學範例。'},
  {id:'input',kind:'field',field:'supabaseUrl',label:'Supabase Project URL',title:'貼上 Project URL',hint:'https://你的專案代碼.supabase.co',text:'只貼專案網址，不貼後台網址、資料庫連線字串或 Key。'},
  {id:'save',kind:'save',title:'保存 Project URL',text:'保存後可切換頁面繼續，部署授權會在後面的關卡核對。'}]
};
export function detailDefinitions(q:any,mode='app',cells=4):Detail[]{
 if(guideTasks[q.id]&&q.id!=='supabaseUrl')return guideTasks[q.id];
 if(q.id==='githubToken'&&mode==='app')return [
  {id:'install',kind:'link',title:'安裝 Aprico GitHub App',text:'開啟 GitHub 安裝頁，只勾本次專用 repo；連結已開啟不等於授權完成。'},
  {id:'limited',kind:'confirm',title:'確認只勾選本次專用專案',text:'在 GitHub 選 Only select repositories，再勾本次專用 repo。'},
  {id:'account',kind:'oauth',title:'連接並核對 GitHub 帳號',text:'在同一個瀏覽器完成登入授權，回來更新結果。專案部署權限在下一格核對。'},
  {id:'repository',kind:'binding',title:'選擇並核對專用 GitHub 專案',text:'選擇 repo 後，按「核對此專案的部署權限」，確認 GitHub App 可為這個 repo 發出部署憑證。'}];
 if(q.id==='supabaseUrl')return guideTasks.supabaseUrl.filter(d=>['field','save'].includes(d.kind));
 if(q.kind==='field')return [
  {id:'input',kind:'field',field:q.id,label:q.label,title:q.label,hint:q.hint,text:q.hint},
  {id:'save',kind:'save',title:'保存這項資料',text:'填妥後保存。綠色「已保存」代表已寫入你的專案，不是系統已驗證外部平台。'}];
 if(q.kind==='secret')return [
  {id:'open',kind:'link',title:'開啟本項設定頁',url:q.url,text:'只使用本次專案與自己的帳號，依圖解找到對應位置。'},
  {id:'scope',kind:'confirm',title:q.id==='lineSecret'||q.id==='lineToken'?'確認是同一個 Messaging API Channel':'確認憑證只限本次專案',text:q.id==='githubToken'?'只授權本次 repo 的 Contents、Pages、Administration 讀寫。':q.id==='supabaseToken'?'Resource access 選 Project，只選本次專案；Project Settings：Read，Edge Functions 與 Edge Function Secrets：Read-write，其餘維持 No access。選短效期限，Review access 核對後再產生；不是 anon 或 service_role Key。':'從剛才選定的 Channel 複製 Secret，核對 Channel ID 與 Secret 來自同一個頁面。'},
  {id:'input',kind:'credential',field:q.id,label:q.label,title:'填入 '+q.label,text:q.id==='lineToken'?'已有 Token 就沿用；沒有才 Issue。此欄只留在目前頁面記憶體，離開或重新整理會清空。':'憑證只留在目前頁面記憶體，離開或重新整理會清空；不存到進度紀錄。'}];
 if(q.kind==='review')return [
  {id:'verify',kind:'verify',title:'核對本次帳號與授權',text:'由系統核對 GitHub、Supabase 與 LINE 的目標帳號，尚未扣 AI 次數或修改外部設定。'},
  {id:'consent',kind:'consent',title:'確認帳號與本次任務範圍',text:'逐項看過下方結果，再決定是否同意本次建置與公開發布。勾選不會直接扣次數。'},
  {id:'start',kind:'start',title:'送出本次建置任務',text:'只有你按下這一格的確認按鈕後，系統才會接手本次任務；失敗不會自動重試或加購。'}];
 if(q.kind==='automatic')return [{id:'system',kind:'system',title:'交給 AI 與系統自動完成',text:'系統工作合併成這一格；處理中不算完成，等系統回報完成後才增加這一點進度。'}];
 if(q.kind==='manual')return [
  {id:'switch',kind:'confirm',title:q.id==='webhook'?'在 LINE 開啟 Use webhook':'檢查 LINE Login Channel 是否已發布',
   url:q.url,text:q.id==='webhook'?'在同一個 Messaging API Channel 的 Messaging API 分頁開啟 Use webhook。若沒有顯示開關，可等部署後依提示開啟。':'如果要讓一般好友使用 App，在 LINE Login Channel 發布。只供管理員測試時可維持 Developing。'}];
 if(q.id==='menu')return [

  ...Array.from({length:cells},(_,i)=>({id:'cell-'+i,kind:'confirm',title:`測試第 ${i+1} 格選單入口`,text:'在 LINE 手機中按這一格，確認名稱、畫面與功能反應符合需求。'})),
  {id:'report',kind:'accept',title:'保存本頁實測回報',text:'保存你的測試確認；這不是系統獨立驗證。'}];
 if(q.kind==='acceptance')return [
  {id:'open',kind:'link',title:q.id==='website'?'開啟我的網站':q.id==='liff'?'開啟 LINE 中的 App':'開啟自己的 LINE OA',text:q.id==='lineMessage'?'在手機 LINE 加入自己的 OA，準備傳送一則真實訊息。':q.id==='liff'?'在手機 LINE 的圖文選單開啟半頁／全頁 App，確認畫面與連結。':'開啟部署後的實際網站，準備逐項測試。'},
  {id:'tested',kind:'confirm',title:q.id==='website'?'我已操作網站並確認內容':q.id==='liff'?'我已用手機測試 App 入口':'我已傳訊息並收到預期回覆',text:'完成實際操作後再按確認；這是本人實測紀錄。'},
  {id:'report',kind:'accept',title:'保存本頁實測回報',text:'把測試確認保存到你的專案。系統不會宣稱所有功能已經獨立驗證。'}];
 return [];
}
export const detailKey=(q:any,d:Detail,deploymentId?:string)=>q.id+'.'+d.id+(q.kind==='acceptance'&&deploymentId?'#'+deploymentId:'');
const localKeys=new Set(questSteps.flatMap(q=>['app','token'].flatMap(mode=>detailDefinitions(q,mode,8).filter(d=>['link','confirm'].includes(d.kind)).map(d=>detailKey(q,d)))));
export function safeDetailAcks(value:any){if(!value||typeof value!=='object')return {};return Object.fromEntries(Object.keys(value).filter(k=>{const [base,scope,...extra]=k.split('#');return value[k]===true&&localKeys.has(base)&&extra.length===0&&(!scope||/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(scope)&&['webhook','website','lineMessage','menu','liff'].includes(base.split('.')[0]));}).slice(-240).map(k=>[k,true]));}
export function detailProof(q:any,d:Detail,c:any){
 const base=questProof(q,c),record=c.deployment,deployed=record?.status==='awaiting_acceptance',legacy=q.kind==='guide'&&!q.field&&c.acks?.[q.id]===true;
 const ack=Boolean(c.details?.[detailKey(q,d,record?.id)]),isGithub=q.id==='githubToken'&&c.githubMode!=='token';
 if(d.kind==='oauth')return {done:Boolean(c.github?.flow||c.githubApp||record),label:'系統已核對 GitHub 帳號'};
 if(d.kind==='binding')return {done:Boolean(c.githubApp||record),label:'專案已由伺服器綁定'};
 if(isGithub&&d.id==='limited'&&(c.githubApp||record))return {done:true,label:'專用專案已綁定'};
 if(isGithub&&d.id==='install'&&(c.github?.flow||c.githubApp||record))return {done:true,label:'帳號／專案授權已核對'};
 if(d.kind==='field')return {done:entered(q,c.setup,c.secrets),label:c.savedSetup?.[d.field!]===c.setup[d.field!]?'已填入並保存':'已填入 · 尚未保存'};
 if(d.kind==='save')return {done:base.done,label:'資料已保存'};
 if(d.kind==='link'&&q.kind==='secret'&&base.done)return {done:true,label:'憑證已填入'};
 if(d.kind==='confirm'&&q.kind==='secret'&&base.done)return {done:true,label:'憑證已填入，待核對'};
 if(d.kind==='credential')return {done:base.done,label:record?'授權已使用；原文已清空':'已填入 · 待系統核對'};
 if(d.kind==='verify')return {done:base.done,label:'系統已核對目標'};
 if(d.kind==='consent')return {done:Boolean(c.consent||record),label:'本人同意本次任務'};
 if(d.kind==='start')return {done:Boolean(c.intent||c.job||record),label:'本次任務已送出'};
 if(d.kind==='system')return base;
 if(d.kind==='accept')return base;
 if(q.kind==='acceptance')return {done:deployed&&(record?.user_checks?.[q.id]===true||ack),label:d.kind==='link'?'已開啟測試入口':'本人實測確認'};
 if(q.kind==='manual')return {done:deployed||ack,label:deployed&&q.id==='webhook'&&record.system_checks?.webhookActive?'系統已讀到開啟':'本人已檢查'};
 return {done:ack||legacy||Boolean(record&&['guide','secret'].includes(q.kind)),label:d.kind==='link'?'已開啟連結':'本人確認完成'};
}
export function pageDetails(q:any,c:any){return detailDefinitions(q,c.githubMode,c.grid||4).map(d=>({...d,key:detailKey(q,d,c.deployment?.id),...detailProof(q,d,c)}));}
export function detailProgress(steps:readonly any[],c:any){
 const pages=steps.map(q=>{const units=pageDetails(q,c),done=units.filter(d=>d.done).length;return {id:q.id,done,total:units.length,complete:units.length>0&&done===units.length};});
 const done=pages.reduce((n,p)=>n+p.done,0),total=pages.reduce((n,p)=>n+p.total,0);
 return {done,total,percent:total?Math.floor(done/total*1000)/10:0,pages};
}
