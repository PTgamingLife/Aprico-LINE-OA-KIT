// 建置頁的教學彈窗與「打造前的說明」頁。內容在 build-guides.js。
import React, { useRef, useState } from 'react';
import { GUIDES, INTRO } from './build-guides.js';

// 教學：一顆小按鈕，打開這一小步的說明彈窗。
export function Guide({ id }) {
  const ref = useRef(null);
  const g = GUIDES[id];
  return (
    <>
      <button type="button" className="guide-btn" onClick={() => ref.current?.showModal()}>
        教學
      </button>
      <dialog ref={ref} className="guide" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <h3>{g.title}</h3>
        <p className="why">{g.why}</p>
        <ol>
          {g.steps.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        {g.link && (
          <a className="btn" href={g.link[1]} target="_blank" rel="noreferrer">
            {g.link[0]}
          </a>
        )}
        <button type="button" className="btn brand" onClick={() => ref.current?.close()}>
          知道了
        </button>
      </dialog>
    </>
  );
}

export const INTRO_KEY = 'aprico-build-intro';
export function Intro({ onStart }) {
  return (
    <div className="oaw-build oaw-intro">
      <img src="./mascot/secretary.png" alt="" />
      <h2>{INTRO.title}</h2>
      <p>{INTRO.lead}</p>
      {INTRO.parts.map(([icon, name, role, text]) => (
        <section key={name} className="part">
          <span aria-hidden="true">{icon}</span>
          <div>
            <b>{role}</b>
            <small>{name}</small>
            <p>{text}</p>
          </div>
        </section>
      ))}
      <section className="safe">
        <b>🔒 你的資料，只有你拿得到</b>
        <ul>
          {INTRO.safe.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
      <p className="oaw-note">{INTRO.ready}</p>
      <button type="button" className="btn brand" onClick={onStart}>
        開始打造
      </button>
    </div>
  );
}

// A step opens by itself when it is the next thing to do; its title also opens and closes it,
// so an earlier answer (like the account name) can always be looked at and changed.
export function Step({ n, title, done, open, children }) {
  const [manual, setManual] = useState(null);
  const shown = manual ?? open;
  return (
    <section className={`oaw-step${done ? ' done' : ''}${shown ? ' open' : ''}`}>
      <h2>
        <button type="button" className="step-toggle" aria-expanded={shown} onClick={() => setManual(!shown)}>
          <span className="num">{done ? '✓' : n}</span>
          {title}
          <span className="chev" aria-hidden="true">
            {shown ? '收合' : '展開'}
          </span>
        </button>
      </h2>
      {shown && <div className="body">{children}</div>}
    </section>
  );
}
