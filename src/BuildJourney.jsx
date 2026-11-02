import React,{useEffect,useRef,useState} from 'react';
import {validateSetup} from './build-model.ts';
import {projectGuides} from './project-guides.ts';
import {AccountScreen} from './ProjectSetupGuide.jsx';
import GuideImage from './GuideImage.jsx';
import GithubConnection from './GithubConnection.jsx';
import {emptyCredentials,journeySteps,questProof,safeJourneyState,sameTarget,needsLiff,entered} from './journey.ts';
import './journey.css';

export default function BuildJourney({api,projectId,projectRevision,draft,initial,initialRevision,pendingSaveRef}){
 const storageKey='aprico-journey:'+projectId;
 const [resume]=useState(()=>{try{return safeJourneyState(JSON.parse(localStorage.getItem(storageKey)||'{}'));}catch{return safeJourneyState(null);}});
 const [step,setStep]=useState(resume.step),[acks,setAcks]=useState(resume.acks),[setup,setSetup]=useState(initial),[revision,setRevision]=useState(initialRevision),[baseline,setBaseline]=useState(JSON.stringify(initial));
 const [secrets,setSecrets]=useState(emptyCredentials),[plan,setPlan]=useState(null),[ready,setReady]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [job,setJob]=useState(null),[record,setRecord]=useState(null),[credits,setCredits]=useState(null),[intent,setIntent]=useState(null),[refresh,setRefresh]=useState(0);
 const [github,setGithub]=useState(null);
 const attempted=useRef(new Set()),mounted=useRef(true),panel=useRef(null),secretRef=useRef(secrets);secretRef.current=secrets;
 const steps=journeySteps(draft),q=steps.find(s=>s.id===step)||steps[0],index=steps.findIndex(s=>s.id===q.id),dirty=JSON.stringify(setup)!==baseline;
 const running=busy||Boolean(intent)||['queued','running'].includes(job?.status)||['queued','running'].includes(record?.status);
 const usingApp=Boolean(github?.configured&&github.connection&&('https://github.com/'+github.connection.full_name).toLowerCase()===setup.githubRepo.replace(/\/$/,'').toLowerCase());
 const context={setup,savedSetup:JSON.parse(baseline),secrets,acks,plan,deployment:record,running,githubApp:usingApp};
 const proofs=steps.map(s=>questProof(s,context)),done=proofs.filter(p=>p.done).length,firstOpen=proofs.findIndex(p=>!p.done),finished=done===steps.length;
 useEffect(()=>()=>{mounted.current=false;secretRef.current=emptyCredentials();},[]);
 useEffect(()=>{let live=true;api({action:'github_status',projectId}).then(r=>{if(live)setGithub(r);}).catch(()=>{if(live)setGithub({configured:false});});return()=>{live=false;};},[projectId]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(safeJourneyState({step:q.id,acks})));}catch{}},[q.id,acks,storageKey]);
 useEffect(()=>{const f=e=>{if(dirty||Object.values(secretRef.current).some(Boolean)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',f);return()=>window.removeEventListener('beforeunload',f);},[dirty]);
 useEffect(()=>{pendingSaveRef.current=async()=>{if(running){setError('本次任務處理中，請先留在此頁查看結果。');return false;}if(dirty&&!await save())return false;return !Object.values(secrets).some(Boolean)||confirm('離開會清空一次性授權憑證，回來後需重新填寫；已保存的需求不會消失。確定離開？');};return()=>{pendingSaveRef.current=null;};},[setup,revision,dirty,running,secrets]);
 useEffect(()=>{let live=true,timer;
  async function load(){try{
   const r=await api({action:'build_jobs',projectId});if(!live)return;setCredits(r.credits);
   const candidate=r.jobs.find(j=>(!intent||j.id===intent.jobId)&&j.design_revision===projectRevision&&j.setup_revision===revision);
   let detail=null;if(candidate){const d=await api({action:'build_job',projectId,jobId:candidate.id});detail=d.job;}
   const deployments=await api({action:'deploy_status',projectId});if(!live)return;
   const deployment=deployments.deployments.find(d=>d.build_job_id===detail?.id)||null;setJob(detail);setRecord(deployment);
   if(intent||['queued','running'].includes(detail?.status)||['queued','running'].includes(deployment?.status))timer=setTimeout(load,5000);
  }catch(e){if(live)setError(e.message);}}
  load();return()=>{live=false;clearTimeout(timer);};
 },[projectId,revision,projectRevision,refresh,intent?.jobId]);
 useEffect(()=>{if(!intent||job?.id!==intent.jobId||job.status!=='draft_ready'||attempted.current.has(job.id))return;
  attempted.current.add(job.id);
  (async()=>{try{
   const checked=await api({action:'deploy_prepare',projectId,jobId:job.id,credentials:secretRef.current,githubApp:intent.githubApp});
   if(!sameTarget(checked.plan,intent.plan))throw Error('目標帳號已變更，任務已停止，請重新核對；不會自動換成其他帳號。');
   await api({action:'deploy_start',projectId,jobId:job.id,credentials:secretRef.current,githubApp:intent.githubApp,confirmPublish:true,expectedBotId:intent.plan.botId,expectedGithub:intent.plan.githubRepo,expectedRef:intent.plan.ref});
   if(mounted.current)setStatus('系統已接手，請等待完成提示，不必操作其他網站。');
  }catch(e){if(mounted.current)setError(e.message+' 已停止自動執行，請聯絡專員確認，不要重複送出。');}
  finally{if(mounted.current){setSecrets(emptyCredentials());setIntent(null);setRefresh(v=>v+1);}}
  })();
 },[job,intent]);
 useEffect(()=>{if(intent&&['failed','interrupted'].includes(job?.status)){setIntent(null);setSecrets(emptyCredentials());setError('本次 AI 處理未完成，不會自動重試扣次數。請聯絡專員。');}},[job?.status,intent]);
 useEffect(()=>{if(record?.status==='awaiting_acceptance'&&q.id==='automatic'){setStatus('系統處理完成，接下來請完成手機實測關卡。');setStep('webhook');}},[record?.status,q.id]);
 function change(key,value,secret=false){if(secret)setSecrets(s=>({...s,[key]:value}));else setSetup(s=>({...s,[key]:value}));setPlan(null);setReady(false);setConsent(false);setError('');}
 async function save(){if(busy)return false;setBusy(true);setError('');try{
  const snapshot=validateSetup(setup),r=await api({action:'save_build_setup',projectId,setupRevision:revision,setup:snapshot});setSetup(snapshot);setRevision(r.access.setup_revision);setBaseline(JSON.stringify(snapshot));setStatus('這一關的資料已保存到你的專案。');return true;
 }catch(e){setError(e.message);return false;}finally{setBusy(false);}}
 async function go(id){if(running&&id!=='automatic')return;if(dirty&&!await save())return;setStep(id);setError('');panel.current?.scrollIntoView({block:'start',behavior:'smooth'});}
 async function next(){if(q.kind==='guide'&&!q.field||q.kind==='manual')setAcks(s=>({...s,[q.id]:true}));if(dirty&&!await save())return;setStep(steps[Math.min(index+1,steps.length-1)].id);panel.current?.scrollIntoView({block:'start',behavior:'smooth'});}
 async function verify(){if(dirty&&!await save())return;setBusy(true);setError('');try{
  const requirements=await api({action:'check_build',projectId});if(!requirements.requirementsReady)throw Error(requirements.issues.join('；'));
  const r=await api({action:'deploy_target_check',projectId,credentials:secrets,githubApp:usingApp});if(r.designRevision!==projectRevision||r.setupRevision!==revision)throw Error('資料版本已更新，請重新載入並確認。');
  setPlan(r.plan);setReady(Boolean(requirements.generationAvailable));setStatus('目標帳號已由系統核對，尚未建置或修改。');
 }catch(e){setError(e.message);setPlan(null);}finally{setBusy(false);}}
 async function start(){if(!consent||!ready||!plan||busy)return;setBusy(true);setError('');try{
  const r=job?.status==='draft_ready'?{jobId:job.id}:await api({action:'generate_source',projectId,confirmGenerate:true});setIntent({jobId:r.jobId,plan,githubApp:usingApp});setStep('automatic');setStatus('已開始處理，請留在此頁直到系統接手部署；不要重複送出。');setRefresh(v=>v+1);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 async function accept(){if(!record||busy)return;setBusy(true);setError('');try{
  const checks={...record.user_checks,[q.id]:true,...(!needsLiff(draft)?{liff:true}:{})};
  await api({action:'deploy_acceptance',projectId,deploymentId:record.id,checks});setRecord(r=>({...r,user_checks:checks}));setStatus('你的實測回報已保存；這不是系統自動驗證。');setStep(steps[Math.min(index+1,steps.length-1)].id);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const guide=q.kind==='guide'?projectGuides[q.guide]:null;
 const canNext=q.id==='githubToken'&&usingApp||q.kind==='guide'&&!q.field||q.kind==='manual'||['field','secret','guide'].includes(q.kind)&&entered(q,setup,secrets);
 const allPrepared=steps.filter(s=>['field','guide','secret'].includes(s.kind)).every(s=>questProof(s,context).done);
 return <section className="quest-journey" aria-label="我的 LINE OA 闖關流程">
  <div className="quest-heading"><span className="quest-kicker">YOUR OA ADVENTURE</span><h3>一格一關，打造你的 LINE OA</h3><p>只顯示你需要做的事。其餘交給系統，完成一格再前進。</p></div>
  <div className="quest-progress"><strong>{done} / {steps.length} 格已完成</strong><span>{finished?'設定流程完成 · 本人實測已回報':running?'系統處理中，請勿重複送出':dirty?'目前修改尚未保存':'可從已解鎖的關卡繼續'}</span><progress aria-label="關卡完成進度" value={done} max={steps.length}/></div>
  <details className="quest-map" open><summary>我的闖關地圖 <small>每一格是一個動作</small></summary><ol>{steps.map((s,i)=><li key={s.id}><button className={`quest-tile ${s.kind==='automatic'?'machine':''} ${proofs[i].done?'done':''}`} aria-current={q.id===s.id?'step':undefined} disabled={running?s.id!=='automatic':i>firstOpen&&firstOpen!==-1} onClick={()=>go(s.id)}><span aria-hidden="true">{proofs[i].done?'✓':s.kind==='automatic'?'✦':String(i+1).padStart(2,'0')}</span><strong>{s.title}</strong><small>{proofs[i].done?proofs[i].label:q.id===s.id?'目前關卡':i>firstOpen?'完成前一關後開啟':'可以開始'}</small></button></li>)}</ol></details>
  <article className="quest-stage" ref={panel} aria-labelledby="quest-title"><div className="quest-stage-top"><span>{q.kind==='automatic'?'系統關卡':'你的關卡'} · {index+1} / {steps.length}</span><span>{q.kind==='secret'?'憑證不保存到瀏覽器':'一次只做一件事'}</span></div><h3 id="quest-title">{q.title}</h3>
   {guide?<><p>{guide.lead}</p><AccountScreen key={guide.id} guide={guide}/><ol>{guide.instructions.map(t=><li key={t}>{t}</li>)}</ol><a href={guide.url} target="_blank" rel="noreferrer">{guide.link}</a>{q.field&&<label>{guide.label}<input type="url" value={setup[q.field]} maxLength={2000} placeholder={guide.placeholder} onChange={e=>change(q.field,e.target.value)}/></label>}<p className="footnote">{guide.note}「已有／已完成」僅是你的確認，授權會在後面的關卡由系統核對。</p></>:<GuideImage topic={q.id==='lineSecret'?'lineSecret':q.kind==='automatic'?'journeyAuto':q.topic} lesson={q.id==='githubToken'&&github?.configured?{title:'連接 GitHub App',rows:['安裝 Aprico App','Only select repositories','返回此頁連接 GitHub 帳號','更新結果，選擇本次專案'],focus:1}:q.kind==='field'&&q.id!=='messagingChannelId'?{title:q.label,rows:[q.label,q.hint,'填寫下方欄位','保存後解鎖下一關'],focus:2}:undefined}/>}
   {q.kind==='field'&&<label>{q.label}<textarea rows={q.id==='messagingChannelId'?1:3} value={setup[q.id]} maxLength={2000} placeholder={q.hint} onChange={e=>change(q.id,e.target.value)}/></label>}
   {q.id==='purpose'&&setup.runtimeAiProvider!=='none'&&<p className="notice">此專案先前選了營運 AI；目前自動部署尚不支援。<button onClick={()=>change('runtimeAiProvider','none')}>本次先改成不使用營運 AI</button></p>}
   {q.id==='messagingChannelId'&&<label>客服 LINE 連結（選填）<input type="url" value={setup.contactUrl} placeholder="https://line.me/ti/p/…" onChange={e=>change('contactUrl',e.target.value)}/></label>}
   {q.id==='githubToken'&&<GithubConnection api={api} projectId={projectId} state={github} disabled={running} onRepository={url=>change('githubRepo',url)} onStatus={r=>{setGithub(r);setPlan(null);setReady(false);setConsent(false);if(r.connection)setSecrets(s=>({...s,githubToken:''}));}}/>}
   {q.kind==='secret'&&!(q.id==='githubToken'&&usingApp)&&<><p>依上方圖片取得此專案的憑證，只在這一關填一次。重新整理或離開會清空，其他需求仍保存在專案。</p><label>{q.label}<input type="password" autoComplete="off" value={secrets[q.id]} maxLength={q.id==='lineSecret'?32:6000} onChange={e=>change(q.id,e.target.value,true)}/></label>{q.id==='githubToken'&&<p className="footnote">過渡方式：只選本次專用 repo；現行部署需 Contents、Pages、Administration 的 Read and write。這是一次性 Token，不是 GitHub App 授權。</p>}{q.id==='supabaseToken'&&<p className="footnote">只限自己的專案：Project Settings Read、Edge Functions 與 Edge Function Secrets Read-write。不是 anon 或 service_role key。</p>}{q.id==='lineToken'&&<p className="footnote">請和上一關使用同一個 Messaging API Channel。已有 Token 就沿用，沒有才 Issue。</p>}</>}
   {q.url&&!(q.id==='githubToken'&&usingApp)&&<a className="guide-link" href={q.url} target="_blank" rel="noreferrer">開啟本關設定頁 ↗</a>}
   {q.kind==='review'&&<><p>系統先核對你指定的三個帳號，不會因此扣用 AI 次數或修改外部設定。</p><button disabled={busy||!allPrepared} onClick={verify}>{busy?'核對中…':'核對本次帳號與授權'}</button>{plan&&<><dl><div><dt>GitHub</dt><dd>{plan.githubRepo}</dd></div><div><dt>Supabase</dt><dd>{plan.supabaseName}</dd></div><div><dt>LINE OA</dt><dd>{plan.botName} · {plan.botBasicId}</dd></div></dl><label className="generation-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我確認上述帳號與設計，同意{job?.status==='draft_ready'?'沿用已保存的同版本草稿，不再扣 AI 次數':'使用本專案 1 次 AI 建置額度'}；檢查通過後由系統公開發布網站、建立後端、將 LINE 金鑰寫入自己的 Supabase 並設定 Webhook。第三方用量費另計。</label><button className="primary" disabled={busy||!consent||!ready||!credits||credits.remaining===0&&job?.status!=='draft_ready'||Boolean(record)} onClick={start}>確認任務，交給系統完成 →</button></>}{credits&&<p>本專案剩餘 {credits.remaining} 次。成功產生新草稿才使用一次，失敗不扣；不會自動加購。</p>}<p className="footnote">本版支援靜態互動與固定文字回覆。營運 AI、健康檢測、資料庫功能與選單／LIFF 自動配置尚未支援，系統不會將它們標示為已完成。</p></>}
   {q.kind==='automatic'&&<div className="quest-machine"><span aria-hidden="true">✦</span><h4>{record?.status==='awaiting_acceptance'?'系統處理完成':error||['failed','interrupted'].includes(record?.status)?'任務需要協助':running?'你的點子，正在成形…':job?.status==='draft_ready'?'已有草稿，請重新核對一次性授權':'等待確認本次任務'}</h4><p>AI 產生程式、發布網站與後端、連接 Webhook，都合併在這一格。你不需要追蹤裡面的技術步驟。</p><button onClick={()=>setRefresh(v=>v+1)}>更新進度</button>{!running&&!record&&<button onClick={()=>setStep('review')}>回到任務確認</button>}<details><summary>需要協助時才展開的紀錄</summary><p>草稿：{job?.status||'尚未開始'}；部署：{record?.status||'尚未開始'}</p>{record?.error_code&&<p>{record.error_code}。已完成的變更不會自動回復，請聯絡專員；勿重送。</p>}{job?.artifact&&<><p>{job.artifact.summary}</p>{job.artifact.files.map(f=><details key={f.path}><summary>{f.path}</summary><pre>{f.content}</pre></details>)}</>}</details></div>}
   {q.kind==='manual'&&<><p>網址已由系統設定。請進入這個 OA 的 Messaging API，確認「Use webhook」已開啟；這是你需要操作的開關。</p><p className="result-url">{record?.webhook_url}</p><p className="footnote">下一步只記錄你已完成操作，不代表系統替你按過開關。</p></>}
   {q.kind==='acceptance'&&<><p>{({website:'開啟網站，實際操作並確認內容符合需求。',lineMessage:'在自己的 OA 傳送真實訊息，確認收到預期回覆。',menu:'依需求設定圖文選單，再逐一點選入口確認；本版不會替你自動配置圖文選單。',liff:'完成 LIFF 設定後，在 LINE 手機裡逐一測試 App；本版不會替你自動配置 LIFF。'})[q.id]}</p>{record?.app_url&&<a href={record.app_url} target="_blank" rel="noreferrer">開啟我的網站 ↗</a>}<button className="primary" disabled={busy||record?.status!=='awaiting_acceptance'} onClick={accept}>{busy?'保存中…':'我已實際測試，保存並過關 ✓'}</button><p className="footnote">這是你的實測回報，不是系統已驗證送達、功能正確或所有服務上線。</p></>}
   {status&&<p role="status" className="notice">{status}</p>}{error&&<p role="alert" className="notice error">{error}</p>}
   <div className="wizard-actions"><button disabled={index===0||running} onClick={()=>go(steps[index-1].id)}>← 上一關</button>{['field','secret','guide','manual'].includes(q.kind)&&<button className="primary" disabled={busy||!canNext||q.kind==='manual'&&record?.status!=='awaiting_acceptance'} onClick={next}>{q.kind==='guide'&&!q.field?'已有／已完成，前往下一關 →':'保存並前往下一關 →'}</button>}</div>
  </article>
  {finished&&<section className="quest-victory" role="status"><span aria-hidden="true">✦</span><h3>所有關卡完成！</h3><p>你的設定與本人實測回報已完成。仍可回到已解鎖的格子查看資料。</p>{record?.app_url&&<a href={record.app_url} target="_blank" rel="noreferrer">開啟我的網站 ↗</a>}</section>}
 </section>;
}
