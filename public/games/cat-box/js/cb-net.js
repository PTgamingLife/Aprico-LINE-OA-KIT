// Aprico local-only game adapter. No profile lookup or score upload.
(function(root){
 const cb_user={cb_id:'aprico-local-player',cb_name:'玩家',cb_avatar:'',cb_isLine:false};
 async function cbShare(text){const url=new URL('./',location.href).href,msg=text+'\n一起來玩 👉 '+url;try{if(navigator.share){await navigator.share({title:'貓咪躲紙箱',text:msg});return 'sent';}await navigator.clipboard.writeText(msg);return 'copied';}catch{return 'fail';}}
 root.CB_NET={cb_user,cbInitLiff:async()=>cb_user,cbSubmitScore:async()=>false,cbFetchTop10:async()=>[],cbShare};
})(window);
