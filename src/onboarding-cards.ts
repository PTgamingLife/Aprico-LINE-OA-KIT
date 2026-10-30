import {broadcastCard,validateBroadcast} from './broadcast-model.ts';
import {BUILD_LIST_PRICE,BUILD_SALE_PRICE,twd} from './payment-price.ts';
const design='https://liff.line.me/2012197506-Vmb4O5iT/design.html';
export const INTRO_SOURCES=[
 {label:'LINE 官方：圖文選單與服務入口',url:'https://help.line.me/line/smartphone?contentId=200001441&lang=zh-Hant'},
 {label:'LINE 官方：關鍵字與自動回應',url:'https://tw.linebiz.com/manual/line-official-account/oa-manager-autoreply/'},
 {label:'公開報價案例：宜佳網路科技',url:'https://www.echia.net/line/linebiz-pricing'}
];
export function oaWelcomeCard(){return validateBroadcast({
 title:'不只寄出訊息，讓顧客真的走近你。',
 body:'為什麼把服務入口放進 LINE？\n\n① 對話更順手\n熟悉 LINE 的顧客，可在聊天室詢問與接續互動。\n\n② 功能不用到處找\n把服務介紹、活動與表單連結，集中在圖文選單。\n\n③ 常見問題先接住\n設定關鍵字與固定回覆，重複問題不用每次重打。\n\nEmail 適合長文與正式通知；LINE OA 適合即時對話與互動入口，兩者可以互補。\n\n提醒：需顧客加入好友或完成必要授權；不保證觸及、已讀或成交，訊息費另依 LINE 方案。',
 buttonLabel:'免費看看我的 OA',url:design,imageUrl:'',theme:'sage'
 });}
export function oaValueCard(){return validateBroadcast({
 title:'專業起步，不必先砸大預算。',
 body:`委託建置，常要分項規劃與報價\n公開案例（宜佳網路科技）：帳號建立＋視覺設計 NT$15,000；單張圖文選單設計 NT$5,000。此為同一業者的不同服務項目，不相加。\n\nAprico AI Studio｜自己掌握設計\n原價 ${twd(BUILD_LIST_PRICE)}\n優惠期間 ${twd(BUILD_SALE_PRICE)}／單一專案\n包含 5 次 AI 建置，非訂閱。\n\n選 4／6／8 格 → 套用配色與印花 → 填入需求 → AI 產生草稿，依圖解授權部署。先免費預覽，再決定是否購買。\n\n本系統販售教學與工具，不是全客製代工；功能範圍不同，不是同規格比價。仍需本人申請帳號、授權並驗收。加購模組及 LINE／雲端／營運 AI 費用另計。\n\n案例價格核對：2026-10-30；實際依業者報價。LINE OA 帳號本身可免費申請，不需付這筆代建費才能開戶。\n報價來源：https://www.echia.net/line/linebiz-pricing`,
 buttonLabel:'先免費設計我的 OA',url:design,imageUrl:'',theme:'clay'
 });}
export function onboardingCarousel(){
 const bubbles=[oaWelcomeCard(),oaValueCard()].map((config,i)=>{
  const bubble=broadcastCard(config).contents;
  bubble.header.contents[0].text=`APRICO · START HERE 0${i+1}`;
  return bubble;
 });
 return {type:'flex',altText:'歡迎認識 Aprico：LINE OA 的互動優勢與專案建置方案',contents:{type:'carousel',contents:bubbles}};
}
