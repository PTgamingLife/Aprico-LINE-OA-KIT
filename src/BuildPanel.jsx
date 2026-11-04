import React,{useEffect,useState} from 'react';
import {emptySetup,validateSetup} from './build-model.ts';
import PaymentPanel from './PaymentPanel.jsx';
import BuildJourney from './BuildJourney.jsx';
import {QuestProgress} from './QuestDetail.jsx';
import './build.css';
export default function BuildPanel({api,projectId,projectRevision,user,draft,pendingSaveRef,onDesign}){
 const [progress,setProgress]=useState({done:0,total:0,percent:0});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[access,setAccess]=useState(null),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[contact,setContact]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let live=true;(async()=>{try{
  const c=await api({action:'config'});if(live)setContact(c.contactUrl||'');
  if(!user||!projectId)return;const r=await api({action:'build_status',projectId});if(live)setAccess(r.access||null);
 }catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[projectId,user]);
 async function unlocked(){const r=await api({action:'build_status',projectId});setAccess(r.access||null);}
 async function unlock(e){e.preventDefault();setBusy(true);setError('');try{const r=await api({action:'unlock_build',projectId,password});setAccess(r.access);}catch(e){setError(e.message);}finally{setPassword('');setBusy(false);}}
 return <section className={'card build-access '+(access?'has-secretary-room':'')}>{!access&&<><QuestProgress value={progress}/><span className="pill">開通你的建置旅程</span><h2>{draft.name||'我的 LINE OA 建置旅程'}</h2><p>逐步完成任務，為男生或女生秘書穿上裝備。每一格都有圖文與可播放的教學。</p></>}
 <div className="access-buttons">{contact&&<a className="guide-link" href={contact} target="_blank" rel="noreferrer">聯絡專員 ↗</a>}</div>
 {loading?<p role="status">正在找回你的專案進度…</p>:access?<BuildJourney key={projectId} api={api} projectId={projectId} projectRevision={projectRevision} draft={draft} initial={access.setup_revision>0?validateSetup(access.setup):emptySetup()} initialRevision={access.setup_revision} pendingSaveRef={pendingSaveRef} onProgress={setProgress} user={user} onDesign={onDesign}/>:<>
 {user&&projectId?<><PaymentPanel api={api} user={user} projectId={projectId} onUnlocked={unlocked}/><button disabled={busy} onClick={()=>setShowPassword(v=>!v)}>使用專員開通密碼</button>{showPassword&&<form className="password-form" onSubmit={unlock}><label>專員提供的開通密碼<input type="password" autoComplete="off" maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy||!password}>{busy?'驗證中…':'確認開通並開始闖關'}</button></form>}</>:<p>請先使用 LINE 登入，並在設計頁保存你的專案；完成後就能繼續旅程。</p>}
 <div className="journey-intro"><span>① 準備秘書裝備</span><i>→</i><span>② 系統自動完成</span><i>→</i><span>③ 手機實測過關</span></div><p className="footnote">GitHub 可使用 App 限定專案授權；Supabase 仍需完成部署授權。只有成功核對與完成的項目才會顯示相應狀態。</p></>}
 {error&&<p role="alert" className="notice error">{error}</p>}</section>;
}
