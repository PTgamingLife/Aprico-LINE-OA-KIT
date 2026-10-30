export const BROADCAST_LIFF='https://liff.line.me/2012197506-Vmb4O5iT/admin.html';
export const broadcastThemes={sage:{name:'鼠尾草綠',background:'#C9D2BE',button:'#365743'},clay:{name:'陶土奶茶',background:'#DCC9B8',button:'#785746'},blue:{name:'霧藍灰',background:'#BFCFD3',button:'#3A5963'},lavender:{name:'霧紫',background:'#D0C7DC',button:'#665477'}} as const;
export type BroadcastConfig={title:string;body:string;buttonLabel:string;url:string;imageUrl:string;theme:keyof typeof broadcastThemes};
export function isBroadcastOwner(subject:string,owner:string){return /^U[0-9a-f]{32}$/.test(owner)&&subject===owner;}
export function publicUrl(value:unknown){
 if(typeof value!=='string'||value.length>1000)throw Error('請填寫 HTTPS 公開網址');
 try{const u=new URL(value.trim());if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||/[\[\]:]/.test(u.hostname)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname))throw Error();return u.href;}catch{throw Error('請填寫不含帳密的 HTTPS 公開網址');}
}
export function validateBroadcast(v:any):BroadcastConfig{
 const text=(s:unknown,max:number)=>{if(typeof s!=='string'||!s.trim()||[...s.trim()].length>max)throw Error('請檢查標題、內文與按鈕文字長度');return s.trim();};
 if(!v||!Object.hasOwn(broadcastThemes,v.theme))throw Error('配色不正確');
 const imageUrl=v.imageUrl?publicUrl(v.imageUrl):'';
 if(imageUrl){const u=new URL(imageUrl);if(!['ptgaminglife.github.io','hhcubvixldieuwdeqnwc.supabase.co'].includes(u.hostname)||!(/\.(png|jpe?g)$/i.test(u.pathname))||u.search||(u.hostname.endsWith('.supabase.co')&&!u.pathname.startsWith('/storage/v1/object/public/')))throw Error('圖片請使用本專案或本平台公開的 PNG／JPG 網址');}
 return{title:text(v.title,60),body:text(v.body,1000),buttonLabel:text(v.buttonLabel,20),url:publicUrl(v.url),imageUrl,theme:v.theme};
}
export function broadcastCard(raw:BroadcastConfig){
 const c=validateBroadcast(raw),t=broadcastThemes[c.theme];
 return{type:'flex',altText:c.title,contents:{type:'bubble',size:'mega',...(c.imageUrl?{hero:{type:'image',url:c.imageUrl,size:'full',aspectRatio:'16:9',aspectMode:'cover'}}:{}),header:{type:'box',layout:'vertical',backgroundColor:t.background,paddingAll:'22px',spacing:'sm',contents:[{type:'text',text:'APRICO · NEWS',size:'xs',color:'#294337',weight:'bold'},{type:'text',text:c.title,size:'xl',weight:'bold',color:'#294337',wrap:true}]},body:{type:'box',layout:'vertical',backgroundColor:'#FFFEF9',paddingAll:'22px',contents:[{type:'text',text:c.body,wrap:true,size:'sm',color:'#526755'}]},footer:{type:'box',layout:'vertical',backgroundColor:'#FFFEF9',paddingAll:'20px',contents:[{type:'button',style:'primary',color:t.button,action:{type:'uri',label:c.buttonLabel,uri:c.url}}]}}};
}
export function blankBroadcast():BroadcastConfig{return{title:'',body:'',buttonLabel:'了解更多',url:'',imageUrl:'',theme:'sage'};}
export function gamesBroadcast():BroadcastConfig{return{title:'小遊戲時間到了 🎮',body:'讓腦袋放個小假，來挑戰一局！\n\n💣 More 踩地雷｜推理挑戰\n🪜 極光下樓梯｜反應挑戰\n🐱 貓咪躲紙箱｜插銷解謎\n\n免費體驗，不涉及真實獎品。',buttonLabel:'立即開玩 🎮',url:'https://liff.line.me/2012197506-Vmb4O5iT/games.html',imageUrl:'',theme:'sage'};}
