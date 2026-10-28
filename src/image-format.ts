export function jpegSize(bytes:Uint8Array){
 if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('invalid_jpeg');
 let i=2;while(i+3<bytes.length){if(bytes[i++]!==255)throw Error('invalid_jpeg');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===218||marker===217)break;if(marker===1||(marker>=208&&marker<=215))continue;const length=bytes[i]*256+bytes[i+1];if(length<2||i+length>bytes.length)throw Error('invalid_jpeg');if([192,193,194].includes(marker)){if(length<8)throw Error('invalid_jpeg');return{width:bytes[i+5]*256+bytes[i+6],height:bytes[i+3]*256+bytes[i+4]};}i+=length;}
 throw Error('invalid_jpeg');
}
export function backgroundBytes(value:unknown){
 if(typeof value!=='string'||value.length>180000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('背景圖片格式不正確，請重新上傳');
 const bytes=Uint8Array.from(atob(value.split(',')[1]),c=>c.charCodeAt(0));const s=jpegSize(bytes);if(s.width<1||s.height<1||s.width>960||s.height>960)throw Error('背景圖片尺寸過大，請重新上傳');return bytes;
}
