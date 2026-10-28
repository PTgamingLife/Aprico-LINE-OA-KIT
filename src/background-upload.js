export async function compressBackground(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('請選擇 JPG、PNG 或 WebP 圖片；HEIC 請先轉為 JPG。');
 if(file.size>12*1024*1024)throw Error('原始圖片請小於 12 MB。');
 const url=URL.createObjectURL(file);try{
  const image=new Image();image.src=url;await image.decode();
  if(!image.width||!image.height||image.width*image.height>80000000)throw Error('圖片尺寸過大，請縮小後再上傳。');
  const scale=Math.min(1,960/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('無法處理圖片，請更換瀏覽器再試。');
  ctx.fillStyle='#fffef9';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.86,.76,.64,.5,.36]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=170000)return data;}
  throw Error('圖片細節太多，請選擇較簡潔的背景或縮小後再上傳。');
 }finally{URL.revokeObjectURL(url);}
}
