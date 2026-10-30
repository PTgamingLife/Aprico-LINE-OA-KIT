import React,{useEffect,useState} from 'react';
import DeployPanel from './DeployPanel.jsx';
const labels={queued:'等待處理',running:'AI 正在產生',draft_ready:'網站草稿已保存',failed:'產生失敗',interrupted:'處理中斷，請聯絡專員'};
export default function BuildJobs({api,projectId,ready}){
 const [jobs,setJobs]=useState([]),[job,setJob]=useState(null),[selected,setSelected]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[credits,setCredits]=useState(null);
 useEffect(()=>{let live=true,timer;async function load(){try{const r=await api({action:'build_jobs',projectId});if(!live)return;setJobs(r.jobs);setCredits(r.credits||null);const id=selected||r.jobs[0]?.id;if(id){const detail=await api({action:'build_job',projectId,jobId:id});if(!live)return;setJob(detail.job);}else setJob(null);setError('');if(r.jobs.some(j=>['queued','running'].includes(j.status)))timer=setTimeout(load,5000);}catch(e){if(live)setError(e.message);}}load();return()=>{live=false;clearTimeout(timer);};},[projectId,selected,refresh]);
 async function generate(){setBusy(true);setError('');try{const r=await api({action:'generate_source',projectId,confirmGenerate:true});setSelected(r.jobId);setConfirmed(false);setRefresh(x=>x+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="build-jobs"><h3>產生網站草稿</h3>
 {credits&&<p className="notice" role="status">本專案共 {credits.limit} 次 · 已完成 {credits.used} 次 · 處理中 {credits.pending} 次 · 剩餘 {credits.remaining} 次</p>}
 <p>使用已保存的設計與建置設定，由平台 AI 產生靜態網站原始碼。這一步不會部署、不會設定 Webhook，也不會啟用營運 AI。</p>
 <p className="footnote">每次成功產生草稿使用 1 次建置額度；處理中暫占，失敗不扣。修改需求後重新產生會使用新的一次；保存設計、讀取既有草稿及部署既有草稿不扣 AI 建置次數。用完需另洽加購，不會自動扣款。</p>
 <label className="generation-consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我確認使用本專案 1 次 AI 建置額度產生草稿。</label>
 <button className="primary" disabled={!ready||!confirmed||busy||!credits||credits.remaining===0||jobs.some(j=>['queued','running'].includes(j.status))} onClick={generate}>{busy?'建立工作中…':'產生網站草稿'}</button>
 {!ready&&<p className="footnote">請先保存並通過需求檢查。</p>}{credits?.remaining===0&&<p className="notice">可用次數已用完或暫占中；既有草稿仍可查看。加購請聯絡 apricoaistudio@gmail.com。</p>}
 {error&&<p role="alert" className="notice error">{error}</p>}<h4>建置紀錄</h4><button onClick={()=>setRefresh(x=>x+1)}>重新整理紀錄</button>
 {jobs.length===0?<p>尚未產生草稿。</p>:<label>選擇紀錄<select value={selected||jobs[0]?.id||''} onChange={e=>setSelected(e.target.value)}>{jobs.map(j=><option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString('zh-TW')} · {labels[j.status]||j.status}</option>)}</select></label>}
 {job&&<article><p role="status"><strong>{labels[job.status]||job.status}</strong> · 設計 v{job.design_revision}／設定 v{job.setup_revision}</p>{['queued','running'].includes(job.status)&&<p>可離開頁面，稍後回來查看紀錄。請勿重複送出。</p>}{['failed','interrupted'].includes(job.status)&&<p>本次未完成，系統不會自動重試扣費。請聯絡專員確認。錯誤代碼：{job.error_code||'unknown'}</p>}{job.usage&&<p className="footnote">輸入 {job.usage.inputTokens}／輸出 {job.usage.outputTokens} tokens；API 估算成本 US${Number(job.cost_usd||0).toFixed(6)}，不是對客戶的收費金額。</p>}{job.artifact&&<><h4>{job.artifact.summary}</h4><p className="notice">草稿尚未部署、尚未驗收。以下只顯示原始碼，不直接執行 AI 產生的程式。</p>{job.artifact.files.map(f=><details key={f.path}><summary>{f.path}</summary><pre>{f.content}</pre></details>)}<h4>後續待辦</h4><ul>{job.artifact.manualSteps.map((s,i)=><li key={i}>{s}</li>)}</ul><DeployPanel key={job.id} api={api} projectId={projectId} job={job}/></>}</article>}</section>;
}
