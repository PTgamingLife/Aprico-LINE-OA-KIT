import {BROADCAST_LIFF,isBroadcastOwner} from '../../../src/broadcast-model.ts';
export async function broadcastGateway(event:any,options:{authenticated:boolean;owner:string;db:any;reply:(replyToken:string,messages:any[])=>Promise<unknown>}){
 if(!options.authenticated||event.source?.type!=='user'||event.type!=='message'||event.message?.type!=='text'||!['管理中心','發送中心'].includes(event.message.text?.trim()))return false;
 const own=event.source.userId;
 if(!/^U[0-9a-f]{32}$/.test(own||'')||typeof event.replyToken!=='string'||!options.db)return true;
 const eventId=event.webhookEventId;
 if(typeof eventId!=='string'||!/^[A-Za-z0-9_-]{10,100}$/.test(eventId))return true;
 const {error}=await options.db.from('line_oa_kit_trial_events').insert({event_id:'admin-center-'+eventId,line_subject:own});
 if(error)return true;
 await options.reply(event.replyToken,[{type:'text',text:isBroadcastOwner(own,options.owner)?'管理員發送中心\n'+BROADCAST_LIFF+'\n製作卡片、預覽並確認後才會群發。':'此功能僅供已綁定的主要擁有者使用。'}]);
 return true;
}
