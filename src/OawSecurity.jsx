// Owner protection for an OA the customer built: emergency lock, unlock with GitHub, and
// ownership recovery (new owner from a 6-digit code made and sealed in this browser).
// Opened as build.html?security=1, e.g. from the 「鎖定我的 OA」 reply.
import React, { useEffect, useRef, useState } from 'react';
import { seal } from './OawBuild.jsx';
import { updatePhase } from './OawUpdate.jsx';
import './oaw-build.css';

export const SECURITY_FLAG = 'aprico-oaw-security';
const CODE_KEY = 'aprico-oaw-recover';
const store = {
  get: (k) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v);
    } catch {}
  },
};
const newCode = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');

export default function OawSecurity({ api, projectId }) {
  const [state, setState] = useState(null);
  const [gh, setGh] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [recovery, setRecovery] = useState(() => {
    try {
      return JSON.parse(store.get(CODE_KEY)) || null;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState(null);
  const [done, setDone] = useState(false);
  const timer = useRef(null);

  async function refresh() {
    const [s, g] = await Promise.all([
      api({ action: 'oaw_security_status', projectId }).catch(() => null),
      api({ action: 'github_status', projectId }).catch(() => null),
    ]);
    setState(s);
    setGh(g);
    if (recovery) setStatus(await api({ action: 'oaw_build_status', projectId }).catch(() => null));
  }
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      if (e.code === 'github_binding_required') await refresh();
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const lock = () =>
    confirm('鎖定後，你的官方帳號管理功能會全部暫停，解鎖需要 GitHub 驗證。確定鎖定？') &&
    run(() => api({ action: 'oaw_lock', projectId }));
  const unlock = () => run(() => api({ action: 'oaw_unlock', projectId }));
  const recover = () =>
    confirm('找回老闆身分會清除目前的老闆與 PIN，改由新的綁定碼綁定。確定繼續？') &&
    run(async () => {
      const code = newCode();
      const key = await api({ action: 'oaw_recover_key', projectId });
      const sealed = await seal(key.key, { OAW_BIND_CODE: code });
      const r = await api({
        action: 'oaw_recover',
        projectId,
        keyId: key.keyId,
        code: sealed.OAW_BIND_CODE,
      });
      const rec = { code, startedAt: r.startedAt };
      store.set(CODE_KEY, JSON.stringify(rec));
      setRecovery(rec);
    });

  useEffect(() => {
    store.set(SECURITY_FLAG, '1');
    if (projectId) refresh();
    return () => clearInterval(timer.current);
  }, [projectId]);
  const phase = updatePhase(status, recovery?.startedAt);
  useEffect(() => {
    clearInterval(timer.current);
    if (recovery && phase === 'running') timer.current = setInterval(refresh, 10000);
    if (phase === 'done' && !done)
      api({ action: 'oaw_build_finish', projectId })
        .catch(() => {})
        .finally(() => setDone(true));
  }, [phase, recovery]);

  const connected = Boolean(gh?.connection);
  const locked = state?.locked;
  const errorBox = error && (
    <p className="oaw-error">
      {error.message}
      {error.url && (
        <>
          {' '}
          <a href={error.url} target="_blank" rel="noreferrer">
            前往 GitHub 同意 ↗
          </a>
        </>
      )}
    </p>
  );

  return (
    <div className="oaw-build">
      <section className="oaw-step open">
        <h2>
          <span className="num">{locked ? '🔒' : '✓'}</span>
          {locked ? '管理功能已鎖定' : '管理功能正常'}
        </h2>
        <div className="body">
          <p className="oaw-note">
            LINE 帳號可能被盜時，先按緊急鎖定：老闆的所有功能立刻暫停，客人那邊照常運作。也可以在
            Aprico 官方帳號傳「鎖定我的 OA」。
          </p>
          {!locked && (
            <button className="btn brand" type="button" disabled={busy || !state} onClick={lock}>
              緊急鎖定
            </button>
          )}
        </div>
      </section>

      <section className={`oaw-step${connected ? ' done' : ' open'}`}>
        <h2>
          <span className="num">{connected ? '✓' : '1'}</span>用 GitHub 證明你是擁有者
        </h2>
        {!connected && (
          <div className="body">
            <p className="oaw-note">
              解鎖或找回老闆身分前，需要授權你的官方帳號 repo，完成後自動收回。
            </p>
            <a className="btn" href={gh?.installationUrl} target="_blank" rel="noreferrer">
              安裝 Aprico App ↗
            </a>
            {gh?.flow?.choices?.length ? (
              gh.flow.choices.map((r) => (
                <button
                  key={r.repositoryId}
                  className="btn brand"
                  type="button"
                  onClick={() =>
                    run(() =>
                      api({
                        action: 'github_select',
                        projectId,
                        flowId: gh.flow.id,
                        repositoryId: r.repositoryId,
                      }),
                    )
                  }
                >
                  使用 {r.fullName}
                </button>
              ))
            ) : (
              <button
                className="btn brand"
                type="button"
                onClick={() => api({ action: 'github_begin', projectId })}
              >
                連接 GitHub
              </button>
            )}
          </div>
        )}
      </section>

      {connected && !recovery && (
        <section className="oaw-step open">
          <h2>
            <span className="num">2</span>選擇要做的事
          </h2>
          <div className="body">
            <p className="oaw-note">驗證的 repo：{gh.connection.full_name}</p>
            {locked && (
              <button className="btn brand" type="button" disabled={busy} onClick={unlock}>
                解除鎖定
              </button>
            )}
            <button className="btn" type="button" disabled={busy} onClick={recover}>
              找回老闆身分（換新的 LINE 帳號或忘記 PIN）
            </button>
            {errorBox}
          </div>
        </section>
      )}

      {recovery && (
        <section className="oaw-step open">
          <h2>
            <span className="num">2</span>新的綁定碼
          </h2>
          <div className="body">
            <p className="oaw-code">{recovery.code}</p>
            <p>
              用要當老闆的 LINE 帳號，在你的官方帳號傳這 6 位數（24
              小時內有效）。請先抄下來，這組碼不會再顯示。
            </p>
            <p className="oaw-note">
              {phase === 'done'
                ? done
                  ? '✓ 已重設，GitHub 授權已收回。現在可以傳綁定碼了。'
                  : '已重設，正在收回 GitHub 授權…'
                : phase === 'failed'
                  ? '重設沒有成功，請稍後再試一次。'
                  : '正在重設老闆（約 3–5 分鐘）…完成前傳綁定碼不會生效。'}
            </p>
            {(done || phase === 'failed') && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  store.set(CODE_KEY, null);
                  store.set(SECURITY_FLAG, null);
                  setRecovery(null);
                }}
              >
                我已抄下，關閉
              </button>
            )}
          </div>
        </section>
      )}
      {!connected && errorBox}
    </div>
  );
}
