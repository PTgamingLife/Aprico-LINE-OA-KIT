import React,{useEffect,useRef,useState} from 'react';
import {tutorialScene} from './tutorial-scenes.ts';
import {tutorialMedia,shotCamera} from './tutorial-media.ts';
import './tutorial-real.css';
export default function TutorialAnimation({unit,autoPlay=false,compact=false,suspended=false}){
 const root=useRef(null),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(autoPlay),[visible,setVisible]=useState(false),[reduced,setReduced]=useState(true),[size,setSize]=useState(null),[failed,setFailed]=useState(false);
 const scene=tutorialScene(unit),media=tutorialMedia(unit),local=scene.platform==='Aprico',active=playing&&visible&&!reduced&&!suspended;
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{threshold:.2});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!active||!media||!size||failed)return;const timer=setTimeout(()=>{if(frame===2)setPlaying(false);else setFrame(f=>f+1);},4500);return()=>clearTimeout(timer);},[active,frame,media?.file,Boolean(size),failed]);
 const source=media?.source||scene.source;
 function move(next){setPlaying(false);setFrame(next);}
 const box=media?.box||[0,0,100,100],zoom=frame===1;
 return <section ref={root} className={'tutorial-player real-tutorial '+(local?'tutorial-local ':'')+(compact?'compact ':'')+(active?'playing':'')} aria-label={unit.title+'實際畫面教學'}>
  <small className="tutorial-kind">{media?media.label:local?'本頁實際操作指引':'操作文字指引 · 截圖待補'}</small>
  {media&&!failed?<div className="tutorial-real-shot" data-tutorial-frame={frame}>
   <img className={size?'loaded':''} src={import.meta.env.BASE_URL+'tutorials/real/'+media.file} alt={scene.platform+'實際介面截圖：'+unit.title} loading="lazy" decoding="async" onLoad={e=>setSize({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})} onError={()=>setFailed(true)}/>
   {size&&<svg viewBox={shotCamera(size.w,size.h,box,zoom)} role="img" aria-label={unit.title+'：紅框標示操作位置'} preserveAspectRatio="xMidYMid meet"><image href={import.meta.env.BASE_URL+'tutorials/real/'+media.file} width={size.w} height={size.h}/>{frame<2&&<g className="tutorial-annotation"><rect x={box[0]*size.w/100} y={box[1]*size.h/100} width={box[2]*size.w/100} height={box[3]*size.h/100} rx={size.w*.009} fill="none" stroke="#d33c31" strokeWidth="3" vectorEffect="non-scaling-stroke"/><text x={(box[0]+box[2]-.5)*size.w/100} y={(box[1]+Math.min(box[3]/2,7))*size.h/100} fill="#d33c31" fontSize={size.w*.09} textAnchor="end" className="tutorial-real-pointer">↙</text></g>}</svg>}
  </div>:<p className="tutorial-shot-unavailable">{failed?'截圖暫時無法載入，請依下方指引操作。':local?'↑ 直接使用這一格上方的實際欄位或按鈕，不用另外打開教學。':'此細項尚無安全可公開的對應截圖；先依文字操作，不以模擬圖代替實拍。'}</p>}
  <div className="tutorial-narration"><small>{media?`第 ${frame+1} / 3 段 · ${['辨識實際頁面','查看操作位置','回 Aprico 完成此格'][frame]}`:scene.platform+' · '+unit.title}</small>{!compact&&<h4>{unit.title}</h4>}<p>{unit.text}</p>{frame===2&&media&&<p>完成後回到這一格，填寫、保存或確認結果；看完教學不會自動過關。</p>}</div>
  {media&&!failed&&<><div className="tutorial-controls"><button type="button" disabled={frame===0} aria-label="上一段教學" onClick={()=>move(frame-1)}>←</button><button type="button" className="primary" onClick={()=>{if(playing&&!reduced)setPlaying(false);else{if(frame===2)setFrame(0);setReduced(false);setPlaying(true);}}}>{active?'Ⅱ 暫停':frame===2?'↻ 重播':playing&&!reduced?'繼續播放':'▶ 播放'}</button><button type="button" disabled={frame===2} aria-label="下一段教學" onClick={()=>move(frame+1)}>→</button></div><div className="tutorial-segments" aria-label="教學片段">{[0,1,2].map(i=><button key={i} type="button" aria-label={`前往第 ${i+1} 段`} aria-current={frame===i?'step':undefined} onClick={()=>move(i)}>{i+1}</button>)}</div><details className="tutorial-provenance"><summary>截圖來源與畫面說明</summary><p className="tutorial-credit">{media.credit} · 截圖導覽＋本站紅框動畫（非操作錄影）</p>{media.note&&<p className="tutorial-safety">{media.note}</p>}</details></>}
  {source&&<a className="tutorial-source" href={source} target="_blank" rel="noreferrer">查看官方原始說明 ↗</a>}
 </section>;
}
