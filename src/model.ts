import {prints,type PrintKey} from './backgrounds.ts';
import {backgroundBytes} from './image-format.ts';
export const themes=[
 {name:'森林鼠尾草',colors:['#BDD0BE','#DDD5BC','#B9CCCF','#D4C2B8']},
 {name:'奶油咖啡',colors:['#DDD0B8','#C7B29E','#EBE1CE','#BFC2AF']},
 {name:'霧藍海岸',colors:['#B5CAD4','#CCDADC','#CEC9BD','#A7BABE']},
 {name:'乾燥玫瑰',colors:['#D7B8B7','#E2CCCC','#C7B7C5','#D8CDBC']},
 {name:'薰衣草灰',colors:['#C9C1D6','#DCD5E4','#BEC9D0','#D3C6C2']},
 {name:'杏桃暖陽',colors:['#E7C5A8','#E8D6B6','#D6C4B9','#C9D0B4']},
 {name:'深藍青綠',colors:['#A8BDCC','#A9C9C5','#C0D4D0','#D4D3C4']},
 {name:'黑白極簡',colors:['#C3C6C5','#DCDDD9','#B7BDBA','#E7E5DE']}
];
export type Cell={label:string;action:'message'|'half'|'full'|'web';template:'custom'|'scratch'|'health';content:string};
export type Draft={name:string;oaName:string;grid:4|6|8;theme:number;pattern:PrintKey;backgroundImage:string;cells:Cell[]};
export function emptyDraft():Draft{return {name:'',oaName:'',grid:4,theme:0,pattern:'none',backgroundImage:'',cells:Array.from({length:8},()=>({label:'',action:'message',template:'custom',content:''}))};}
export function validateDraft(value:unknown):Draft{
 if(!value||typeof value!=='object')throw Error('設定格式不正確');const v=value as Draft;
 const str=(s:unknown,max:number)=>{if(typeof s!=='string'||s.length>max)throw Error('欄位格式或長度不正確');return s;};
 if(![4,6,8].includes(v.grid)||!Number.isInteger(v.theme)||v.theme<0||v.theme>=themes.length||!Array.isArray(v.cells)||v.cells.length!==8)throw Error('選單設定不正確');
 const pattern=v.pattern??'none',backgroundImage=v.backgroundImage??'';
 if(!['none','image',...prints.map(p=>p.key)].includes(pattern))throw Error('印花設定不正確');
 if(backgroundImage)backgroundBytes(backgroundImage);else if(backgroundImage!==''||pattern==='image')throw Error('請先上傳背景圖片');
 return {name:str(v.name,80),oaName:str(v.oaName,80),grid:v.grid,theme:v.theme,pattern,backgroundImage,cells:v.cells.map(c=>{if(!c||!['message','half','full','web'].includes(c.action)||!['custom','scratch','health'].includes(c.template))throw Error('格子設定不正確');return{label:str(c.label,30),action:c.action,template:c.template,content:str(c.content,2000)};})};
}
export const actionNames={message:'聊天訊息',half:'半頁 App',full:'全頁 App',web:'跳轉網頁'};
