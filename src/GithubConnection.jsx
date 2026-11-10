import React,{useState} from 'react';
import QuestDetail from './QuestDetail.jsx';
import {githubDeploymentMessages} from './github-result.ts';
import './github-connection.css';
export default function GithubConnection({api,projectId,state,onStatus,onRepository,disabled,units,onAcknowledge,onBeforeLaunch}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[verified,setVerified]=useState(false);
 async function action(body){setBusy(true);setError('');setVerified(false);try{await body();}catch(e){setError(githubDeploymentMessages[e.code]||e.message);}finally{setBusy(false);}}
 const refresh=async()=>onStatus(await api({action:'github_status',projectId}));
 return <section className="github-connection" aria-label="GitHub App 連線">
  <p>每一格只做一件事。綁定完成後，GitHub Token 由伺服器處理，不用再填。</p>
  {units.map(unit=><QuestDetail key={unit.key} unit={unit}>
   {unit.id==='install'&&<>{state?.installationUrl?<a className="detail-link-button" href={state.installationUrl} target="_blank" rel="noreferrer" onClick={()=>onAcknowledge(unit,true)}>安裝 Aprico GitHub App ↗</a>:<p role="status">{state?.configured===false?'GitHub App 目前無法連線，請更新連線結果。':'正在取得安裝連結…'}</p>}{unit.done&&<small>連結開啟與授權完成會分開記錄。</small>}</>}
   {unit.id==='limited'&&<button type="button" aria-pressed={unit.done} disabled={disabled||busy} onClick={()=>onAcknowledge(unit)}>{unit.done?'✓ 已確認只選專用 repo':'我已選 Only select repositories'}</button>}
   {unit.id==='account'&&<><button disabled={disabled||busy||!state?.configured} onClick={()=>action(async()=>{if(onBeforeLaunch&&!await onBeforeLaunch())return;await api({action:'github_begin',projectId});})}>連接我的 GitHub 帳號 →</button><button disabled={disabled||busy} onClick={()=>action(refresh)}>更新連線結果</button>{(state?.flow||state?.connection)&&<p>已核對帳號：{state.flow?.login||state.connection?.login}。請在下一格核對專案部署權限。</p>}</>}
   {unit.id==='repository'&&<>{state?.connection?<><p className="notice">已綁定：<strong>{state.connection.full_name}</strong></p>
    <button type="button" disabled={disabled||busy} onClick={()=>action(async()=>{if(onBeforeLaunch&&!await onBeforeLaunch())return;const result=await api({action:'deploy_github_check',projectId,flowVersion:2});setVerified(result.verified===true);})}>核對此專案的部署權限</button>
    {busy&&<p role="status">正在處理 GitHub 連線…</p>}
    {verified&&<p role="status">✓ 此專案的部署權限已通過，可繼續下一關。</p>}
    {error&&<p role="alert" className="notice error">{error}</p>}
    <a className="detail-link-button" href="https://github.com/settings/installations" target="_blank" rel="noreferrer">管理已安裝的 GitHub Apps ↗</a>
    <button disabled={disabled||busy} onClick={()=>action(async()=>{await api({action:'github_disconnect',projectId});await refresh();})}>解除 Aprico 專案綁定</button></>:state?.flow?.choices.length?state.flow.choices.map(repo=><button key={repo.repositoryId} disabled={disabled||busy} onClick={()=>action(async()=>{await api({action:'github_select',projectId,flowId:state.flow.id,repositoryId:repo.repositoryId});onRepository(repo.url);await refresh();})}>{repo.fullName} · 選擇此專案</button>):<p>{state?.flow?'沒有符合條件的專案。請確認 Aprico App 已勾選你的公開專用 repo，再重新連接。':'完成上一格帳號核對後，這裡會出現可選的 repo。'}</p>}{state?.flow?.truncated&&<p>只顯示部分專案，請縮小 App 安裝範圍後重新連接。</p>}</>}
  </QuestDetail>)}
  <p className="footnote">解除綁定會停止新任務使用這個連線；已開始的任務可能仍在處理。要移除 App 本身，可到 GitHub → Settings → Applications → Installed GitHub Apps。</p>
  {error&&!state?.connection&&<p role="alert" className="notice error">{error}</p>}
 </section>;
}
