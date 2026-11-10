import React,{useEffect,useRef} from 'react';

export default function GithubPermissionsHelp({installationUrl}){
 const dialog=useRef(null);
 useEffect(()=>{if(!dialog.current?.open)dialog.current?.showModal();},[installationUrl]);
 return <>
  <button type="button" onClick={()=>dialog.current?.showModal()}>查看權限更新教學</button>
  <dialog ref={dialog} className="detail-dialog" aria-label="更新 GitHub 部署權限">
   <h3>更新 Aprico App 的 Workflows 權限</h3>
   <ol>
    <li>用下方連結打開 GitHub 安裝設定。若看到安裝清單，先找到 Aprico AI Studio Builder，再按 Configure。</li>
    <li>按 Review permissions，確認 Workflows 為 Read and write，再按 Accept。</li>
    <li>回到這一關重新按核對。若畫面要求重新選擇專案，選回同一個專用 repo。</li>
   </ol>
   <a className="detail-link-button" href={installationUrl} target="_blank" rel="noreferrer">開啟 Aprico App 安裝設定 ↗</a>
   <form method="dialog"><button type="submit">回到核對</button></form>
  </dialog>
 </>;
}
