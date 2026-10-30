import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {oaWelcomeCard,oaValueCard,onboardingCarousel,INTRO_SOURCES} from './onboarding-cards.ts';
import './intro.css';
function Intro(){
 const [notice,setNotice]=useState('');
 function download(){const blob=new Blob([JSON.stringify(onboardingCarousel(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aprico-welcome-cards.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('已下載 LINE Flex 卡片資料；尚未發送。');}
 const cards=[oaWelcomeCard(),oaValueCard()],cardsOnly=new URLSearchParams(location.search).get('view')==='cards';
 return <main className={'intro-shell'+(cardsOnly?' cards-only':'')}><header className="intro-nav"><a href="./design.html">aprico <span>AI STUDIO</span></a><a href="./admin.html">管理員卡片中心 ↗</a></header>
 <section className="intro-heading"><p className="eyebrow">A WARM WELCOME · 給剛認識 APRICO 的你</p><h1>讓顧客跟你買東西，<br/><em>也是一件有趣的事。</em></h1><p>先認識 LINE OA 的價值，再決定怎麼開始。<br/>兩張介紹卡，帶你找到自己的互動入口。</p><span className="intro-status">卡片預覽 · 尚未自動發送 · 正式收費尚未開啟</span></section>
 <section className="intro-cards" aria-label="兩張 LINE 介紹卡">{cards.map((c,i)=><article className={`intro-card ${c.theme}`} key={c.title}>
 <div className="card-cover"><div className="arch-print" aria-hidden="true"/><div className="card-kicker">APRICO AI STUDIO <span>0{i+1} / 02</span></div><div className={`card-drawing ${i?'drawing-price':'drawing-chat'}`} aria-hidden="true">{i?<><span>✦</span><strong>YOUR IDEA</strong><small>→ YOUR LINE OA</small></>:<><div>你好，想了解什麼服務？</div><div>點一下，就有下一步 ✦</div><span>▦　◈　↗</span></>}</div><h2>{c.title}</h2></div>
 <div className="card-copy">{i===0?<><p className="lead">不是換一個工具發通知，<br/>而是讓服務開始有來有往。</p><div className="benefit"><b>01</b><div><h3>從收信，變成對話</h3><p>熟悉 LINE 的顧客，在聊天室就能詢問與接續互動。</p></div></div><div className="benefit"><b>02</b><div><h3>服務入口，一眼找到</h3><p>介紹、活動與表單連結，集中在聊天室下方的圖文選單。</p></div></div><div className="benefit"><b>03</b><div><h3>常見問題，不用重打</h3><p>設定關鍵字與固定回覆，先接住顧客的第一個問題。</p></div></div><p className="soft-note">Email 適合長文與正式通知；LINE OA 適合即時對話與互動入口。不是誰取代誰，而是各有用途。</p></>:<><div className="agency-price"><small>公開委託報價案例 · 非市場統一價</small><p>帳號建立＋視覺設計 <b>NT$15,000</b></p><p>單張圖文選單設計 <b>NT$5,000</b></p><small>同一業者不同服務項目，不相加；實際依報價。</small></div><div className="our-price"><small>APRICO · 教學＋自助工具</small><p>原價 <s>NT$6,660</s></p><strong>NT$3,860<span>優惠期間／單一專案</span></strong><b>包含 5 次 AI 建置 · 非訂閱</b></div><div className="flow"><span>選 4／6／8 格</span><span>配色與印花</span><span>填需求給 AI</span><span>依圖解部署</span></div><p className="soft-note">不是把全客製代工打折，而是把設計與建置工具交到你手上。先免費預覽，再決定是否購買。</p></>}
 <a className="intro-cta" href={c.url}>{c.buttonLabel} <span>↗</span></a><p className="card-fine">{i===0?'需加入好友或完成必要授權；不保證觸及、已讀或成交，訊息費另依 LINE 方案。':'服務範圍不同，非同規格比價。帳號申請、授權與驗收仍需本人完成；加購、LINE／雲端／營運 AI 費用另計。'}</p></div>
 </article>)}</section>
 <section id="sources" className="intro-notes"><h2>看得懂，也說得清楚。</h2><p>LINE OA 帳號本身可免費申請。委託設計、客製開發與自行使用教學工具，是不同選擇；沒有「一定要先花高額費用」才能開始的門檻。</p><p>AI 建置指成功產生新版本網站草稿；仍需授權、部署與驗收。不是所有任意功能都可一鍵完成；本版自動部署以靜態互動及固定文字回覆為主。</p><p>資料核對：2026-10-30。價格與功能可能調整，請以官方與業者當時公告為準。</p><ul>{INTRO_SOURCES.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a></li>)}</ul><details><summary>管理員：取得 LINE 卡片資料</summary><p>可下載兩張橫向滑動的 Flex 卡片。下載與預覽都不會發送；管理員中心也已提供兩張可編輯模板。這次沒有設定新好友自動歡迎或群發。</p><button onClick={download}>下載 LINE Flex JSON</button><p role="status">{notice}</p></details></section>
 <footer>Aprico AI Studio · 輝得實業有限公司<br/><a href="mailto:apricoaistudio@gmail.com">apricoaistudio@gmail.com</a></footer></main>;
}
createRoot(document.getElementById('root')).render(<Intro/>);
