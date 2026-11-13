import React, { useEffect, useState } from 'react';
import { emptySetup, validateSetup } from './build-model.ts';
import PaymentPanel from './PaymentPanel.jsx';
import BuildJourney from './BuildJourney.jsx';
import { QuestProgress } from './QuestDetail.jsx';
import { buildReviewUrl } from './center-menu.ts';
import './build.css';
export default function BuildPanel({
  api,
  projectId,
  projectRevision,
  user,
  draft,
  pendingSaveRef,
  onDesign,
  openGithub,
}) {
  const [progress, setProgress] = useState({ done: 0, total: 0, percent: 0 });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [access, setAccess] = useState(null),
    [password, setPassword] = useState(''),
    [showPassword, setShowPassword] = useState(false),
    [contact, setContact] = useState(''),
    [error, setError] = useState('');
  const [reviewRequired, setReviewRequired] = useState(false);
  const [runtimeAvailable, setRuntimeAvailable] = useState(false);
  const [prefill, setPrefill] = useState('');
  async function prepare(r, live = () => true, retry = false) {
    const access = r.access;
    if (!live()) return;
    setReviewRequired(r.reviewRequired === true);
    setRuntimeAvailable(r.runtimeAvailable === true);
    if (
      !access ||
      r.reviewRequired ||
      !['audience', 'purpose', 'scenario', 'success', 'failure', 'human'].some(
        (k) => !access.setup?.[k]?.trim(),
      )
    ) {
      setAccess(access || null);
      setPrefill('');
      return;
    }
    setPrefill('loading');
    try {
      const result = await api({ action: 'prefill_build_setup', projectId, retry });
      if (live()) {
        setAccess(result.access || access);
        setPrefill(result.status);
      }
    } catch {
      if (live()) {
        setAccess(access);
        setPrefill('failed');
      }
    }
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const c = await api({ action: 'config' });
        if (live) setContact(c.contactUrl || '');
        if (!user || !projectId) return;
        await prepare(await api({ action: 'build_status', projectId }), () => live);
      } catch (e) {
        if (live) setError(e.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId, user]);
  async function unlocked() {
    await prepare(await api({ action: 'build_status', projectId }));
  }
  async function unlock(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api({ action: 'unlock_build', projectId, password });
      await unlocked();
    } catch (e) {
      setError(e.message);
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  async function retryPrefill() {
    if (pendingSaveRef.current && !(await pendingSaveRef.current())) return;
    setError('');
    try {
      await prepare(await api({ action: 'build_status', projectId }), () => true, true);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className={'card build-access ' + (access ? 'has-secretary-room' : '')}>
      {!access && (
        <>
          <QuestProgress value={progress} />
          <span className="pill">開通你的建置旅程</span>
          <h2>{draft.name || '我的 LINE OA 建置旅程'}</h2>
          <p>逐步完成任務，為男生或女生秘書穿上裝備。每一格都有圖文與可播放的教學。</p>
        </>
      )}
      <div className="access-buttons">
        {contact && (
          <a className="guide-link" href={contact} target="_blank" rel="noreferrer">
            聯絡專員 ↗
          </a>
        )}
      </div>
      {access && !reviewRequired && prefill && prefill !== 'loading' && (
        <p role="status" className="notice">
          {prefill === 'done'
            ? '服務文字已備好，可在各關確認與調整。'
            : prefill === 'running'
              ? '另一個分頁正在預填，可更新結果，或直接手動填寫。'
              : prefill === 'missing_goal'
                ? '回設計頁補上主要目標，即可產生預填建議。'
                : prefill === 'budget'
                  ? '預填服務目前額度不足，可先手動填寫。'
                  : '目前可先手動填寫建置文字。'}
          {['running', 'failed', 'budget', 'unavailable'].includes(prefill) && (
            <button type="button" onClick={retryPrefill}>
              {prefill === 'running' ? '更新預填結果' : '重新預填'}
            </button>
          )}
        </p>
      )}
      {prefill === 'loading' ? (
        <p role="status">AI 正依照設計目標準備建置文字…</p>
      ) : loading ? (
        <p role="status">正在找回你的專案進度…</p>
      ) : access && reviewRequired ? (
        <section className="payment-box">
          <h2>到 LINE 確認建置設計</h2>
          <p>
            付款已核對。開啟 Aprico
            聊天室並送出預填訊息，即可查看本專案的示意與流程，修改或確認後再回建置中心。
          </p>
          <p>
            <a className="guide-link" href={buildReviewUrl(projectId)}>
              回 LINE 查看核對卡 ↗
            </a>
          </p>
          <button type="button" onClick={() => location.reload()}>
            我已在 LINE 確認，重新載入
          </button>
        </section>
      ) : access ? (
        <BuildJourney
          key={projectId}
          api={api}
          projectId={projectId}
          projectRevision={projectRevision}
          draft={draft}
          initial={access.setup_revision > 0 ? validateSetup(access.setup) : emptySetup()}
          initialRevision={access.setup_revision}
          pendingSaveRef={pendingSaveRef}
          onProgress={setProgress}
          user={user}
          onDesign={onDesign}
          runtimeAvailable={runtimeAvailable}
          openGithub={openGithub}
        />
      ) : (
        <>
          {user && projectId ? (
            <>
              <PaymentPanel api={api} user={user} projectId={projectId} onUnlocked={unlocked} />
              <button disabled={busy} onClick={() => setShowPassword((v) => !v)}>
                使用專員開通密碼
              </button>
              {showPassword && (
                <form className="password-form" onSubmit={unlock}>
                  <label>
                    專員提供的開通密碼
                    <input
                      type="password"
                      autoComplete="off"
                      maxLength={256}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button className="primary" disabled={busy || !password}>
                    {busy ? '驗證中…' : '確認開通並開始闖關'}
                  </button>
                </form>
              )}
            </>
          ) : (
            <p>請先使用 LINE 登入，並在設計頁保存你的專案；完成後就能繼續旅程。</p>
          )}
          <div className="journey-intro">
            <span>① 確認設計</span>
            <i>→</i>
            <span>② 連接 GitHub</span>
            <i>→</i>
            <span>③ 連接 LINE</span>
            <i>→</i>
            <span>④ 連接 Supabase</span>
            <i>→</i>
            <span>⑤ 部署與驗收</span>
          </div>
          <p className="footnote">
            GitHub 可使用 App 限定專案授權；Supabase
            仍需完成部署授權。只有成功核對與完成的項目才會顯示相應狀態。
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
