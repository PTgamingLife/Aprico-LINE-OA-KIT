// Template update for an OA the customer already built: authorise once, review conflicts,
// apply, then the App is removed again. Opened from the 版本更新 card (build.html?update=1).
import React, { useEffect, useRef, useState } from 'react';
import RELEASE from '../supabase/functions/_shared/oaw-release.json';
import './oaw-build.css';

export const UPDATE_FLAG = 'aprico-oaw-update';
const STARTED = 'aprico-oaw-update-started';
const read = (k) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v);
  } catch {}
};

function Step({ n, title, done, open, children }) {
  return (
    <section className={`oaw-step${done ? ' done' : ''}${open ? ' open' : ''}`}>
      <h2>
        <span className="num">{done ? '✓' : n}</span>
        {title}
      </h2>
      {open && <div className="body">{children}</div>}
    </section>
  );
}

/** Progress of the setup run started by the update (older runs do not count). */
export function updatePhase(status, startedAt) {
  if (!startedAt) return 'idle';
  const run = status?.run;
  const fresh = run?.startedAt && Date.parse(run.startedAt) >= Date.parse(startedAt) - 60000;
  if (!fresh || run.status !== 'completed') return 'running';
  return run.conclusion === 'success' && status.ok ? 'done' : 'failed';
}

export default function OawUpdate({ api, projectId }) {
  const [gate, setGate] = useState('loading'); // loading | unpaid | ready
  const [gh, setGh] = useState(null);
  const [plan, setPlan] = useState(null);
  const [choices, setChoices] = useState({});
  const [startedAt, setStartedAt] = useState(read(STARTED));
  const [status, setStatus] = useState(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  async function refresh() {
    const [b, g] = await Promise.all([
      api({ action: 'sub_status' }).catch(() => null),
      api({ action: 'github_status', projectId }).catch(() => null),
    ]);
    setGh(g);
    if (!b?.quota?.paid) return setGate('unpaid');
    setGate('ready');
    if (startedAt)
      setStatus(await api({ action: 'oaw_build_status', projectId }).catch(() => null));
  }
  async function check() {
    setBusy(true);
    setError(null);
    try {
      setPlan(await api({ action: 'oaw_update_plan', projectId }));
    } catch (e) {
      // A stale binding was closed on the server: go back to the authorise step.
      if (e.code === 'github_binding_required') return void (await refresh());
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const r = await api({ action: 'oaw_update_apply', projectId, choices });
      write(STARTED, r.startedAt);
      setStartedAt(r.startedAt);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    await api({ action: 'oaw_build_finish', projectId }).catch(() => {});
    write(STARTED, null);
    write(UPDATE_FLAG, null);
    setRemoved(true);
  }

  useEffect(() => {
    write(UPDATE_FLAG, '1');
    if (projectId) refresh();
    return () => clearInterval(timer.current);
  }, [projectId]);
  const connected = Boolean(gh?.connection);
  useEffect(() => {
    if (gate === 'ready' && connected && !plan && !startedAt) check();
  }, [gate, connected]);

  const phase = updatePhase(status, startedAt);
  useEffect(() => {
    clearInterval(timer.current);
    if (startedAt && phase !== 'done' && phase !== 'failed')
      timer.current = setInterval(refresh, 10000);
    if (phase === 'done' && !removed) finish();
  }, [phase, startedAt]);

  const conflicts = plan?.conflicts ?? [];
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
      <Step n="1" title={`版本更新 ${RELEASE.version}`} done={false} open>
        <ul className="oaw-notes">
          {RELEASE.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="oaw-note">
          只更新程式，不會動到你的選單、AI 秘書設定、健康設定與所有紀錄。更新免費。
        </p>
      </Step>

      {gate === 'unpaid' && (
        <p className="oaw-notice">
          更新需要有效的訂閱。
          <a href="build.html?renew=1">前往續訂</a>
        </p>
      )}

      <Step
        n="2"
        title="授權 GitHub（更新完自動收回）"
        done={connected || removed}
        open={gate === 'ready' && !connected && !removed}
      >
        <ol>
          <li>
            <a className="btn" href={gh?.installationUrl} target="_blank" rel="noreferrer">
              安裝 Aprico App ↗
            </a>
            <small>選「Only select repositories」，只勾你的官方帳號 repo。</small>
          </li>
          <li>
            {gh?.flow?.choices?.length ? (
              gh.flow.choices.map((r) => (
                <button
                  key={r.repositoryId}
                  className="btn brand"
                  type="button"
                  onClick={() =>
                    api({
                      action: 'github_select',
                      projectId,
                      flowId: gh.flow.id,
                      repositoryId: r.repositoryId,
                    }).then(refresh)
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
          </li>
        </ol>
      </Step>

      <Step
        n="3"
        title="檢查並更新"
        done={Boolean(startedAt) || removed}
        open={connected && !startedAt && !removed}
      >
        <p className="oaw-note">
          更新到：{gh?.connection?.full_name}{' '}
          <button
            type="button"
            className="link"
            onClick={() =>
              api({ action: 'github_disconnect', projectId }).then(() => {
                setPlan(null);
                setError(null);
                refresh();
              })
            }
          >
            換一個 repo
          </button>
        </p>
        {!plan && !error && <p className="oaw-note">{busy ? '比對中…' : '準備比對你的專案'}</p>}
        {plan?.upToDate && (
          <>
            <p>已經是最新版本，不需要更新。</p>
            <button className="btn brand" type="button" onClick={finish}>
              完成並收回授權
            </button>
          </>
        )}
        {plan && !plan.upToDate && (
          <>
            <p>
              {plan.current ? `目前 ${plan.current} → ` : ''}新版 {plan.version}：{plan.changes}{' '}
              個檔案會更新。
            </p>
            {conflicts.length > 0 && (
              <>
                <p className="oaw-note">
                  下面 {conflicts.length} 個檔案你自己改過。預設保留你的版本（那個檔案就不更新）。
                </p>
                {conflicts.map((c) => (
                  <label key={c.path} className="oaw-conflict">
                    <span>
                      {c.path}
                      <small>
                        {c.kind === 'deleted' ? '（你刪除了這個檔案）' : '（你修改過）'}
                      </small>
                    </span>
                    <span className="seg">
                      {[
                        ['keep', '保留我的'],
                        ['take', '換成新版'],
                      ].map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          className={(choices[c.path] ?? 'keep') === v ? 'on' : ''}
                          onClick={() => setChoices({ ...choices, [c.path]: v })}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  </label>
                ))}
              </>
            )}
            <button className="btn brand" type="button" disabled={busy} onClick={apply}>
              {busy ? '更新中…' : '開始更新'}
            </button>
          </>
        )}
        {errorBox}
      </Step>

      <Step n="4" title="部署新版本" done={removed} open={Boolean(startedAt) && !removed}>
        {phase === 'running' && <p>正在部署，約 3–5 分鐘，可以先離開這頁。</p>}
        {phase === 'failed' && (
          <>
            <p className="oaw-error">部署沒有成功，你的設定沒有變動。</p>
            {status?.run?.url && (
              <a className="btn" href={status.run.url} target="_blank" rel="noreferrer">
                查看 GitHub 紀錄 ↗
              </a>
            )}
          </>
        )}
      </Step>
      {removed && <p className="oaw-notice">✓ 更新完成，已收回 Aprico 的 GitHub 授權。</p>}
    </div>
  );
}
