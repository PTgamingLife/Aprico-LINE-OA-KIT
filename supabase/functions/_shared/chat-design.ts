import {emptyDraft,validateDraft,themes,type Cell,type Draft} from '../../../src/model.ts';
import {CENTER_LIFF,DESIGN_COMMAND} from '../../../src/center-menu.ts';
import {prints,type PrintKey} from '../../../src/backgrounds.ts';

const directions={oa:'官方帳號卡片與按鈕',records:'個人／群組對話紀錄',both:'兩個方向都要'};
const conversations={personal:'個人私聊',group:'群組',both:'個人與群組'};
const actions={message:'傳送訊息',half:'半頁 App',full:'全頁 App',web:'開啟網頁'};
type Step='intro'|'direction'|'name'|'oaName'|'grid'|'theme'|'pattern'|'purpose'|'label'|'action'|'content'|'conversation'|'features'|'policy'|'review'|'saved'|'demo'|'demoConfirm';
type State={id:string;step:Step;draft:Draft;index:number;demo?:string;portrait?:'male'|'female'};
const purposes={record:'紀錄',contact:'聯絡／接洽',share:'資訊傳遞',service:'個人資訊服務',custom:'自訂'};
type Choice=[string,string,({inputOption:'openKeyboard';fillInText:string}|{colors:string[]})?];
const choices=(items:Record<string,string>):Choice[]=>Object.entries(items).map(([value,label])=>[label,value]);
const patternChoices:Choice[]=[['不加印花','none'],...prints.map(({name,key}):Choice=>[name,key])];
const text=(value:string)=>({type:'text',text:value});
const link=(id:string,page:string)=>CENTER_LIFF+'/'+page+'?project='+encodeURIComponent(id);
const sigil='https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/summoning-sigil.png';
function card(title:string,body:string,choices:Choice[]=[],revision='',links:Choice[]=[]){
 const buttons=[
  ...choices.map(([label,value,options])=>{
   const action={type:'postback',label,data:new URLSearchParams({aprico_design:value,v:revision}).toString()};
   if(options&&'colors' in options)return {
    type:'box',layout:'horizontal',alignItems:'center',paddingAll:'9px',cornerRadius:'md',
    borderWidth:'1px',borderColor:'#E4DEEC',action,contents:[
     {type:'text',text:label,size:'sm',color:'#344B40',wrap:true,flex:1},
     {type:'box',layout:'horizontal',flex:0,spacing:'xs',contents:options.colors.map(color=>({
      type:'box',layout:'vertical',contents:[],width:'17px',height:'17px',cornerRadius:'xs',backgroundColor:color,
      borderWidth:'1px',borderColor:'#00000018'
     }))}
    ]
   };
   return {type:'button',height:'sm',action:{...action,...options}};
  }),
  ...links.map(([label,uri])=>({type:'button',height:'sm',action:{type:'uri',label,uri}}))
 ];
 return {type:'flex',altText:title,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',backgroundColor:'#FCFAFF',contents:[
  {type:'text',text:'APRICO · AI 宇宙召喚中心',size:'xs',color:'#52765F',weight:'bold'},
  {type:'image',url:sigil,position:'absolute',offsetTop:'0px',offsetEnd:'0px',size:'136px',aspectRatio:'1:1'},
  {type:'text',text:title,size:'lg',weight:'bold',wrap:true},
  {type:'text',text:body,size:'sm',wrap:true,color:'#344B40'}
 ]},...(buttons.length?{footer:{type:'box',layout:'vertical',spacing:'sm',backgroundColor:'#FCFAFF',contents:buttons}}:{})}};
}
const fields:Partial<Record<Step,[string,string,number,string]>>={
 name:['專案名稱','為你的召喚法陣命名。這個專案名稱會幫你找回這份設計。',80,'輸入專案名稱'],
 oaName:['LINE OA 名稱','現在為秘書的服務入口命名。這是顧客會在 LINE 看到的官方帳號名稱。',80,'輸入 LINE OA 名稱'],
 label:['按鈕名稱','為這格符文取名。這就是使用者在選單上看到的按鈕名稱。',30,'輸入按鈕名稱'],
 content:['按鈕內容','寫下這格符文要觸發的內容。依你剛選的動作，填寫訊息、App 功能說明或 HTTPS 連結。',500,'輸入按鈕內容'],
 features:['想整理哪些紀錄？','告訴秘書要替你收錄哪些日常片段，例如行程、支出、目標或待辦。也可以寫下圖片辨識或定時摘要的需求。',500,'輸入想整理的紀錄'],
 policy:['何時整理、由誰確認？','為記憶符文訂下規則。例如只整理標記給秘書的訊息，由指定成員確認後存檔，保留 30 天。啟用群組紀錄前，請先取得成員同意。',500,'輸入整理與確認規則'],
 demo:['試一句給秘書','用一句日常指令試試秘書的行程能力，例如「明天下午 3 點跟客戶開會」。',160,'輸入試用訊息']
};
function show(s:State,v:string){
 const field=fields[s.step];
 if(field){
  const [title,hint,,label]=field;
  const prefix=['label','content'].includes(s.step)?'第 '+(s.index+1)+' 格 · ':'';
  return card(prefix+title,hint+'\n點下方按鈕即可輸入。也可直接傳送「填寫 你的內容」。',[[label,'open_name',{inputOption:'openKeyboard',fillInText:'填寫 '}]],v);
 }
 switch(s.step){
  case 'intro':return card('第 1 步 · 喚醒你的 AI 生活秘書','你的秘書將在 LINE 裡整理散落的資訊和待辦，減少生活雜訊與來回溝通。準備好了，就開始第一段吟唱。',[['開始吟唱','next']],v);
  case 'direction':return card('第 2 步 · 選擇秘書的能力','選擇要賦予秘書哪一種能力。它可以用官方帳號的卡片與按鈕做紀錄、聯絡接洽或傳遞資訊，也能整理個人或群組對話。',choices(directions),v);
  case 'grid':return card('召喚法陣 · 選單格數','每一格符文都是一個功能入口。選擇聊天室要顯示幾格。',[['4 格','4'],['6 格','6'],['8 格','8']],v);
  case 'theme':return {type:'flex',altText:'選擇選單配色',contents:{type:'carousel',contents:[0,4].map(start=>card('選擇選單配色','色塊就是圖文選單會用的配色。點整列選取，左右滑動查看其他主題。',themes.slice(start,start+4).map((theme,i)=>[theme.name,String(start+i),{colors:theme.colors}]),v).contents)}};
  case 'pattern':return {type:'flex',altText:'選擇選單印花',contents:{type:'carousel',contents:[0,3,6].map(start=>card('選擇選單印花','為召喚法陣加上底紋。左右滑動可查看其他印花，也可以保留純色。',patternChoices.slice(start,start+3),v).contents)}};
  case 'purpose':return card('第 '+(s.index+1)+' 格 · 這格要做什麼？','先決定這格符文的用途，接著再為它命名並指定點擊動作。',choices(purposes),v);
  case 'action':return card('第 '+(s.index+1)+' 格 · 點擊後的動作','選擇使用者點下「'+s.draft.cells[s.index].label+'」後的反應。',choices(actions),v);
  case 'conversation':return card('記憶符文 · 對話紀錄範圍','選擇秘書未來要在哪裡協助整理對話。',choices(conversations),v);
  case 'review':return card('核對召喚法陣',[s.draft.name+' · '+s.draft.oaName,directions[s.draft.secretary!.direction],...(s.draft.secretary!.direction!=='records'?[
   themes[s.draft.theme].name+' · '+(prints.find(p=>p.key===s.draft.pattern)?.name||'不加印花'),
   ...s.draft.cells.slice(0,s.draft.grid).map(c=>c.label+' · '+actions[c.action])
  ]:[]),s.draft.secretary!.features,s.draft.secretary!.policy].filter(Boolean).join('\n'),[['保存這份設計','save']],v);
  case 'saved':{
   const options:Choice[]=s.portrait?[]:[['召喚秘書','summon']];
   if(s.draft.secretary!.direction!=='oa')options.push(['試用秘書回覆','demo']);
   const links:Choice[]=[];
   if(s.portrait)links.push(['打造可以為你工作的工具',link(s.id,'build.html')]);
   if(s.draft.secretary!.direction!=='records')links.push(['開啟個人選單試用',link(s.id,'design.html')+'&preview=chat']);
   links.push(['查看設計',link(s.id,'design.html')]);
   if(!s.portrait)return card('設計已保存','召喚法陣準備好了。點下方按鈕，揭曉你的 LINE AI 秘書。',options,v,links);
   const revealed=card('召喚成功','你的專屬秘書已現身。接下來，到建置中心打造它可以替你使用的工具。',options,v,links);
   return {...revealed,contents:{...revealed.contents,hero:{
    type:'image',url:'https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/secretaries/summon-'+s.portrait+'.jpg',
    size:'full',aspectRatio:'3:4',aspectMode:'fit',backgroundColor:'#FCFAFF'
   }}};
  }
  case 'demoConfirm':return card('待確認行程 · 試用',s.demo+'\n這是秘書為你整理的試用行程。',[['確認示範','confirm'],['修改或再試一句','demo']],v);
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
  case 'theme':if(!/^[0-7]$/.test(value))return false;d.theme=Number(value);s.step='pattern';break;
  case 'pattern':if(!patternChoices.some(([,key])=>key===value))return false;d.pattern=value as PrintKey;s.step='purpose';break;
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
  case 'saved':
   if(value==='summon'){s.portrait??=Math.random()<0.5?'male':'female';break;}
   if(value!=='demo'||d.secretary?.direction==='oa')return false;
   s.step='demo';break;
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
  await reply(card('第 0 步 · AI 宇宙召喚中心','恭喜來到 AI 宇宙，接下來透過一連串的吟唱，你可以召喚出一個專屬於你的 LINE AI 秘書，讓我們一起完成召喚的法陣吧！',[
   ['從頭開始','new'],['選擇已有專案','projects'],...(current&&current.state.step!=='saved'?[['繼續未完成設計','resume'] as Choice]:[])
  ],previous?.revision||''));return true;
 }
 if(choice==='projects'){
  const {data,error}=await r.db.from('line_oa_kit_designs').select('id,name:config->>name').eq('line_subject',own).order('updated_at',{ascending:false}).limit(8);
  if(error)throw Error('chat_design_projects');
  const projects:Choice[]=(data||[]).map((p:any)=>[(p.name||'未命名設計').slice(0,20),'project:'+p.id]);
  await reply(projects.length?{type:'flex',altText:'你的召喚法陣',contents:{type:'carousel',contents:Array.from({length:Math.ceil(projects.length/4)},(_,i)=>card('你的召喚法陣','選一個已保存的法陣，查看或修改對應的專案。',projects.slice(i*4,i*4+4)).contents)}}:card('還沒有已保存的法陣','從第一段吟唱開始，建立你的第一份設計。',[['從頭開始','new']],previous?.revision||''));return true;
 }
 if(choice?.startsWith('project:')){
  const id=choice.slice(8);
  if(!/^[0-9a-f-]{36}$/i.test(id))return true;
  const {data,error}=await r.db.from('line_oa_kit_designs').select('config').eq('id',id).eq('line_subject',own).maybeSingle();
  if(error)throw Error('chat_design_project_read');
  if(!data){await reply(text('找不到這份召喚法陣，請重新選擇已有專案。'));return true;}
  const d=validateDraft(data.config);
  const summary=[d.oaName,...d.cells.slice(0,d.grid).map(c=>c.label).filter(Boolean),d.secretary?.features].filter(Boolean).join('\n');
  await reply(card(d.name||'未命名設計',summary||'這份法陣還沒寫入功能，開啟設計後就能繼續。',[],'',[['修改設計',link(id,'design.html')],...(d.secretary?.direction==='records'?[]:[['開啟個人選單試用',link(id,'design.html')+'&preview=chat'] as Choice])]));
  return true;
 }
 if(choice==='resume'&&current){await reply(show(current.state,current.revision));return true;}
 if(choice==='new'&&current&&current.state.step!=='saved'){
  await reply(card('從頭開始？','重新吟唱會取代目前未完成的設計草稿。',[['確認從頭開始','restart'],['繼續設計','resume']],current.revision));return true;
 }
 const starting=choice==='new'||choice==='restart';
 if(choice==='new'&&(params.get('v')||'')!==(previous?.revision||'')){await reply(text('召喚入口已更新，請再次點選「打造我的 LINE OA」。'));return true;}
 if(choice!=='new'&&!current){if(choice)await reply(text('請再次點選「打造我的 LINE OA」開始。'));return Boolean(choice);}
 if(choice!=='new'&&choice&&params.get('v')!==current.revision){await reply(show(current.state,current.revision));return true;}
 if(choice==='open_name')return true;
 const state:State=starting?{id:crypto.randomUUID(),step:'intro',draft:emptyDraft(),index:0}:structuredClone(current.state);
 if(choice==='save'&&state.step==='review'){
  const {error}=await r.db.from('line_oa_kit_designs').upsert({id:state.id,line_subject:own,config:validateDraft(state.draft),revision:1},{onConflict:'id',ignoreDuplicates:true});
  if(error)throw Error('chat_design_save');
  state.step='saved';
 }else if(!starting&&!advance(state,typed?raw.replace(/^填寫\s+/,'').trim():choice||'',typed)){
  await reply(text(state.step==='demo'?'請補上日期、時間及行程名稱，例如「明天下午 3 點跟客戶開會」。':'這段吟唱還沒完成，請依目前卡片的提示選擇或填寫。'),show(current.state,current.revision));return true;
 }
 const revision=crypto.randomUUID(),next={revision,state,last_event:eventId,updated_at:new Date().toISOString()};
 const changed=previous?await r.db.from(table).update(next).eq('line_subject',own).eq('revision',previous.revision).select('revision').maybeSingle():await r.db.from(table).insert({line_subject:own,...next}).select('revision').single();
 if(changed.error&&changed.error.code!=='23505')throw Error('chat_design_write');
 if(changed.data){
  if(choice==='confirm'&&state.step==='saved')await reply(text('示範行程已確認。你可以繼續試用秘書的能力。'),show(state,revision));
  else await reply(show(state,revision));
 }
 return true;
}
