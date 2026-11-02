import React,{useState} from 'react';
import './github-connection.css';
export default function GithubConnection({api,projectId,state,onStatus,onRepository,disabled}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[launched,setLaunched]=useState(false);
 async function action(body){setBusy(true);setError('');try{await body();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const refresh=async()=>onStatus(await api({action:'github_status',projectId}));
 return <section className="github-connection" aria-label="GitHub App 連線">
  {state?.configured?<>
   <p>只授權本次的專用專案。GitHub 短效憑證留在伺服器，不用複製貼上。</p>
   {state.connection?<><p className="notice">已綁定：<strong>{state.connection.full_name}</strong><br/>GitHub 帳號：{state.connection.login}。正式執行前會再次確認權限。</p><button disabled={disabled||busy} onClick={()=>action(async()=>{await api({action:'github_disconnect',projectId});setLaunched(false);await refresh();})}>解除 Aprico 專案綁定</button><p className="footnote">解除後停止新任務使用此連線；已開始的任務可能仍在處理。若要移除 GitHub App 本身，請到 GitHub → Settings → Applications → Installed GitHub Apps 撤銷。</p></>:<>
    <ol><li><a href={state.installationUrl} target="_blank" rel="noreferrer">安裝 Aprico GitHub App ↗</a>，選「Only select repositories」，只勾選本次專用專案。</li><li>回到本頁，按下方按鈕核對 GitHub 帳號。</li></ol>
    <button disabled={disabled||busy} onClick={()=>action(async()=>{const r=await api({action:'github_begin',projectId});setLaunched(r.launched===true);})}>{busy?'處理中…':'連接我的 GitHub 帳號'}</button>
    {launched&&<p role="status">正在前往 GitHub 核對帳號。完成後會回到建置中心，再按「更新連線結果」選擇專案。</p>}
   </>}
   <button disabled={disabled||busy} onClick={()=>action(refresh)}>更新連線結果</button>
   {state.flow&&<><p>已核對 GitHub 帳號：{state.flow.login}。選擇本次使用的專案：</p>{state.flow.choices.length?state.flow.choices.map(repo=><button key={repo.repositoryId} disabled={disabled||busy} onClick={()=>action(async()=>{await api({action:'github_select',projectId,flowId:state.flow.id,repositoryId:repo.repositoryId});onRepository(repo.url);setLaunched(false);await refresh();})}>{repo.fullName} · 選擇此專案</button>):<p className="notice">沒有可用專案。請先安裝 App，選擇你有管理權限、已加入 README 的公開專用專案，再重新連接。</p>}{state.flow.truncated&&<p>專案較多，清單只顯示部分。請縮小 App 安裝的專案範圍後重新連接。</p>}</>}
  </>:<p className="footnote">GitHub App 尚未開放，這一關暫時沿用下方的限權 Token。設定完成後會改用連線按鈕。</p>}
  {error&&<p role="alert" className="notice error">{error}</p>}
 </section>;
}
