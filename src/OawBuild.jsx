import React, { useEffect, useRef, useState } from 'react';
import {
  KEY_FIELDS,
  SETUP_STEPS,
  TEMPLATE_REPO,
  buildPhase,
  cleanKey,
  initialConfig,
} from './oaw-build-model.ts';
import './oaw-build.css';

const ANSWERS_KEY = 'aprico-oaw-answers';
const loadAnswers = () => {
  try {
    return JSON.parse(sessionStorage.getItem(ANSWERS_KEY)) || {};
  } catch {
    return {};
  }
};

/** GitHub wants each secret sealed with the repo's public key (libsodium sealed box). */
async function seal(publicKey, values) {
  const { default: sodium } = await import('libsodium-wrappers');
  await sodium.ready;
  const key = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      sodium.to_base64(
        sodium.crypto_box_seal(sodium.from_string(v), key),
        sodium.base64_variants.ORIGINAL,
      ),
    ]),
  );
}

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

export default function OawBuild({ api, projectId }) {
  const [gate, setGate] = useState('loading'); // loading | unpaid | ready
  const [gh, setGh] = useState(null);
  const [answers, setAnswers] = useState({
    template: 'general',
    oaName: '',
    goal: '',
    ...loadAnswers(),
  });
  const [keys, setKeys] = useState({});
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [removed, setRemoved] = useState(false);
  const timer = useRef(null);

  async function refresh() {
    const [g, s] = await Promise.all([
      api({ action: 'github_status', projectId }).catch(() => null),
      api({ action: 'oaw_build_status', projectId }).catch((e) => ({ error: e })),
    ]);
    setGh(g);
    if (s?.error?.code === 'subscription_required') return setGate('unpaid');
    setGate('ready');
    if (!s?.error) setStatus(s);
  }
  useEffect(() => {
    if (projectId) refresh();
    return () => clearInterval(timer.current);
  }, [projectId]);
  useEffect(() => sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers)), [answers]);

  const phase = buildPhase(status);
  useEffect(() => {
    clearInterval(timer.current);
    if (phase === 'running') timer.current = setInterval(refresh, 10000);
    if (phase === 'done' && !removed)
      api({ action: 'oaw_build_finish', projectId })
        .then(() => setRemoved(true))
        .catch(() => {});
  }, [phase]);

  const answered = answers.oaName.trim() && answers.goal.trim();
  const connected = Boolean(gh?.connection);
  const keysOk = KEY_FIELDS.every((f) => cleanKey(f.name, keys[f.name]));

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const k = await api({ action: 'oaw_build_key', projectId });
      const plain = Object.fromEntries(
        KEY_FIELDS.map((f) => [f.name, cleanKey(f.name, keys[f.name])]),
      );
      const secrets = await seal(k.key, plain);
      await api({
        action: 'oaw_build_start',
        projectId,
        keyId: k.keyId,
        secrets,
        template: answers.template,
        config: initialConfig(answers),
      });
      setKeys({}); // nothing secret stays in the page
      setStatus({ run: { status: 'queued' }, steps: {} });
      setTimeout(refresh, 8000);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!projectId) return <p className="oaw-note">請先建立或選擇一個專案。</p>;
  if (gate === 'loading') return <p className="oaw-note">讀取中…</p>;

  return (
    <div className="oaw-build">
      <Step n="1" title="訂閱月費" done={gate === 'ready'} open={gate === 'unpaid'}>
        <p>月費 NT$370，包含 AI 秘書與介面修改的使用額度。</p>
        <p className="oaw-note">線上訂閱即將開放，目前請聯絡 Aprico 開通。</p>
      </Step>

      <Step
        n="2"
        title="這個帳號要做什麼？"
        done={gate === 'ready' && answered}
        open={gate === 'ready' && !connected}
      >
        <div className="seg">
          {[
            ['general', '一般官方帳號'],
            ['health', '個人健康秘書'],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={answers.template === v ? 'on' : ''}
              onClick={() => setAnswers({ ...answers, template: v })}
            >
              {l}
            </button>
          ))}
        </div>
        <label>
          官方帳號名稱
          <input
            value={answers.oaName}
            maxLength={40}
            placeholder="例如：小美的甜點店"
            onChange={(e) => setAnswers({ ...answers, oaName: e.target.value })}
          />
        </label>
        <label>
          用一句話說你的目標
          <textarea
            value={answers.goal}
            maxLength={200}
            rows={3}
            placeholder="例如：讓客人方便預約和查詢營業時間"
            onChange={(e) => setAnswers({ ...answers, goal: e.target.value })}
          />
        </label>
      </Step>

      <Step
        n="3"
        title="建立你的 GitHub 專案"
        done={connected}
        open={gate === 'ready' && answered && !connected}
      >
        <ol>
          <li>
            <a className="btn" href={TEMPLATE_REPO} target="_blank" rel="noreferrer">
              從 Aprico 範本建立 ↗
            </a>
            <small>名稱自取，選 Public。</small>
          </li>
          <li>
            <a className="btn" href={gh?.installationUrl} target="_blank" rel="noreferrer">
              安裝 Aprico App ↗
            </a>
            <small>選「Only select repositories」，只勾剛建立的 repo。</small>
          </li>
          <li>
            {gh?.flow?.choices?.length ? (
              gh.flow.choices.map((r) => (
                <button
                  key={r.repositoryId}
                  className="btn brand"
                  type="button"
                  disabled={busy}
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
        n="4"
        title="貼上金鑰並開始建置"
        done={phase !== 'idle'}
        open={connected && (phase === 'idle' || phase === 'failed')}
      >
        <p className="oaw-note">金鑰會在你的手機上加密後才送出，Aprico 看不到內容，也不會保存。</p>
        {KEY_FIELDS.map((f) => (
          <label key={f.name}>
            {f.label}
            <input
              value={keys[f.name] || ''}
              autoComplete="off"
              spellCheck={false}
              className={keys[f.name] && !cleanKey(f.name, keys[f.name]) ? 'bad' : ''}
              onChange={(e) => setKeys({ ...keys, [f.name]: e.target.value })}
            />
            <small>{f.hint}</small>
          </label>
        ))}
        <button className="btn brand" type="button" disabled={!keysOk || busy} onClick={start}>
          {busy ? '加密並送出中…' : '開始建置'}
        </button>
        {phase === 'failed' && (
          <p className="oaw-error">
            上一次建置沒有完成，確認金鑰後再試一次。
            {status?.run?.url && (
              <a href={status.run.url} target="_blank" rel="noreferrer">
                {' '}
                查看紀錄 ↗
              </a>
            )}
          </p>
        )}
      </Step>

      <Step n="5" title="建置中" done={phase === 'done'} open={phase === 'running'}>
        <ul className="progress">
          {SETUP_STEPS.map(([k, l]) => (
            <li key={k} className={status?.steps?.[k] ? 'ok' : ''}>
              {l}
            </li>
          ))}
        </ul>
        <p className="oaw-note">大約 2–3 分鐘，可以先離開，回來會接著顯示進度。</p>
      </Step>

      <Step n="6" title="最後兩件事" done={false} open={phase === 'done'}>
        <ol>
          <li>
            到{' '}
            <a href="https://manager.line.biz" target="_blank" rel="noreferrer">
              LINE 官方帳號後台 ↗
            </a>
            ：回應設定 → 開啟「Webhook」、關閉「自動回應訊息」。
          </li>
          <li>
            回 Aprico 官方 LINE 傳「連接我的OA」，按卡片選你的官方帳號送出，就完成了。
            <button
              className="btn brand"
              type="button"
              onClick={() =>
                window.liff
                  ?.sendMessages?.([{ type: 'text', text: '連接我的OA' }])
                  .then(() => window.liff.closeWindow())
                  .catch(() => navigator.clipboard?.writeText('連接我的OA'))
              }
            >
              傳「連接我的OA」
            </button>
          </li>
        </ol>
        {status?.basicId && <p className="oaw-note">你的官方帳號：{status.basicId}</p>}
        {removed && <p className="oaw-note">✓ Aprico 已移除對你 GitHub 的存取。</p>}
      </Step>

      {error && (
        <p className="oaw-error">
          {error.message}
          {error.url && (
            <a href={error.url} target="_blank" rel="noreferrer">
              {' '}
              前往同意 ↗
            </a>
          )}
        </p>
      )}
    </div>
  );
}
