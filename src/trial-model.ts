import {validateDraft,type Draft} from './model.ts';
import {jpegSize} from './image-format.ts';
export const TRIAL_SIZE={width:1200,height:810,header:56,footer:74};
export const TRIAL_LIFF='https://liff.line.me/2012197506-Vmb4O5iT';
export const TRIAL_CHAT='https://line.me/R/ti/p/%40228srwlt';
export function trialAreas(value:unknown){const draft=validateDraft(value),columns=draft.grid===6?3:2,rows=draft.grid/columns;return draft.cells.slice(0,draft.grid).map((c,i)=>({index:i,cell:c,bounds:{x:i%columns*(1200/columns),y:56+Math.floor(i/columns)*(680/rows),width:1200/columns,height:680/rows}}));}
export function trialMenu(value:unknown,operation:string,chatReplies=false){
 const d=validateDraft(value);if(!/^[a-f0-9-]{36}$/i.test(operation))throw Error('trial_invalid_operation');
 return{size:{width:1200,height:810},selected:true,name:'Aprico personal trial '+operation,chatBarText:'個人設計試用',areas:[...trialAreas(d).map(({index,cell,bounds})=>({bounds,action:chatReplies&&cell.action==='message'?{type:'postback',label:(cell.label||`功能 ${index+1}`).slice(0,20),displayText:(cell.label||`功能 ${index+1}`).slice(0,100),data:`aprico_trial=cell&v=${operation}&i=${index}`}:{type:'uri',label:(cell.label||`功能 ${index+1}`).slice(0,20),uri:`${TRIAL_LIFF}/trial.html?cell=${index}&v=${operation}`}})),{bounds:{x:0,y:736,width:1200,height:74},action:{type:'uri',label:'返回建置中心',uri:`${TRIAL_LIFF}/trial.html?action=exit`}}]};
}
export function trialNotice(c:Draft['cells'][number]){return c.template==='health'?'展示模式：健康檢測需要加購、AI 與部署設定；不拍照分析、不產生健康數據。':c.template==='scratch'?'展示模式：刮刮樂需加購；本次不發放真實獎品。':'個人試用展示；自訂 App 的正式功能仍需完成建置與部署。';}
export function trialText(value:unknown,index:number,reveal=false){const d=validateDraft(value),c=d.cells[index];if(!Number.isInteger(index)||index<0||index>=d.grid)throw Error('trial_invalid_cell');
 if(c.template==='health')return `${c.label||'健康檢測'}\n${trialNotice(c)}`;
 if(c.template==='scratch')return reveal?`${c.content.split('\n').find(s=>s.trim())||'示範獎項'}\n\n${trialNotice(c)}`:`${c.label||'刮刮樂'}\n${trialNotice(c)}`;
 return `${d.oaName||'我的品牌'}｜個人試用\n${c.content||'尚未填寫這格的內容，請返回設計頁設定。'}`.slice(0,4900);
}
export function safeTrialExternal(text:string){const m=text.match(/https:\/\/[^\s<>"']+/);if(!m)return '';try{const u=new URL(m[0]);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function decodeMenuImage(value:unknown){if(typeof value!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length>1200000)throw Error('trial_invalid_image');const bytes=Uint8Array.from(atob(value.split(',')[1]),c=>c.charCodeAt(0));if(bytes.length<33||bytes.length>900000)throw Error('trial_invalid_image');if(value.startsWith('data:image/jpeg;')){let size;try{size=jpegSize(bytes);}catch{throw Error('trial_invalid_image');}if(size.width!==1200||size.height!==810)throw Error('trial_invalid_image');return bytes;}if(![137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw Error('trial_invalid_image');const view=new DataView(bytes.buffer);if(view.getUint32(16)!==1200||view.getUint32(20)!==810)throw Error('trial_invalid_image');return bytes;}
