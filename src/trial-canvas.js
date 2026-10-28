import {themes,validateDraft} from './model.ts';
import {trialAreas,TRIAL_SIZE} from './trial-model.ts';
import {printUrl} from './backgrounds.ts';
async function imageFrom(source){const image=new Image();image.src=source;await image.decode();return image;}
function cover(ctx,img,x,y,w,h){const scale=Math.max(w/img.width,h/img.height),sw=w/scale,sh=h/scale;ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h);}
export async function renderTrialMenu(value){
 const d=validateDraft(value);await document.fonts.ready;const canvas=document.createElement('canvas');canvas.width=TRIAL_SIZE.width;canvas.height=TRIAL_SIZE.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('無法產生選單圖片，請更換瀏覽器再試');
 ctx.fillStyle='#fffef9';ctx.fillRect(0,0,1200,810);
 const photo=d.pattern==='image'?await imageFrom(d.backgroundImage):null,url=printUrl(d.pattern);let pattern;
 if(url){const tile=document.createElement('canvas');tile.width=144;tile.height=144;tile.getContext('2d').drawImage(await imageFrom(url),0,0,144,144);pattern=ctx.createPattern(tile,'repeat');}
 if(photo)cover(ctx,photo,0,56,1200,680);
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#294337';ctx.font='bold 25px "Microsoft JhengHei",sans-serif';ctx.fillText(`${d.oaName||d.name||'我的品牌'} · 個人試用`.slice(0,45),600,28);
 for(const {index,cell,bounds:b}of trialAreas(d)){
  ctx.save();ctx.fillStyle=themes[d.theme].colors[index%4];ctx.globalAlpha=photo ? .4 : 1;ctx.fillRect(b.x+3,b.y+3,b.width-6,b.height-6);ctx.globalAlpha=1;
  if(pattern){ctx.fillStyle=pattern;ctx.fillRect(b.x+3,b.y+3,b.width-6,b.height-6);}
  if(photo){ctx.fillStyle='#fffef9df';ctx.fillRect(b.x+24,b.y+b.height/2-48,b.width-48,102);ctx.fillRect(b.x+24,b.y+b.height-52,b.width-48,32);}
  ctx.fillStyle='#294337';ctx.font='bold 32px "Microsoft JhengHei",sans-serif';const text=cell.label||`功能 ${index+1}`,lines=[];let line='';for(const ch of text){if(ctx.measureText(line+ch).width>b.width-70){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);lines.slice(0,2).forEach((s,i)=>ctx.fillText(s,b.x+b.width/2,b.y+b.height/2-20+i*40));
  ctx.font='20px "Microsoft JhengHei",sans-serif';ctx.fillText(cell.template!=='custom'?'加購功能 · 展示體驗':cell.action==='message'?'固定訊息試用':cell.action==='half'?'半頁效果示意':cell.action==='full'?'全頁展示':'網址跳轉確認',b.x+b.width/2,b.y+b.height-35);ctx.restore();
 }
 ctx.fillStyle='#294b3c';ctx.fillRect(0,736,1200,74);ctx.fillStyle='white';ctx.font='bold 28px "Microsoft JhengHei",sans-serif';ctx.fillText('← 返回建置中心 · 結束個人試用',600,773);
 const image=canvas.toDataURL(photo?'image/jpeg':'image/png',.88);if(image.length>1200000)throw Error('選單圖片過大，請選較簡潔的背景後重試');return image;
}
