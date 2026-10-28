import {trialText,trialNotice,TRIAL_LIFF} from '../../../src/trial-model.ts';
export function trialReplyMessages(trial:any,event:any){
 const text=(s:string)=>[{type:'text',text:s.slice(0,4900)}];
 if(!trial?.active)return text(`歡迎使用 Aprico！請開啟設計頁保存你的個人試用。\n${TRIAL_LIFF}/design.html`);
 const params=new URLSearchParams(event.postback?.data||'');
 if(params.get('v')!==trial.version)return text('這是舊版試用按鈕，請使用目前下方選單，或重新保存並試用。');
 const index=Number(params.get('i'));if(!/^\d$/.test(params.get('i')||'')||!Number.isInteger(index)||index>=trial.config.grid)return text('找不到這個試用功能，請重新保存設計。');
 const cell=trial.config.cells[index],action=params.get('aprico_trial');
 if(!['cell','reveal'].includes(action||''))return text('請點下方選單試用功能。');
 if(cell.template==='scratch'&&action!=='reveal')return[{type:'template',altText:'刮刮樂展示，點選揭曉示範獎項',template:{type:'buttons',title:(cell.label||'刮刮樂展示').slice(0,40),text:trialNotice(cell),actions:[{type:'postback',label:'揭曉示範獎項',data:`aprico_trial=reveal&v=${trial.version}&i=${index}`} ]}}];
 return text(trialText(trial.config,index,action==='reveal'));
}
