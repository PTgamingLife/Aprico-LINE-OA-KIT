import React,{useEffect,useState} from 'react';
import {BUILD_LIST_PRICE,BUILD_SALE_PRICE,twd} from './payment-price.ts';
export default function PaymentPanel({api,projectId,user,onUnlocked}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false),[error,setError]=useState('');
 const returned=new URLSearchParams(location.search).get('pay');
 async function load(){if(!user||!projectId)return;try{setData(await api({action:'payment_status',projectId}));}catch(e){setError(e.message);}}
 useEffect(()=>{let active=true;if(user&&projectId)api({action:'payment_status',projectId}).then(r=>active&&setData(r)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[projectId,user]);
 async function act(action){if(busy)return;setBusy(true);setError('');try{const r=await api({action,projectId,acceptPurchase:accepted,confirmPayment:action==='payment_confirm'});setData(r);if(r.unlocked)await onUnlocked();}catch(e){setError(e.message);await load();}finally{setBusy(false);}}
 const order=data?.order,terminal=['paid','test_paid','cancelled'].includes(order?.status);
 const price=data?.amount||BUILD_SALE_PRICE;
 return <section className="payment-box"><h3>Aprico AI Studio · 建置工具開通</h3><p className="payment-price"><span>原價 <s>{twd(data?.listPrice||BUILD_LIST_PRICE)}</s></span><strong>優惠期間 {twd(price)}／單一專案</strong><small>包含 5 次 AI 建置 · 一次付款，非訂閱。</small></p><p className="footnote">成功產生新草稿使用 1 次，處理中暫占，失敗不扣；同版本重讀不扣。用完另洽加購，不自動扣款。服務是教學與建置工具，不是代營運；付款開通不等於已部署。小遊戲、健康模組、額外額度及第三方服務費另計。</p>
 {!data?<p>正在讀取付款服務…</p>:<><p className="footnote">{!data.available?'商店尚未啟用，暫不提供線上付款。':data.mode==='sandbox'?'測試環境：不會正式收款，也不會開通正式專案。':'正式付款環境'}</p>
 {returned&&<p role="status">{returned==='cancel'?'你已返回建置中心。取消畫面不等於付款取消，請核對訂單狀態。':'已返回建置中心。完成 LINE Pay 授權後，請按下方按鈕確認付款；僅返回此頁不會開通。'}</p>}
 {order&&<div className="payment-receipt"><small>訂單 {order.id}</small><p>本筆訂單金額：{twd(order.amount)}{order.amount!==price?'（依訂單成立時價格）':''}</p><p>狀態：{{requesting:'訂單建立中，請勿重付',pending:'等待 LINE Pay 付款授權',confirming:'付款核對中，請勿重付',unknown:'需專員核對，請勿重付',paid:'付款完成',test_paid:'測試交易完成（不開通正式專案）',cancelled:'LINE Pay 已確認取消或逾時'}[order.status]||order.status}</p></div>}
 {(!order||order.status==='cancelled')&&<><label className="payment-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>我已確認選取的專案與本筆 {twd(price)} 購買範圍。</label><button className="primary" disabled={busy||!data.available||!accepted||!user||!projectId} onClick={()=>act('payment_create')}>{busy?'處理中…':data.mode==='sandbox'?'建立 LINE Pay 測試訂單':`建立 ${twd(price)} 付款訂單`}</button></>}
 {order?.paymentUrl&&<p><a className="guide-link" href={order.paymentUrl} rel="noreferrer">前往 LINE Pay 付款 →</a></p>}
 {order?.status==='pending'&&<button className="primary" disabled={busy} onClick={()=>act('payment_confirm')}>已完成授權，確認本次付款</button>}
 {order&&!terminal&&<button disabled={busy} onClick={()=>act('payment_reconcile')}>核對付款結果（不再次扣款）</button>}
 {order?.status==='test_paid'&&<p>測試完成後，請聯絡專員。正式開通仍可使用密碼。</p>}
 </>}{error&&<p role="alert" className="notice error">{error}</p>}<small className="footnote">付款成功不代表已部署；仍需依教學授權並完成驗收。金額由伺服器核對，請勿重複付款。</small><p className="footnote">客服：<a href="mailto:apricoaistudio@gmail.com">apricoaistudio@gmail.com</a></p></section>;
}
