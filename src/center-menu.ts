export const CENTER_LIFF='https://liff.line.me/2012197506-Vmb4O5iT';
export function centerMenu(learningUrl:string){
 const url=new URL(learningUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('請先提供正確的 AI 教學 HTTPS 網址');
 const entries=[
  {label:'打造我的 LINE OA',uri:CENTER_LIFF+'/design.html'},
  {label:'開始建置',uri:CENTER_LIFF+'/build.html'},
  {label:'查看其他使用者的使用方式',type:'message',text:'公開案例準備中，敬請期待。'},
  {label:'聯絡專員',uri:'https://line.me/ti/p/ZC-w2BuPoi'},
  {label:'AI 官方內容中文版教學',uri:url.href},
  {label:'小遊戲專區',uri:CENTER_LIFF+'/games.html'}
 ];
 return{size:{width:1200,height:810},selected:true,name:'Aprico six center 20261030 v1',chatBarText:'開啟 Aprico 六格選單',areas:entries.map((entry,i)=>({bounds:{x:i%3*400,y:Math.floor(i/3)*405,width:400,height:405},action:entry.type==='message'?{type:'message',label:entry.label,text:entry.text}:{type:'uri',label:entry.label,uri:entry.uri}}))};
}
