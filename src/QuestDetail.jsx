import React,{useId,useRef} from 'react';
import TutorialAnimation from './TutorialAnimation.jsx';
import {tutorialScene} from './tutorial-scenes.ts';
import './quest-details.css';
export function DetailHelp({unit}){
 const dialog=useRef(null),scene=tutorialScene(unit),[opened,setOpened]=React.useState(false);
 return <aside className="detail-help"><div className="detail-thumbnail"><div className="detail-mini-phone" role="img" aria-label={unit.title+'的操作位置示意'}><small>{scene.platform} · 操作示意</small>{[scene.heading,scene.rows[scene.focus], '回 Aprico 繼續'].map((line,i)=><div className={i===1?'focus':''} key={i}>{line}</div>)}</div></div><p>{unit.text}</p><button type="button" className="detail-zoom" onClick={()=>{setOpened(true);dialog.current?.showModal();}}>▶ 播放教學／放大圖解</button><dialog className="detail-dialog" ref={dialog} aria-label={unit.title+'動畫教學'} onClose={()=>setOpened(false)} onClick={e=>e.target===dialog.current&&dialog.current?.close()}><button type="button" className="detail-close" onClick={()=>dialog.current?.close()}>關閉教學 ×</button>{opened&&<TutorialAnimation unit={unit} autoPlay/>}</dialog></aside>;
}
export default function QuestDetail({unit,children}){
 return <section className={`quest-detail ${unit.done?'is-complete':''}`} aria-label={unit.title}><div className="detail-operation"><span className="detail-status">{unit.done?'✓ '+unit.label:'○ 待完成'}</span><h4>{unit.title}</h4>{children}</div><DetailHelp unit={unit}/></section>;
}
export function QuestProgress({value={done:0,total:0,percent:0}}){return <aside className="journey-meter" aria-label="建置總完成進度"><div><span>我的建置進度</span><p>{value.total?`${value.done} / ${value.total} 個細項已完成`:'登入並選擇專案後開始'}<small>完成一格，前進一點</small></p></div><strong aria-label={`總完成 ${value.percent}%`}>{value.percent}<span>%</span></strong><progress aria-label="細項完成百分比" max="100" value={value.percent}/></aside>;}
