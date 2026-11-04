import React,{useEffect,useRef,useState} from 'react';
import {validateSetup} from './build-model.ts';
import {projectGuides} from './project-guides.ts';
import {AccountScreen} from './ProjectSetupGuide.jsx';
import GuideImage from './GuideImage.jsx';
import GithubConnection from './GithubConnection.jsx';
import QuestDetail,{QuestProgress} from './QuestDetail.jsx';
import {safeDetailAcks,pageDetails,detailProgress} from './journey-details.ts';
import {emptyCredentials,journeySteps,questProof,safeJourneyState,sameTarget,needsLiff,entered} from './journey.ts';
import './journey.css';
import SecretaryRoom from './SecretaryRoom.jsx';
import {equipmentProgress,equipmentForStep} from './equipment-model.ts';

export default function BuildJourney({api,projectId,projectRevision,draft,initial,initialRevision,pendingSaveRef,onProgress,user,onDesign}){
 const storageKey='aprico-journey:'+projectId;
 const [resume]=useState(()=>{try{const stored=JSON.parse(localStorage.getItem(storageKey)||'{}');return {...safeJourneyState(stored),details:safeDetailAcks(stored.details)};}catch{return {...safeJourneyState(null),details:{}};}});
 const [details,setDetails]=useState(resume.details),[manualGithub,setManualGithub]=useState(false);
 const [step,setStep]=useState(resume.step),[acks,setAcks]=useState(resume.acks),[setup,setSetup]=useState(initial),[revision,setRevision]=useState(initialRevision),[baseline,setBaseline]=useState(JSON.stringify(initial));
 const [secrets,setSecrets]=useState(emptyCredentials),[plan,setPlan]=useState(null),[ready,setReady]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [job,setJob]=useState(null),[record,setRecord]=useState(null),[credits,setCredits]=useState(null),[intent,setIntent]=useState(null),[refresh,setRefresh]=useState(0);
 const [github,setGithub]=useState(null);
 const [selectedEquipment,setSelectedEquipment]=useState(null);
 const attempted=useRef(new Set()),mounted=useRef(true),panel=useRef(null),secretRef=useRef(secrets);secretRef.current=secrets;
 const steps=journeySteps(draft),q=steps.find(s=>s.id===step)||steps[0],index=steps.findIndex(s=>s.id===q.id),dirty=JSON.stringify(setup)!==baseline;
 const running=busy||Boolean(intent)||['queued','running'].includes(job?.status)||['queued','running'].includes(record?.status);
 const usingApp=Boolean(!manualGithub&&github?.configured&&github.connection&&('https://github.com/'+github.connection.full_name).toLowerCase()===setup.githubRepo.replace(/\/$/,'').toLowerCase());
 const githubMode=manualGithub||github?.configured===false?'token':'app';
 const context={setup,savedSetup:JSON.parse(baseline),secrets,acks,details,plan,deployment:record,running,githubApp:usingApp,github,githubMode,grid:draft.grid,consent,job,intent};
 const progress=detailProgress(steps,context),units=pageDetails(q,context),proofs=progress.pages.map(p=>({done:p.complete,label:p.complete?'本頁細項已完成':`${p.done} / ${p.total} 細項`})),done=proofs.filter(p=>p.done).length,firstOpen=proofs.findIndex(p=>!p.done),finished=progress.done===progress.total;
 const groups=equipmentProgress(progress.pages,draft,Boolean(projectId&&projectRevision>0));
 useEffect(()=>{if(selectedEquipment&&!['uniform','voice'].includes(selectedEquipment))setSelectedEquipment(equipmentForStep(q.id));},[q.id]);
 useEffect(()=>()=>{mounted.current=false;secretRef.current=emptyCredentials();},[]);
 useEffect(()=>{let live=true;api({action:'github_status',projectId}).then(r=>{if(live)setGithub(r);}).catch(()=>{if(live)setGithub({configured:false});});return()=>{live=false;};},[projectId]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify({...safeJourneyState({step:q.id,acks}),details:safeDetailAcks(details)}));}catch{}},[q.id,acks,details,storageKey]);
 useEffect(()=>{onProgress?.({done:progress.done,total:progress.total,percent:progress.percent});},[progress.done,progress.total,progress.percent,onProgress]);
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
 function acknowledge(unit,value=!unit.done){setDetails(s=>({...s,[unit.key]:value}));if(q.kind==='guide'&&!q.field||q.kind==='manual')setAcks(s=>({...s,[q.id]:false}));}
 async function save(){if(busy)return false;setBusy(true);setError('');try{
  const snapshot=validateSetup(setup),r=await api({action:'save_build_setup',projectId,setupRevision:revision,setup:snapshot});setSetup(snapshot);setRevision(r.access.setup_revision);setBaseline(JSON.stringify(snapshot));setStatus('這一關的資料已保存到你的專案。');return true;
 }catch(e){setError(e.message);return false;}finally{setBusy(false);}}
 async function go(id){if(running&&id!=='automatic')return;if(dirty&&!await save())return;setStep(id);setError('');panel.current?.scrollIntoView({block:'start',behavior:'smooth'});}
 async function openEquipment(id){const group=groups.find(g=>g.id===id);if(!group)return;if(group.pages.length){const candidates=steps.filter((s,i)=>group.pages.includes(s.id)&&(firstOpen===-1||i<=firstOpen));const target=candidates.find(s=>s.id===q.id)||candidates.find(s=>!progress.pages.find(p=>p.id===s.id).complete)||candidates[0];if(target){if(dirty&&!await save())return;if(running&&target.id!=='automatic'){setSelectedEquipment(id);return;}setStep(target.id);}}setSelectedEquipment(id);}
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
 const canNext=units.every(d=>d.done);
 const allPrepared=steps.filter(s=>['field','guide','secret'].includes(s.kind)).every(s=>pageDetails(s,context).every(d=>d.done));
 const deployed=record?.status==='awaiting_acceptance';
 function detailControl(unit){
  const liveNeeded=q.kind==='manual'||q.kind==='acceptance',disabled=running||liveNeeded&&!deployed;
  if(unit.kind==='link'){
   const basicId=record?.target?.botBasicId||plan?.botBasicId;
   const href=unit.url||(q.id==='website'?record?.app_url:q.id==='lineMessage'&&basicId?'https://line.me/R/ti/p/'+encodeURIComponent(basicId):null);
   return <>{href&&!disabled?<a className="detail-link-button" href={href} target="_blank" rel="noreferrer" onClick={()=>acknowledge(unit,true)}>{unit.title} ↗</a>:<button disabled={disabled} aria-pressed={unit.done} onClick={()=>acknowledge(unit,true)}>{liveNeeded&&!deployed?'完成系統關卡後開啟':q.id==='lineMessage'?'我已在手機開啟自己的 OA':unit.title}</button>}{unit.done&&<button className="detail-reset" disabled={disabled} onClick={()=>acknowledge(unit,false)}>取消此項確認</button>}</>;
  }
  if(unit.kind==='confirm')return <button type="button" aria-pressed={unit.done} disabled={disabled} onClick={()=>acknowledge(unit)}>{unit.done?'✓ 已完成，點此取消':'我已完成這一項 ✓'}</button>;
  if(unit.kind==='field')return <label>{unit.label}<textarea rows={q.id==='messagingChannelId'?1:3} value={setup[unit.field]||''} maxLength={2000} placeholder={unit.hint} onChange={e=>change(unit.field,e.target.value)}/></label>;
  if(unit.kind==='credential')return <label>{unit.label}<input type="password" autoComplete="off" value={secrets[unit.field]} maxLength={q.id==='lineSecret'?32:6000} onChange={e=>change(unit.field,e.target.value,true)}/><small>僅留在目前頁面，未保存憑證原文。</small></label>;
  if(unit.kind==='save')return <button className="primary" disabled={busy||!units.find(d=>d.kind==='field')?.done} onClick={save}>{busy?'保存中…':unit.done?'✓ 已保存，再次保存':'保存這項資料'}</button>;
  if(unit.kind==='verify')return <><button disabled={busy||!allPrepared||Boolean(record)} onClick={verify}>{busy?'核對中…':unit.done?'✓ 本次帳號已核對':'核對本次帳號與授權'}</button>{(plan||record?.target)&&<dl>{[['GitHub',(plan||record.target).githubRepo],['Supabase',(plan||record.target).supabaseName],['LINE OA',(plan||record.target).botName]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>}</>;
  if(unit.kind==='consent')return <label className="generation-consent"><input type="checkbox" checked={consent||Boolean(record)} disabled={!plan||busy||Boolean(record)} onChange={e=>setConsent(e.target.checked)}/>我已確認目標帳號與設計，同意{job?.status==='draft_ready'?'沿用已保存的同版本草稿，不再扣 AI 次數':'使用本專案 1 次 AI 建置額度'}；檢查通過後公開發布網站、建立後端、將 LINE 金鑰寫入自己的 Supabase 並設定 Webhook。第三方用量費另計。</label>;
  if(unit.kind==='start')return <><button className="primary" disabled={busy||!consent||!ready||!credits||credits.remaining===0&&job?.status!=='draft_ready'||Boolean(record)} onClick={start}>確認任務，交給系統完成 →</button>{credits&&<p>本專案剩餘 {credits.remaining} 次。成功產生新草稿才使用一次，失敗不扣。</p>}</>;
  if(unit.kind==='accept')return <button className="primary" disabled={busy||!deployed||!units.filter(d=>d.kind!=='accept').every(d=>d.done)} onClick={accept}>{busy?'保存中…':unit.done?'✓ 實測回報已保存':'保存本頁實測回報 ✓'}</button>;
  if(unit.kind==='system')return <div className="quest-machine"><span aria-hidden="true">✦</span><h4>{deployed?'系統處理完成':error||['failed','interrupted'].includes(record?.status)?'任務需要協助':running?'你的點子，正在成形…':job?.status==='draft_ready'?'已有草稿，請重新核對授權':'等待確認本次任務'}</h4><button onClick={()=>setRefresh(v=>v+1)}>更新進度</button>{!running&&!record&&<button onClick={()=>setStep('review')}>回到任務確認</button>}<details><summary>需要協助時才展開的紀錄</summary><p>草稿：{job?.status||'尚未開始'}；部署：{record?.status||'尚未開始'}</p>{record?.error_code&&<p>{record.error_code}。已停止自動重試，請聯絡專員。</p>}{job?.artifact&&<><p>{job.artifact.summary}</p>{job.artifact.files.map(f=><details key={f.path}><summary>{f.path}</summary><pre>{f.content}</pre></details>)}</>}</details></div>;
  return null;
 }
 return <section className="quest-journey" aria-label="我的 LINE OA 闖關流程">
  <SecretaryRoom projectId={projectId} user={user} draft={draft} progress={progress} groups={groups} steps={steps} currentStep={q.id} firstOpen={firstOpen} running={running} selected={selectedEquipment} onOpen={openEquipment} onClose={()=>setSelectedEquipment(null)} onStep={async id=>{await go(id);setSelectedEquipment(equipmentForStep(id));}} onDesign={onDesign||(()=>location.assign('design.html?project='+encodeURIComponent(projectId)))}>
  <article className="quest-stage" ref={panel} aria-labelledby="quest-title"><div className="quest-stage-top"><span>{q.kind==='automatic'?'系統關卡':'你的關卡'} · {index+1} / {steps.length}</span><span>本頁 {units.filter(d=>d.done).length} / {units.length} 細項</span></div><h3 id="quest-title">{q.title}</h3>
   {guide&&<p>{guide.lead}</p>}
   <details className="stage-reference"><summary>完整教學圖與官方參考</summary>{guide?<><AccountScreen key={guide.id} guide={guide}/><p>{guide.note}</p><a href={guide.source} target="_blank" rel="noreferrer">查看官方教學 ↗</a></>:<GuideImage topic={q.id==='lineSecret'?'lineSecret':q.kind==='automatic'?'journeyAuto':q.topic}/>}</details>
   {q.id==='githubToken'&&githubMode==='app'?<GithubConnection api={api} projectId={projectId} state={github} units={units} onAcknowledge={acknowledge} onBeforeLaunch={async()=>!dirty||await save()} disabled={running} onRepository={url=>change('githubRepo',url)} onStatus={r=>{setGithub(r);setPlan(null);setReady(false);setConsent(false);if(r.connection)setSecrets(s=>({...s,githubToken:''}));}}/>:<div className="quest-detail-list">{units.map(unit=><QuestDetail key={unit.key} unit={unit}>{detailControl(unit)}</QuestDetail>)}</div>}
   {q.id==='githubToken'&&github?.configured&&<button className="detail-mode-switch" disabled={running} onClick={()=>{setManualGithub(v=>!v);setPlan(null);setReady(false);setConsent(false);}}>{manualGithub?'改用 GitHub App 連接':'需要其他方式？改用一次性限權 Token'}</button>}
   {q.id==='purpose'&&setup.runtimeAiProvider!=='none'&&<p className="notice">此專案先前選了營運 AI；目前自動部署尚不支援。<button onClick={()=>change('runtimeAiProvider','none')}>本次先改成不使用營運 AI</button></p>}
   {q.id==='messagingChannelId'&&<QuestDetail unit={{key:'contact',done:Boolean(setup.contactUrl),title:'客服 LINE 連結（選填）',text:'可貼聯絡專員的公開 LINE 連結；選填項目不影響百分比。',label:'已填入 · 隨本頁保存'}}><label>客服 LINE 連結<input type="url" value={setup.contactUrl} placeholder="https://line.me/ti/p/…" onChange={e=>change('contactUrl',e.target.value)}/></label></QuestDetail>}
   {q.kind==='review'&&<p className="footnote">本版支援靜態互動與固定文字回覆。營運 AI、健康檢測、資料庫功能與選單／LIFF 自動配置尚未支援，系統不會將它們標示為已完成。</p>}
   {q.kind==='manual'&&record?.webhook_url&&<p className="result-url">本次 Webhook：{record.webhook_url}</p>}
   {status&&<p role="status" className="notice">{status}</p>}{error&&<p role="alert" className="notice error">{error}</p>}
   <div className="wizard-actions"><button disabled={index===0||running} onClick={()=>go(steps[index-1].id)}>← 上一頁</button>{['field','secret','guide','manual'].includes(q.kind)&&<button className="primary" disabled={busy||!canNext} onClick={next}>本頁已完成，前往下一頁 →</button>}</div>
  </article>
  </SecretaryRoom>
  <p className="footnote">{dirty?'目前填寫尚未保存；請保存後再離開。':'細項操作記錄保留在這個瀏覽器；填寫資料由保存按鈕寫入專案。'} 已開啟連結、本人確認與伺服器驗證分開標示。</p>
  {finished&&<section className="quest-victory" role="status"><span aria-hidden="true">✦</span><h3>所有細項完成，100%！</h3><p>你的設定與本人實測回報已完成。仍可回到已解鎖的格子查看資料。</p>{record?.app_url&&<a href={record.app_url} target="_blank" rel="noreferrer">開啟我的網站 ↗</a>}</section>}
 </section>;
}
