import {emptyDraft,validateDraft,themes,secretaryPortraits,type Cell,type Draft} from '../../../src/model.ts';
import {CENTER_LIFF,DESIGN_COMMAND,REVIEW_COMMAND} from '../../../src/center-menu.ts';
import {prints,type PrintKey} from '../../../src/backgrounds.ts';
import {menuPresets,recordPresets,responseFormats,recipients,destinations,type RecordRoute,type ResponseFormat} from '../../../src/design-catalog.ts';
import {interpretReviewEdit} from './review-edit.ts';

const directions={oa:'官方帳號卡片與按鈕',records:'個人／群組對話紀錄',both:'兩個方向都要'};
const conversations={personal:'個人私聊',group:'群組',both:'個人與群組'};
const actions={message:'傳送訊息',half:'半頁 App',full:'全頁 App',web:'開啟網頁'};
type Step='intro'|'direction'|'name'|'oaName'|'goal'|'grid'|'theme'|'pattern'|'purpose'|'menuDetail'|'menuTune'|'label'|'format'|'action'|'content'|'conversation'|'features'|'recordList'|'recordDetail'|'recordTune'|'recordFormat'|'recordRecipient'|'recordDestination'|'policy'|'review'|'saved'|'demo'|'demoConfirm'|'paidReview'|'paidMenu'|'paidConfirmed'|'paidAI'|'paidAIWorking';
type State={id:string;step:Step;draft:Draft;index:number;demo?:string;portrait?:string;record?:RecordRoute;projectRevision?:number;points?:{remaining:number;estimateMax:number|null}};
type Choice=[string,string,({inputOption:'openKeyboard';fillInText:string}|{colors:string[]})?];
const choices=(items:Record<string,string>):Choice[]=>Object.entries(items).map(([value,label])=>[label,value]);
const patternChoices:Choice[]=[['不加印花','none'],...prints.map(({name,key}):Choice=>[name,key])];
const text=(value:string)=>({type:'text',text:value});
const link=(id:string,page:string)=>CENTER_LIFF+'/'+page+'?project='+encodeURIComponent(id);
const sigil='https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/summoning-sigil.png';
function card(title:string,body:string,choices:Choice[]=[],revision='',links:Choice[]=[],columns=1){
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
   if(columns>1)return {type:'box',layout:'vertical',flex:1,height:'54px',justifyContent:'center',cornerRadius:'md',backgroundColor:'#E8EDE7',paddingAll:'6px',action,contents:[{type:'text',text:label,align:'center',size:'sm',weight:'bold',wrap:true,color:'#344B40'}]};
   return {type:'button',height:'sm',action:{...action,...options}};
  }),
  ...links.map(([label,uri])=>({type:'button',height:'sm',action:{type:'uri',label,uri}}))
 ];
 const footer=columns>1?Array.from({length:Math.ceil(buttons.length/columns)},(_,i)=>({type:'box',layout:'horizontal',spacing:'sm',contents:buttons.slice(i*columns,(i+1)*columns)})):buttons;
 return {type:'flex',altText:title,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',backgroundColor:'#FCFAFF',contents:[
  {type:'text',text:'APRICO · AI 宇宙召喚中心',size:'xs',color:'#52765F',weight:'bold'},
  {type:'image',url:sigil,position:'absolute',offsetTop:'0px',offsetEnd:'0px',size:'136px',aspectRatio:'1:1'},
  {type:'text',text:title,size:'lg',weight:'bold',wrap:true},
  {type:'text',text:body,size:'sm',wrap:true,color:'#344B40'}
 ]},...(buttons.length?{footer:{type:'box',layout:'vertical',spacing:'sm',backgroundColor:'#FCFAFF',contents:footer}}:{})}};
}
const fields:Partial<Record<Step,[string,string,number,string]>>={
 name:['專案名稱','為你的召喚法陣命名。這個專案名稱會幫你找回這份設計。',80,'輸入專案名稱'],
 oaName:['LINE OA 名稱','現在為秘書的服務入口命名。這是顧客會在 LINE 看到的官方帳號名稱。',80,'輸入 LINE OA 名稱'],
 goal:['你的主要設計目標是什麼？','用一兩句話說明想服務誰、最想改善什麼。例如「讓新顧客能從 LINE 預約，減少重複回答營業時間」。建置中心會依你的目標預填可編輯的服務文字。',500,'輸入設計目標'],
 label:['按鈕名稱','為這格符文取名。這就是使用者在選單上看到的按鈕名稱。',30,'輸入按鈕名稱'],
 content:['按鈕內容','寫下這格符文要觸發的內容。依你剛選的動作，填寫訊息、App 功能說明或 HTTPS 連結。',500,'輸入按鈕內容'],
 features:['想整理哪些紀錄？','告訴秘書要替你收錄哪些日常片段，例如行程、支出、目標或待辦。也可以寫下圖片辨識或定時摘要的需求。',500,'輸入想整理的紀錄'],
 menuTune:['微調這格功能','輸入希望調整的內容，例如「先顯示這週行程」。若是互動卡片，先寫正文，每個連結按鈕另起一行，例如「按鈕：查看服務|https://example.com」，最多三個。',500,'輸入微調內容'],
 recordTune:['微調紀錄規則','例如只接受有標記的訊息、摘要的時間或紀錄需要包含哪些欄位。',500,'輸入微調規則'],
 policy:['何時整理、由誰確認？','為記憶符文訂下規則。例如只整理標記給秘書的訊息，由指定成員確認後存檔，保留 30 天。啟用群組紀錄前，請先取得成員同意。',500,'輸入整理與確認規則'],
 demo:['試一句給秘書','用一句日常指令試試秘書的行程能力，例如「明天下午 3 點跟客戶開會」。',160,'輸入試用訊息']
};
function show(s:State,v:string){
 if(s.projectRevision!==undefined)v='p.'+v;
 const field=fields[s.step];
 if(field){
  const [title,hint,,label]=field;
  const prefix=['label','content'].includes(s.step)?'第 '+(s.index+1)+' 格 · ':'';
  const command=s.projectRevision===undefined?'填寫':'填寫建置';
  return card(prefix+title,hint+'\n點下方按鈕即可輸入。',[[label,'open_name',{inputOption:'openKeyboard',fillInText:command+' '}]],v);
 }
 const cell=s.draft.cells[s.index],preset=menuPresets.find(p=>p.id===cell.preset);
 const record=recordPresets.find(p=>p.id===s.record?.id);
 switch(s.step){
  case 'intro':return card('第 1 步 · 喚醒你的 AI 生活秘書','你的秘書將在 LINE 裡整理散落的資訊和待辦，減少生活雜訊與來回溝通。準備好了，就開始第一段吟唱。',[['開始吟唱','next']],v);
  case 'direction':return card('第 2 步 · 選擇秘書的能力','選擇要賦予秘書哪一種能力。它可以用官方帳號的卡片與按鈕做紀錄、聯絡接洽或傳遞資訊，也能整理個人或群組對話。',choices(directions),v);
  case 'grid':return card('召喚法陣 · 選單格數','每一格符文都是一個功能入口。選擇聊天室要顯示幾格。',[['4 格','4'],['6 格','6'],['8 格','8']],v);
  case 'theme':return {type:'flex',altText:'選擇選單配色',contents:{type:'carousel',contents:[0,4].map(start=>card('選擇選單配色','色塊就是圖文選單會用的配色。點整列選取，左右滑動查看其他主題。',themes.slice(start,start+4).map((theme,i)=>[theme.name,String(start+i),{colors:theme.colors}]),v).contents)}};
  case 'pattern':return {type:'flex',altText:'選擇選單印花',contents:{type:'carousel',contents:[0,3,6].map(start=>card('選擇選單印花','為召喚法陣加上底紋。左右滑動可查看其他印花，也可以保留純色。',patternChoices.slice(start,start+3),v).contents)}};
  case 'purpose':return {type:'flex',altText:'選擇第 '+(s.index+1)+' 格的功能模板',contents:{type:'carousel',contents:[
   card('第 '+(s.index+1)+' 格 · 功能模板','點選方格查看功能。往左滑可展開其他模板與自行設計。',menuPresets.slice(0,8).map(p=>[p.label,p.id]),v,[],2).contents,
   card('其他模板 · 卷軸','展開其他秘書能力，也可以自己設計。',[...menuPresets.slice(8).map((p):Choice=>[p.label,p.id]),['自行設計','custom']],v).contents
  ]}};
  case 'menuDetail':return card(preset!.label,(cell.presetNotes||preset!.detail)+(preset!.id==='games'?'\n預設連到 Aprico 小遊戲專區。':''),[['微調功能','tune'],['確認功能','confirm'],['重選模板','back']],v);
  case 'format':return card('選擇回應方式','「'+cell.label+'」要用什麼方式回應？',(preset?.formats??['card','web','text']).map((f:ResponseFormat)=>[responseFormats[f],f]),v);
  case 'action':return card('第 '+(s.index+1)+' 格 · 點擊後的動作','選擇使用者點下「'+cell.label+'」後的反應。',choices(cell.responseFormat==='web'?{half:actions.half,full:actions.full,web:actions.web}:actions),v);
  case 'conversation':return card('記憶符文 · 對話紀錄範圍','選擇秘書未來要在哪裡協助整理對話。',choices(conversations),v);
  case 'recordList':{
   const picked=s.draft.secretary!.routes??[];
   return card('選擇秘書的對話能力','可加入多項功能。已選 '+(picked.map(p=>recordPresets.find(r=>r.id===p.id)?.label).join('、')||'無')+'。',[
    ...recordPresets.map((p):Choice=>[p.label,p.id]),...(picked.length?[['完成選擇','finish'] as Choice]:[])
   ],v,[],2);
  }
  case 'recordDetail':return card(record!.label,s.record!.notes||record!.detail,[['微調規則','tune'],['確認功能','confirm'],['回到選單','back'],...(s.draft.secretary!.routes?.some(r=>r.id===s.record!.id)?[['移除此功能','remove'] as Choice]:[])],v);
  case 'recordFormat':return card(record!.label+' · 回應方式','確認這個功能要用哪一種方式回應。',choices(responseFormats),v);
  case 'recordRecipient':return card(record!.label+' · 回覆給誰？','選擇秘書應把整理結果送到哪裡。',choices(s.record!.id==='life'?{private:recipients.private,dashboard:recipients.dashboard}:recipients),v);
  case 'recordDestination':return card(record!.label+' · 資料存在哪裡？','要留存時，先確認後再存入你授權的專案。',choices(s.record!.id==='calendar'?destinations:{database:destinations.database,none:destinations.none}),v);
  case 'review':return card('核對召喚法陣',[s.draft.name+' · '+s.draft.oaName,s.draft.goal,directions[s.draft.secretary!.direction],...(s.draft.secretary!.direction!=='records'?[
   themes[s.draft.theme].name+' · '+(prints.find(p=>p.key===s.draft.pattern)?.name||'不加印花'),
   ...s.draft.cells.slice(0,s.draft.grid).map(c=>c.label+' · '+(c.responseFormat?responseFormats[c.responseFormat]:actions[c.action]))
  ]:[]),s.draft.secretary!.features,...(s.draft.secretary!.routes??[]).map(r=>recordPresets.find(p=>p.id===r.id)!.label+' → '+recipients[r.recipient]+' → '+destinations[r.destination]),s.draft.secretary!.policy].filter(Boolean).join('\n'),[['保存這份設計','save']],v);
  case 'saved':{
   const options:Choice[]=s.portrait?[]:[['召喚秘書','summon']];
   if(s.draft.secretary!.direction!=='oa')options.push(['試用秘書回覆','demo']);
   const links:Choice[]=[];
   if(s.portrait)links.push(['給他裝備,帶她/他回家',link(s.id,'build.html')]);
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
  case 'paidReview':return card('確認這版設計','核對上方的示意圖與流程。按鈕式微調與預覽免扣點。確認後，前往建置中心完成授權與執行。'+(s.points?'\n剩餘 '+s.points.remaining+' 點。正式建置最多預留 '+(s.points.estimateMax??'尚未設定')+' 點。':''),[
   ...(s.draft.secretary?.direction==='records'?[]:[['修改設計','menu'] as Choice]),
   ...(s.draft.secretary?.direction==='oa'||!s.draft.secretary?[]:[['修改秘書流程','records'] as Choice]),
   ...(s.points?.estimateMax?[['用 AI 解讀修改','ai'] as Choice]:[]),
   ['確認這版並前往建置','approve']
  ],v);
  case 'paidMenu':return card('修改選單設計','選一格重新設定，也可以修改配色與印花。',[
   ...s.draft.cells.slice(0,s.draft.grid).map((c,i):Choice=>[(i+1)+' · '+(c.label||'未命名').slice(0,14),'cell:'+i]),
   ['修改配色與印花','theme'],['回到確認','back']
  ],v,[],2);
  case 'paidConfirmed':return card('這版設計已確認','在建置中心確認授權與部署目標後，就可以開始建置。',[['再看這版設計','reopen']],v,[['前往建置中心',link(s.id,'build.html')]]);
  case 'paidAI':return card('用 AI 解讀修改','每次輸入可修改一格回應方式，或一項秘書流程。最多預留 '+Math.round((s.points?.estimateMax??0)/0.05*0.01*1e6)/1e6+' 點，依實際用量扣點。\n例如「卜卦改用文字回應」。',[
   ['輸入修改需求','open_name',{inputOption:'openKeyboard',fillInText:'AI 修改 '+v.slice(2)+' '}],['返回','back']
  ],v);
  case 'paidAIWorking':return card('正在理解你的修改','完成後會重新顯示示意與流程。');
 }
 throw Error('unknown_design_step');
}

function advance(s:State,value:string,typed:boolean):boolean{
 const field=fields[s.step];
 if(field&&(!typed||!value||value.length>field[2]))return false;
 if(!field&&typed)return false;
 const d=s.draft,cell=d.cells[s.index];
 const nextCell=()=>{
  if(s.projectRevision!==undefined){s.step='paidReview';return;}
  if(s.index+1<d.grid){s.index++;s.step='purpose';}else s.step=d.secretary!.direction==='both'?'conversation':'review';
 };
 switch(s.step){
  case 'intro':if(value!=='next')return false;s.step='direction';break;
  case 'direction':if(!Object.hasOwn(directions,value))return false;d.secretary={direction:value as NonNullable<Draft['secretary']>['direction']};s.step='name';break;
  case 'name':d.name=value;s.step='oaName';break;
  case 'oaName':d.oaName=value;s.step='goal';break;
  case 'goal':d.goal=value;s.step=d.secretary!.direction==='records'?'conversation':'grid';break;
  case 'grid':if(!['4','6','8'].includes(value))return false;d.grid=Number(value) as Draft['grid'];s.step='theme';break;
  case 'theme':if(!/^[0-7]$/.test(value))return false;d.theme=Number(value);s.step='pattern';break;
  case 'pattern':if(!patternChoices.some(([,key])=>key===value))return false;d.pattern=value as PrintKey;s.step=s.projectRevision===undefined?'purpose':'paidReview';break;
  case 'purpose':{
   const preset=menuPresets.find(p=>p.id===value);
   if(!preset&&value!=='custom')return false;
   if(value==='games'&&d.cells.slice(0,d.grid).some((c,i)=>i!==s.index&&c.preset==='games'))return false;
   d.cells[s.index]={label:preset?.label||'',content:preset?.detail||'',action:'message',template:preset?.id==='health'?'health':'custom',...(preset?{preset:preset.id}:{})};
   d.secretary??={direction:'oa'};
   const purposes=d.secretary.menuPurposes??=Array.from({length:d.grid},()=>'');
   while(purposes.length<=s.index)purposes.push('');
   purposes[s.index]=preset?.label||'自行設計';
   s.step=preset?'menuDetail':'label';break;
  }
  case 'menuDetail':
   if(!['tune','confirm','back'].includes(value))return false;
   s.step=value==='tune'?'menuTune':value==='confirm'?'format':'purpose';break;
  case 'menuTune':cell.content=value;cell.presetNotes=value;s.step='menuDetail';break;
  case 'label':cell.label=value;s.step='format';break;
  case 'format':{
   const preset=menuPresets.find(p=>p.id===cell.preset);
   if(!Object.hasOwn(responseFormats,value)||(preset&&!preset.formats.includes(value as ResponseFormat)))return false;
   cell.responseFormat=value as ResponseFormat;
   cell.action=value==='web'?(preset?.id==='games'?'web':'full'):'message';
   if(preset?.id==='games')cell.content=CENTER_LIFF+'/games.html';
   if(!preset){s.step=value==='web'?'action':'content';break;}
   nextCell();
   break;
  }
  case 'action':if(!Object.hasOwn(actions,value)||(cell.responseFormat==='web'&&value==='message'))return false;cell.action=value as Cell['action'];s.step='content';break;
  case 'content':
   if(cell.action==='web'){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return false;}catch{return false;}}
   cell.content=value;
   nextCell();
   break;
  case 'conversation':
   if(!Object.hasOwn(conversations,value))return false;
   d.secretary!.conversation=value as NonNullable<Draft['secretary']>['conversation'];
   s.step='recordList';break;
  case 'features':d.secretary!.features=value;s.step='policy';break;
  case 'recordList':{
   const routes=d.secretary!.routes??[];
   if(value==='finish'&&routes.length){s.step='policy';break;}
   const record=recordPresets.find(p=>p.id===value);if(!record)return false;
   s.record=routes.find(r=>r.id===record.id)??{id:record.id,notes:'',format:'card',recipient:'private',destination:'database'};
   s.step='recordDetail';break;
  }
  case 'recordDetail':
   if(!['tune','confirm','back','remove'].includes(value))return false;
   if(value==='remove')d.secretary!.routes=d.secretary!.routes?.filter(r=>r.id!==s.record!.id);
   s.step=value==='tune'?'recordTune':value==='confirm'?'recordFormat':'recordList';break;
  case 'recordTune':s.record!.notes=value;s.step='recordDetail';break;
  case 'recordFormat':if(!Object.hasOwn(responseFormats,value))return false;s.record!.format=value as ResponseFormat;s.step='recordRecipient';break;
  case 'recordRecipient':if(!Object.hasOwn(recipients,value)||(s.record!.id==='life'&&value==='chat'))return false;s.record!.recipient=value as RecordRoute['recipient'];s.step='recordDestination';break;
  case 'recordDestination':
   if(!Object.hasOwn(destinations,value)||(value==='calendar'&&s.record!.id!=='calendar'))return false;
   s.record!.destination=value as RecordRoute['destination'];
   d.secretary!.routes=[...(d.secretary!.routes??[]).filter(r=>r.id!==s.record!.id),s.record!];delete s.record;s.step='recordList';break;
  case 'policy':d.secretary!.policy=value;s.step=s.projectRevision===undefined?'review':'paidReview';break;
  case 'paidReview':
   if(value==='menu'&&d.secretary?.direction!=='records'){s.step='paidMenu';break;}
   if(value==='records'&&d.secretary&&d.secretary.direction!=='oa'){s.step='conversation';break;}
   if(value==='ai'&&s.points?.estimateMax){s.step='paidAI';break;}
   return false;
  case 'paidMenu':
   if(value==='theme'){s.step='theme';break;}
   if(value==='back'){s.step='paidReview';break;}
   if(!/^cell:[0-7]$/.test(value)||Number(value.at(-1))>=d.grid)return false;
   s.index=Number(value.at(-1));s.step='purpose';break;
  case 'paidConfirmed':if(value!=='reopen')return false;s.step='paidReview';break;
  case 'paidAI':if(value!=='back')return false;s.step='paidReview';break;
  case 'saved':
   if(value==='summon'){s.portrait??=d.portrait??(Math.random()<0.5?'male':'female');break;}
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

function paidCards(s:State,v:string){
 const d=s.draft;
 const messages:any[]=[];
 if(d.secretary?.direction!=='records'){
  const palette=themes[d.theme];
  const cells=d.cells.slice(0,d.grid);
  const columns=d.grid===6?3:d.grid===8?4:2;
  const rows=Array.from({length:d.grid/columns},(_,r)=>({type:'box',layout:'horizontal',spacing:'xs',contents:cells.slice(r*columns,(r+1)*columns).map((c,i)=>({
   type:'box',layout:'vertical',paddingAll:'5px',height:'46px',justifyContent:'center',cornerRadius:'sm',backgroundColor:palette.colors[(r*columns+i)%palette.colors.length],
   contents:[{type:'text',text:c.label||'未命名',size:'xs',align:'center',wrap:true,color:'#203A2A'}]
  }))}));
  const preview=card('我的 LINE OA 示意圖',palette.name+' · '+(prints.find(p=>p.key===d.pattern)?.name||(d.pattern==='image'?'上傳背景':'不加印花'))+' · '+d.grid+' 格');
  messages.push({...preview,contents:{...preview.contents,footer:{type:'box',layout:'vertical',paddingAll:'15px',backgroundColor:'#EDF1EA',spacing:'sm',contents:[
   {type:'text',text:d.oaName||'LINE 官方帳號',weight:'bold',align:'center',wrap:true,color:'#203A2A'},
   {type:'text',text:'你好！請從下方選擇服務。',size:'xs',align:'center',color:'#52765F',margin:'lg'},
   ...rows,
   {type:'text',text:'聊天室與選單配置示意',size:'xxs',align:'center',color:'#52765F'}
  ]}}});
  messages.push({type:'flex',altText:'每格回應範例',contents:{type:'carousel',contents:cells.map((c,i)=>{
   const format=c.responseFormat?responseFormats[c.responseFormat]:actions[c.action];
   return card('第 '+(i+1)+' 格 · '+(c.label||'未命名'),format+'\n'+(c.presetNotes||c.content||'尚未填寫回應內容').slice(0,300)).contents;
  })}});
 }
 if(d.secretary&&d.secretary.direction!=='oa'){
  const routes=d.secretary.routes??[];
  const source=d.secretary.conversation==='group'?'已授權群組內標記秘書的訊息':d.secretary.conversation==='both'?'私聊或已授權群組內標記秘書的訊息':'私聊訊息';
  messages.push({type:'flex',altText:'我的 AI 秘書流程圖',contents:{type:'carousel',contents:routes.length?routes.map(r=>card(
   '流程 · '+recordPresets.find(p=>p.id===r.id)!.label,
   (r.id==='life'?'私人訊息':source)+'\n↓\n秘書整理'+(r.notes?' · '+r.notes.slice(0,100):'')+'\n↓\n'+responseFormats[r.format]+'送至'+recipients[r.recipient]+(r.destination==='none'?'':'\n↓\n確認後存入'+destinations[r.destination])
  ).contents):[card('我的 AI 秘書流程圖',[source,'↓',d.secretary.features||'尚未選擇對話能力',d.secretary.policy||'請確認回覆與資料去向'].join('\n')).contents]}});
 }
 return [...messages,show(s,v)];
}

export async function chatDesignGateway(event:any,r:{authenticated:boolean;db:any;aiKey?:string;reply:(token:string,messages:any[])=>Promise<unknown>}){
 if(!r.authenticated||event.source?.type!=='user'||!/^U[0-9a-f]{32}$/.test(event.source.userId||'')||!event.replyToken)return false;
 const raw=event.type==='message'&&event.message?.type==='text'?event.message.text.trim():'';
 const params=new URLSearchParams(event.type==='postback'?event.postback?.data||'':'');
 const choice=params.get('aprico_design'),paidInput=/^填寫建置\s/.test(raw),typed=paidInput||/^填寫\s/.test(raw);
 const reviewRequest=params.get('aprico_review')||(raw.startsWith(REVIEW_COMMAND+' ')?raw.slice(REVIEW_COMMAND.length+1):'');
 const aiInput=raw.match(/^AI 修改 ([0-9a-f-]{36}) ([\s\S]{1,500})$/);
 const paid=Boolean(reviewRequest||paidInput||aiInput||choice&&params.get('v')?.startsWith('p.'));
 const requestedRevision=params.get('v')?.replace(/^p\./,'');
 if(raw!==DESIGN_COMMAND&&!reviewRequest&&!choice&&!typed&&!aiInput)return false;
 const own=event.source.userId,eventId=event.webhookEventId;
 if(typeof eventId!=='string'||!/^[\w-]{10,100}$/.test(eventId))return true;
 const reply=(...messages:any[])=>r.reply(event.replyToken,messages);
 const table=paid?'line_oa_kit_chat_review_sessions':'line_oa_kit_chat_design_sessions';
 const read=await r.db.from(table).select('revision,state,last_event,updated_at').eq('line_subject',own).maybeSingle();
 if(read.error)throw Error('chat_design_read');
 const previous=read.data;
 if(previous?.last_event===eventId)return true;
 const current=previous;
 const readPoints=async(id:string)=>{
  if(!r.aiKey)return undefined;
  const {data,error}=await r.db.rpc('line_oa_kit_points_status',{p_project:id,p_subject:own});
  if(error)throw Error('chat_review_points');
  return data??undefined;
 };
 if(reviewRequest){
  if(!/^[0-9a-f-]{36}$/i.test(reviewRequest))return true;
  const [project,access]=await Promise.all([
   r.db.from('line_oa_kit_designs').select('id,config,revision,confirmed_revision').eq('id',reviewRequest).eq('line_subject',own).maybeSingle(),
   r.db.from('line_oa_kit_build_access').select('grant_method').eq('project_id',reviewRequest).eq('line_subject',own).maybeSingle()
  ]);
  if(project.error||access.error)throw Error('chat_review_read');
  if(!project.data||access.data?.grant_method!=='line_pay'){await reply(text('找不到此帳號已付款的專案。請回建置中心核對付款。'));return true;}
  const p=project.data;
  const isStalled=current?.state.step==='paidAIWorking'&&Date.now()-Date.parse(current.updated_at)>120000;
  if(current?.state.id===p.id&&current.state.projectRevision===p.revision&&!isStalled){
   await reply(...(current.state.step==='paidReview'?paidCards(current.state,current.revision):[show(current.state,current.revision)]));return true;
  }
  const state:State={id:p.id,projectRevision:p.revision,step:p.confirmed_revision===p.revision?'paidConfirmed':'paidReview',draft:isStalled&&current.state.id===p.id&&current.state.projectRevision===p.revision?validateDraft(current.state.draft):validateDraft(p.config),index:0,points:await readPoints(p.id)};
  const revision=crypto.randomUUID(),next={revision,state,last_event:eventId,updated_at:new Date().toISOString()};
  const written=current?await r.db.from(table).update(next).eq('line_subject',own).eq('revision',current.revision).select('revision').maybeSingle():await r.db.from(table).insert({line_subject:own,...next}).select('revision').single();
  if(written.error&&written.error.code!=='23505')throw Error('chat_review_write');
  if(written.data)await reply(...(state.step==='paidReview'?paidCards(state,revision):[show(state,revision)]));
  return true;
 }
 if(aiInput){
  if(!r.aiKey||!current||current.state.step!=='paidAI'||current.revision!==aiInput[1]){
   await reply(text('請從最新版的核對卡開啟 AI 修改。'));return true;
  }
  const state:State=structuredClone(current.state);
  state.step='paidAIWorking';
  const claim=crypto.randomUUID();
  const held=await r.db.from(table).update({state,revision:claim,last_event:eventId,updated_at:new Date().toISOString()}).eq('line_subject',own).eq('revision',current.revision).select('revision').maybeSingle();
  if(held.error)throw Error('chat_review_claim');
  if(!held.data)return true;
  let feedback='已更新建置稿，請重新核對。';
  try{
   state.draft=await interpretReviewEdit(r.db,r.aiKey,'review:'+eventId,state.id,own,state.draft,aiInput[2].trim());
  }catch(e){
   feedback=e instanceof Error&&e.message==='points_insufficient'?'可用點數不足。你仍可使用按鈕修改。':'這次沒有套用修改。可用按鈕微調，或描述要改的單一功能。';
  }
  state.step='paidReview';
  state.points=await readPoints(state.id).catch(()=>undefined);
  const revision=crypto.randomUUID();
  const done=await r.db.from(table).update({state,revision,updated_at:new Date().toISOString()}).eq('line_subject',own).eq('revision',claim).select('revision').maybeSingle();
  if(done.error)throw Error('chat_review_edit');
  if(done.data)await reply(text(feedback),...paidCards(state,revision));
  return true;
 }
 if(paid&&['new','restart','projects','save'].includes(choice||''))return true;
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
  const projectCard=card(d.name||'未命名設計',summary||'這份法陣還沒寫入功能，開啟設計後就能繼續。',[],'',[['修改設計',link(id,'design.html')],...(d.secretary?.direction==='records'?[]:[['開啟個人選單試用',link(id,'design.html')+'&preview=chat'] as Choice])]);
  await reply(d.portrait?{...projectCard,contents:{...projectCard.contents,hero:{type:'image',url:'https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/secretaries/summon-'+d.portrait+'.jpg',size:'full',aspectRatio:'3:4',aspectMode:'fit'}}}:projectCard);
  return true;
 }
 if(choice==='resume'&&current){await reply(show(current.state,current.revision));return true;}
 if(choice==='new'&&current&&current.state.step!=='saved'){
  await reply(card('從頭開始？','重新吟唱會取代目前未完成的設計草稿。',[['確認從頭開始','restart'],['繼續設計','resume']],current.revision));return true;
 }
 const starting=choice==='new'||choice==='restart';
 if(choice==='new'&&(params.get('v')||'')!==(previous?.revision||'')){await reply(text('召喚入口已更新，請再次點選「打造我的 LINE OA」。'));return true;}
 if(choice!=='new'&&!current){if(choice)await reply(text('請再次點選「打造我的 LINE OA」開始。'));return Boolean(choice);}
 if(choice!=='new'&&choice&&requestedRevision!==current.revision){await reply(...(paid&&current.state.step==='paidReview'?paidCards(current.state,current.revision):[show(current.state,current.revision)]));return true;}
 if(choice==='open_name')return true;
 const state:State=starting?{id:crypto.randomUUID(),step:'intro',draft:emptyDraft(),index:0}:structuredClone(current.state);
 if(paid&&choice==='approve'&&state.step==='paidReview'){
  const revision=crypto.randomUUID();
  const {data,error}=await r.db.rpc('line_oa_kit_confirm_chat_design',{p_subject:own,p_session:current.revision,p_next_session:revision,p_event:eventId,p_config:validateDraft(state.draft)});
  if(error)throw Error('chat_review_confirm');
  if(!data){await reply(text('設計版本已更新。請從建置中心重新開啟核對卡。'));return true;}
  state.step='paidConfirmed';await reply(show(state,revision));return true;
 }
 if(choice==='save'&&state.step==='review'){
  state.draft.portrait??=secretaryPortraits[Math.floor(Math.random()*secretaryPortraits.length)];
  const {error}=await r.db.from('line_oa_kit_designs').upsert({id:state.id,line_subject:own,config:validateDraft(state.draft),revision:1},{onConflict:'id',ignoreDuplicates:true});
  if(error)throw Error('chat_design_save');
  state.step='saved';
 }else if(!starting&&!advance(state,typed?raw.replace(/^填寫(?:建置)?\s+/,'').trim():choice||'',typed)){
  await reply(text(state.step==='demo'?'請補上日期、時間及行程名稱，例如「明天下午 3 點跟客戶開會」。':'這段吟唱還沒完成，請依目前卡片的提示選擇或填寫。'),show(current.state,current.revision));return true;
 }
 const revision=crypto.randomUUID(),next={revision,state,last_event:eventId,updated_at:new Date().toISOString()};
 const changed=previous?await r.db.from(table).update(next).eq('line_subject',own).eq('revision',previous.revision).select('revision').maybeSingle():await r.db.from(table).insert({line_subject:own,...next}).select('revision').single();
 if(changed.error&&changed.error.code!=='23505')throw Error('chat_design_write');
 if(changed.data){
  if(choice==='confirm'&&state.step==='saved')await reply(text('示範行程已確認。你可以繼續試用秘書的能力。'),show(state,revision));
  else await reply(...(state.step==='paidReview'?paidCards(state,revision):[show(state,revision)]));
 }
 return true;
}

export async function pushReviewNotice(token:string,owner:string,projectId:string,orderId:string,fetcher:typeof fetch=fetch){
 if(!token)return;
 const notice=card('付款已確認 · 查看建置設計','先核對 LINE OA 示意圖與 AI 秘書流程，有需要可在聊天室微調。');
 const message={...notice,contents:{...notice.contents,footer:{type:'box',layout:'vertical',contents:[{
  type:'button',height:'sm',action:{type:'postback',label:'查看建置設計',data:new URLSearchParams({aprico_review:projectId}).toString()}
 }]}}};
 const response=await fetcher('https://api.line.me/v2/bot/message/push',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Line-Retry-Key':orderId},
  redirect:'error',signal:AbortSignal.timeout(8000),body:JSON.stringify({to:owner,messages:[message]})
 });
 if(!response.ok&&response.status!==409)throw Error('review_notice_failed');
}
