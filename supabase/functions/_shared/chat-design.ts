import {emptyDraft,validateDraft,themes,type Cell,type Draft} from '../../../src/model.ts';
import {CENTER_LIFF,DESIGN_COMMAND} from '../../../src/center-menu.ts';

const directions={oa:'官方帳號卡片與按鈕',records:'個人／群組對話紀錄',both:'兩個方向都要'};
const conversations={personal:'個人私聊',group:'群組',both:'個人與群組'};
const actions={message:'傳送訊息',half:'半頁 App',full:'全頁 App',web:'開啟網頁'};
type Step='intro'|'direction'|'name'|'oaName'|'grid'|'theme'|'purpose'|'label'|'action'|'content'|'conversation'|'features'|'policy'|'review'|'saved'|'demo'|'demoConfirm';
type State={id:string;step:Step;draft:Draft;index:number;demo?:string};
const purposes={record:'紀錄',contact:'聯絡／接洽',share:'資訊傳遞',service:'個人資訊服務',custom:'自訂'};
type Choice=[string,string,{inputOption:'openKeyboard';fillInText:string}?];
const choices=(items:Record<string,string>):Choice[]=>Object.entries(items).map(([value,label])=>[label,value]);
const text=(value:string)=>({type:'text',text:value});
const link=(id:string,page:string)=>CENTER_LIFF+'/'+page+'?project='+encodeURIComponent(id);
function card(title:string,body:string,choices:Choice[]=[],revision='',links:Choice[]=[]){
 const buttons=[
  ...choices.map(([label,value,input])=>({type:'button',height:'sm',action:{type:'postback',label,data:new URLSearchParams({aprico_design:value,v:revision}).toString(),...input}})),
  ...links.map(([label,uri])=>({type:'button',height:'sm',action:{type:'uri',label,uri}}))
 ];
 return {type:'flex',altText:title,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[
  {type:'text',text:'APRICO · AI 生活秘書',size:'xs',color:'#52765F',weight:'bold'},
  {type:'text',text:title,size:'lg',weight:'bold',wrap:true},
  {type:'text',text:body,size:'sm',wrap:true,color:'#344B40'}
 ]},...(buttons.length?{footer:{type:'box',layout:'vertical',spacing:'sm',contents:buttons}}:{})}};
}
const fields:Partial<Record<Step,[string,string,number]>>={
 name:['專案名稱','為這份設計取個好辨識的名字。',80],
 oaName:['LINE OA 名稱','輸入預計在 LINE 顯示的官方帳號名稱。',80],
 label:['按鈕名稱','輸入使用者會看到的名稱。',30],
 content:['按鈕內容','填寫訊息內容、App 功能說明或 HTTPS 連結。',500],
 features:['想整理哪些紀錄？','例如行程、支出、目標、待辦，也可寫下圖片辨識或定時摘要需求。',500],
 policy:['何時整理、由誰確認？','例如只整理標記給秘書的訊息，由指定成員確認後存檔，保留 30 天。先取得群組成員同意。',500]
 ,demo:['試一句給秘書','例如「明天下午 3 點跟客戶開會」。目前可試用行程整理。',160]
};
function show(s:State,v:string){
 if(s.step==='name'||s.step==='oaName'){
  const title=fields[s.step]![0],label=s.step==='name'?'輸入專案名稱':'輸入 LINE OA 名稱';
  return card(title,'點「'+label+'」，在下方輸入名稱後送出。也可直接傳送「填寫 你的'+title+'」。',[[label,'open_name',{inputOption:'openKeyboard',fillInText:'填寫 '}]],v);
 }
 const field=fields[s.step];
 if(field)return card((['label','content'].includes(s.step)?'第 '+(s.index+1)+' 格 · ':'')+field[0],field[1]+'\n請在聊天室輸入「填寫 你的內容」。');
 switch(s.step){
  case 'intro':return card('第 1 步 · 認識你的 AI 生活秘書','把 AI 結合 LINE，成為你的個人生活秘書，減少生活雜訊與來回溝通的成本。',[['開始規劃','next']],v);
  case 'direction':return card('第 2 步 · 你想怎麼使用？','官方帳號可用卡片與介面按鈕做紀錄、聯絡、接洽、資訊傳遞或個人資訊服務。也能規劃個人或群組對話紀錄。',choices(directions),v);
  case 'grid':return card('官方帳號 · 選單格數','選擇想讓使用者在聊天室看到幾個入口。',[['4 格','4'],['6 格','6'],['8 格','8']],v);
  case 'theme':return {type:'flex',altText:'選擇選單配色',contents:{type:'carousel',contents:[0,4].map(start=>card('選擇選單配色','挑選一個主題。',themes.slice(start,start+4).map((theme,i)=>[theme.name,String(start+i)]),v).contents)}};
  case 'purpose':return card('第 '+(s.index+1)+' 格 · 這格要做什麼？','選擇用途，下一張再設定名稱和動作。',choices(purposes),v);
  case 'action':return card('第 '+(s.index+1)+' 格 · 點擊後的動作','選擇使用者點下「'+s.draft.cells[s.index].label+'」後的反應。',choices(actions),v);
  case 'conversation':return card('對話紀錄 · 使用範圍','選擇要規劃的對話場景。',choices(conversations),v);
  case 'review':return card('確認你的設計',[s.draft.name+' · '+s.draft.oaName,directions[s.draft.secretary!.direction],...(s.draft.secretary!.direction!=='records'?s.draft.cells.slice(0,s.draft.grid).map(c=>c.label+' · '+actions[c.action]):[]),s.draft.secretary!.features,s.draft.secretary!.policy].filter(Boolean).join('\n'),[['保存這份設計','save']],v);
  case 'saved':return card('設計已保存','可以先試用，再決定是否前往建置。',s.draft.secretary!.direction==='oa'?[]:[['試用秘書回覆','demo']],v,[...(s.draft.secretary!.direction!=='records'?[['開啟個人選單試用',link(s.id,'design.html')+'&preview=chat'] as Choice,['開啟建置中心',link(s.id,'build.html')] as Choice]:[]),['查看設計',link(s.id,'design.html')]]);
  case 'demoConfirm':return card('待確認行程 · 試用',s.demo+'\n這是試用結果。',[['確認示範','confirm'],['修改或再試一句','demo']],v);
 }
 throw Error('unknown_design_step');
}

function advance(s:State,value:string,typed:boolean):boolean{
 const field=fields[s.step];
 if(field&&(!typed||!value||value.length>field[2]))return false;
 if(!field&&typed)return false;
 const d=s.draft,cell=d.cells[s.index];
 switch(s.step){
  case 'intro':if(value!=='next')return false;s.step='direction';break;
  case 'direction':if(!Object.hasOwn(directions,value))return false;d.secretary={direction:value as NonNullable<Draft['secretary']>['direction']};s.step='name';break;
  case 'name':d.name=value;s.step='oaName';break;
  case 'oaName':d.oaName=value;s.step=d.secretary!.direction==='records'?'conversation':'grid';break;
  case 'grid':if(!['4','6','8'].includes(value))return false;d.grid=Number(value) as Draft['grid'];s.step='theme';break;
  case 'theme':if(!/^[0-7]$/.test(value))return false;d.theme=Number(value);s.step='purpose';break;
  case 'purpose':if(!Object.hasOwn(purposes,value))return false;(d.secretary!.menuPurposes??=[])[s.index]=purposes[value as keyof typeof purposes];s.step='label';break;
  case 'label':cell.label=value;s.step='action';break;
  case 'action':if(!Object.hasOwn(actions,value))return false;cell.action=value as Cell['action'];s.step='content';break;
  case 'content':
   if(cell.action==='web'){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return false;}catch{return false;}}
   cell.content=value;
   if(s.index+1<d.grid){s.index++;s.step='purpose';}else s.step=d.secretary!.direction==='both'?'conversation':'review';
   break;
  case 'conversation':if(!Object.hasOwn(conversations,value))return false;d.secretary!.conversation=value as NonNullable<Draft['secretary']>['conversation'];s.step='features';break;
  case 'features':d.secretary!.features=value;s.step='policy';break;
  case 'policy':d.secretary!.policy=value;s.step='review';break;
  case 'saved':if(value!=='demo'||d.secretary?.direction==='oa')return false;s.step='demo';break;
  case 'demo':{
   const match=value.match(/^(今天|明天|後天|\d{1,2}[月/]\d{1,2}日?)\s*(上午|早上|下午|晚上)?\s*(\d{1,2})\s*(?:[:：](\d{2})|點(半)?(?:\s*(\d{1,2})分)?)\s*(.+)$/u);
   if(!match)return false;
   const [,date,period,hour,clockMinutes,half,minutes,title]=match;
   let h=Number(hour);
   const m=half?30:Number(clockMinutes??minutes??0);
   if(m>59||h>23||(period&&(h<1||h>12)))return false;
   if(period)h=h%12+(['下午','晚上'].includes(period)?12:0);
   s.demo=date+' '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+'｜'+title.trim();s.step='demoConfirm';break;
  }
  case 'demoConfirm':if(!['demo','confirm'].includes(value))return false;delete s.demo;s.step=value==='demo'?'demo':'saved';break;
  default:return false;
 }
 return true;
}

export async function chatDesignGateway(event:any,r:{authenticated:boolean;db:any;reply:(token:string,messages:any[])=>Promise<unknown>}){
 if(!r.authenticated||event.source?.type!=='user'||!/^U[0-9a-f]{32}$/.test(event.source.userId||'')||!event.replyToken)return false;
 const raw=event.type==='message'&&event.message?.type==='text'?event.message.text.trim():'';
 const params=new URLSearchParams(event.type==='postback'?event.postback?.data||'':'');
 const choice=params.get('aprico_design'),typed=/^填寫\s/.test(raw);
 if(raw!==DESIGN_COMMAND&&!choice&&!typed)return false;
 const own=event.source.userId,eventId=event.webhookEventId;
 if(typeof eventId!=='string'||!/^[\w-]{10,100}$/.test(eventId))return true;
 const reply=(...messages:any[])=>r.reply(event.replyToken,messages);
 const table='line_oa_kit_chat_design_sessions';
 const read=await r.db.from(table).select('revision,state,last_event,updated_at').eq('line_subject',own).maybeSingle();
 if(read.error)throw Error('chat_design_read');
 const previous=read.data;
 if(previous?.last_event===eventId)return true;
 const current=previous;
 if(raw===DESIGN_COMMAND){
  await reply(card('第 0 步 · 開始打造你的 LINE OA','從頭建立新設計，或開啟用這個 LINE 帳號保存的專案。',[
   ['從頭開始','new'],['選擇已有專案','projects'],...(current&&current.state.step!=='saved'?[['繼續未完成設計','resume'] as Choice]:[])
  ],previous?.revision||''));return true;
 }
 if(choice==='projects'){
  const {data,error}=await r.db.from('line_oa_kit_designs').select('id,name:config->>name').eq('line_subject',own).order('updated_at',{ascending:false}).limit(8);
  if(error)throw Error('chat_design_projects');
  const projects:Choice[]=(data||[]).map((p:any)=>[(p.name||'未命名設計').slice(0,20),'project:'+p.id]);
  await reply(projects.length?{type:'flex',altText:'你的已保存設計',contents:{type:'carousel',contents:Array.from({length:Math.ceil(projects.length/4)},(_,i)=>card('你的已保存設計','選一個最近的專案查看或修改。',projects.slice(i*4,i*4+4)).contents)}}:card('還沒有已保存的設計','先從頭建立一份設計。',[['從頭開始','new']],previous?.revision||''));return true;
 }
 if(choice?.startsWith('project:')){
  const id=choice.slice(8);
  if(!/^[0-9a-f-]{36}$/i.test(id))return true;
  const {data,error}=await r.db.from('line_oa_kit_designs').select('config').eq('id',id).eq('line_subject',own).maybeSingle();
  if(error)throw Error('chat_design_project_read');
  if(!data){await reply(text('找不到這份設計。'));return true;}
  const d=validateDraft(data.config);
  const summary=[d.oaName,...d.cells.slice(0,d.grid).map(c=>c.label).filter(Boolean),d.secretary?.features].filter(Boolean).join('\n');
  await reply(card(d.name||'未命名設計',summary||'這份專案尚未填寫功能。',[],'',[['修改設計',link(id,'design.html')],...(d.secretary?.direction==='records'?[]:[['開啟個人選單試用',link(id,'design.html')+'&preview=chat'] as Choice])]));
  return true;
 }
 if(choice==='resume'&&current){await reply(show(current.state,current.revision));return true;}
 if(choice==='new'&&current&&current.state.step!=='saved'){
  await reply(card('從頭開始？','目前的未完成草稿會被取代。',[['確認從頭開始','restart'],['繼續設計','resume']],current.revision));return true;
 }
 const starting=choice==='new'||choice==='restart';
 if(choice==='new'&&(params.get('v')||'')!==(previous?.revision||'')){await reply(text('這張開始卡已更新，請再次點選「打造我的 LINE OA」。'));return true;}
 if(choice!=='new'&&!current){if(choice)await reply(text('請再次點選「打造我的 LINE OA」開始。'));return Boolean(choice);}
 if(choice!=='new'&&choice&&params.get('v')!==current.revision){await reply(show(current.state,current.revision));return true;}
 if(choice==='open_name')return true;
 const state:State=starting?{id:crypto.randomUUID(),step:'intro',draft:emptyDraft(),index:0}:structuredClone(current.state);
 if(choice==='save'&&state.step==='review'){
  const {error}=await r.db.from('line_oa_kit_designs').upsert({id:state.id,line_subject:own,config:validateDraft(state.draft),revision:1},{onConflict:'id',ignoreDuplicates:true});
  if(error)throw Error('chat_design_save');
  state.step='saved';
 }else if(!starting&&!advance(state,typed?raw.replace(/^填寫\s+/,'').trim():choice||'',typed)){
  await reply(text(state.step==='demo'?'請補上日期、時間及行程名稱，例如「明天下午 3 點跟客戶開會」。':'請依照目前卡片的方式選擇或填寫。'),show(current.state,current.revision));return true;
 }
 const revision=crypto.randomUUID(),next={revision,state,last_event:eventId,updated_at:new Date().toISOString()};
 const changed=previous?await r.db.from(table).update(next).eq('line_subject',own).eq('revision',previous.revision).select('revision').maybeSingle():await r.db.from(table).insert({line_subject:own,...next}).select('revision').single();
 if(changed.error&&changed.error.code!=='23505')throw Error('chat_design_write');
 if(changed.data){
  if(choice==='confirm'&&state.step==='saved')await reply(text('示範行程已確認。'),show(state,revision));
  else await reply(show(state,revision));
 }
 return true;
}
