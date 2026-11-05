import React,{useRef} from 'react';
import TutorialAnimation from './TutorialAnimation.jsx';
import './quest-details.css';
export function DetailHelp({unit}){
 const dialog=useRef(null),[opened,setOpened]=React.useState(false);
 return <aside className="detail-help"><TutorialAnimation key={unit.key} unit={unit} autoPlay compact suspended={opened}/><button type="button" className="detail-zoom" onClick={()=>{setOpened(true);dialog.current?.showModal();}}>放大教學 ↗</button><dialog className="detail-dialog" ref={dialog} aria-label={unit.title+'動畫教學'} onClose={()=>setOpened(false)} onClick={e=>e.target===dialog.current&&dialog.current?.close()}><button type="button" className="detail-close" onClick={()=>dialog.current?.close()}>關閉教學 ×</button>{opened&&<TutorialAnimation unit={unit} autoPlay/>}</dialog></aside>;
}
export default function QuestDetail({unit,children}){
 return <section className={`quest-detail ${unit.done?'is-complete':''}`} aria-label={unit.title}><div className="detail-operation"><span className="detail-status">{unit.done?'✓ '+unit.label:'○ 待完成'}</span><h4>{unit.title}</h4>{children}</div><DetailHelp unit={unit}/></section>;
}
export function QuestProgress({value={done:0,total:0,percent:0}}){return <aside className="journey-meter" aria-label="建置總完成進度"><div><span>我的建置進度</span><p>{value.total?`${value.done} / ${value.total} 個細項已完成`:'登入並選擇專案後開始'}<small>完成一格，前進一點</small></p></div><strong aria-label={`總完成 ${value.percent}%`}>{value.percent}<span>%</span></strong><progress aria-label="細項完成百分比" max="100" value={value.percent}/></aside>;}
