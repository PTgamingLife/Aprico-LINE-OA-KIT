export const prints=[
 {key:'linen',name:'亞麻織紋',drawing:'<path d="M0 8H48M0 24H48M0 40H48M8 0V48M24 0V48M40 0V48" opacity=".10"/><path d="M0 10H48M0 26H48M0 42H48M10 0V48M26 0V48M42 0V48" opacity=".05"/>'},
 {key:'dots',name:'細緻圓點',drawing:'<g fill="#294337" stroke="none" opacity=".15"><circle cx="12" cy="12" r="1.7"/><circle cx="36" cy="36" r="1.7"/></g>'},
 {key:'stripes',name:'斜線光影',drawing:'<path d="M-12 12L12-12M0 48L48 0M36 60L60 36M-12 36L36-12M12 60L60 12" opacity=".13"/>'},
 {key:'plaid',name:'法式方格',drawing:'<path d="M0 12H48M12 0V48" stroke-width="2" opacity=".11"/><path d="M0 16H48M16 0V48" opacity=".08"/>'},
 {key:'arches',name:'復古拱門',drawing:'<g opacity=".14"><path d="M2 46V26a22 22 0 0 1 44 0v20M10 46V26a14 14 0 0 1 28 0v20M18 46V26a6 6 0 0 1 12 0v20"/></g>'},
 {key:'leaves',name:'植物剪影',drawing:'<g opacity=".16"><path d="M8 48L35 0M18 31C0 31 5 13 18 31ZM22 24C39 29 41 11 22 24ZM29 11C15 12 18-3 29 11Z" fill="#294337" stroke="none"/></g>'},
 {key:'terrazzo',name:'細碎磨石',drawing:'<g fill="#294337" stroke="none" opacity=".14"><path d="M5 7l7 2-4 6ZM32 6l6 4-6 3ZM16 28l6-3 2 8ZM39 34l5 3-3 6ZM2 41l5-2 2 5Z"/><circle cx="28" cy="18" r="1.5"/></g>'},
 {key:'waves',name:'柔和波紋',drawing:'<g opacity=".14"><path d="M-12 8Q0-2 12 8T36 8T60 8M-12 24Q0 14 12 24T36 24T60 24M-12 40Q0 30 12 40T36 40T60 40"/></g>'}
] as const;
export type PrintKey='none'|'image'|typeof prints[number]['key'];
export function printUrl(key:string){const p=prints.find(p=>p.key===key);if(!p)return '';return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g fill="none" stroke="#294337" stroke-width=".8">'+p.drawing+'</g></svg>');}
export function printStyle(key:string){const url=printUrl(key);return url?{backgroundImage:`url("${url}")`,backgroundSize:'48px 48px'}:{};}
export function menuCellStyle(d:{pattern:string;backgroundImage:string},color:string){if(d.pattern==='image'&&d.backgroundImage)return{backgroundColor:color+'66'};return{backgroundColor:color,...printStyle(d.pattern)};}
