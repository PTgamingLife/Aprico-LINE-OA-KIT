import React, { useEffect, useRef, useState } from 'react';
import {
  KEY_FIELDS,
  SETUP_STEPS,
  TEMPLATE_REPO,
  buildPhase,
  cleanKey,
  initialConfig,
} from './oaw-build-model.ts';
import { GUIDES } from './build-guides.js';
import { Guide, Intro, INTRO_KEY } from './BuildGuide.jsx';
import './oaw-build.css';
import './build-sky.css';

const ANSWERS_KEY = 'aprico-oaw-answers';
const loadAnswers = () => {
  try {
    return JSON.parse(sessionStorage.getItem(ANSWERS_KEY)) || {};
  } catch {
    return {};
  }
};

/** GitHub wants each secret sealed with the repo's public key (libsodium sealed box). */
export async function seal(publicKey, values) {
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

// A step opens by itself when it is the next thing to do; its title also opens and closes it,
// so an earlier answer (like the account name) can always be looked at and changed.
function Step({ n, title, done, open, children }) {
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

export default function OawBuild({ api, projectId, projectName = '' }) {
  const [gate, setGate] = useState('loading'); // loading | unpaid | ready
  const [gh, setGh] = useState(null);
  const [answers, setAnswers] = useState({
    template: 'general',
    oaName: '',
    goal: '',
    ...loadAnswers(),
  });
  // Until the member types a name, the account takes the project's name (and the step shows ✓).
  useEffect(() => {
    if (projectName) setAnswers((a) => (a.oaName.trim() ? a : { ...a, oaName: projectName.slice(0, 40) }));
  }, [projectName]);
  const [keys, setKeys] = useState({});
  const [sbRef, setSbRef] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [removed, setRemoved] = useState(false);
  const timer = useRef(null);
  const [billing, setBilling] = useState(null);
  const params = new URLSearchParams(location.search);
  const [billingOpen, setBillingOpen] = useState(params.has('renew') || params.has('topup'));
  const [notice, setNotice] = useState('');
  const [intro, setIntro] = useState(() => {
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch {
      return false;
    }
  });

  async function refresh() {
    const [b, g, s] = await Promise.all([
      api({ action: 'sub_status' }).catch(() => null),
      api({ action: 'github_status', projectId }).catch(() => null),
      api({ action: 'oaw_build_status', projectId }).catch((e) => ({ error: e })),
    ]);
    setGh(g);
    setBilling(b);
    if (!b?.quota?.paid || s?.error?.code === 'subscription_required') return setGate('unpaid');
    setGate('ready');
    if (!s?.error) setStatus(s);
  }
  async function pay(product) {
    setBusy(true);
    setError(null);
    try {
      const r = await api({ action: 'sub_create', product });
      if (r.order?.paymentUrl) location.href = r.order.paymentUrl;
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  // Back from LINE Pay: confirm once, then clean the address bar.
  useEffect(() => {
    const order = params.get('order');
    const kind = params.get('pay');
    if (!kind?.startsWith('sub')) return;
    const url = new URL(location.href);
    ['pay', 'order', 'transactionId', 'orderId'].forEach((k) => url.searchParams.delete(k));
    history.replaceState(history.state, '', url);
    if (kind === 'sub-cancel') return setNotice('付款已取消，沒有扣款。');
    setNotice('正在核對付款…');
    api({ action: 'sub_confirm', orderId: order })
      .then((r) => {
        setNotice(
          r.order?.status === 'paid'
            ? '✓ 付款完成，已開通。'
            : r.order?.status === 'test_paid'
              ? '測試付款完成（沙盒模式不會開通）。'
              : '付款尚未完成。',
        );
        refresh();
      })
      .catch((e) => setNotice(e.message));
  }, []);
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

  const answered = Boolean(answers.oaName.trim());
  const connected = Boolean(gh?.connection);
  const keyOk = (...names) => names.every((n) => cleanKey(n, keys[n]));
  const lineOk = keyOk('OAW_LINE_MSG_ID', 'OAW_LINE_MSG_SECRET', 'OAW_LINE_LOGIN_ID', 'OAW_LINE_LOGIN_SECRET');
  const sbOk = keyOk('SUPABASE_ACCESS_TOKEN');
  const idle = phase === 'idle' || phase === 'failed';
  const field = (name, label) => {
    const f = KEY_FIELDS.find((k) => k.name === name);
    return (
      <label key={name}>
        {label || f.label}
        <input
          value={keys[name] || ''}
          autoComplete="off"
          spellCheck={false}
          className={keys[name] && !cleanKey(name, keys[name]) ? 'bad' : ''}
          onChange={(e) => setKeys({ ...keys, [name]: e.target.value })}
        />
        {keys[name] && !cleanKey(name, keys[name]) && <small>格式不太對，請再複製一次。</small>}
      </label>
    );
  };
  const keysOk =
    KEY_FIELDS.every((f) => cleanKey(f.name, keys[f.name])) &&
    (!sbRef.trim() || /^[a-z]{20}$/.test(sbRef.trim()));

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
        sbRef: sbRef.trim(),
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
  // First visit: explain in plain words why the secretary lives in the member's own accounts.
  if (intro && !connected && phase === 'idle' && !billingOpen)
    return (
      <Intro
        onStart={() => {
          try {
            localStorage.setItem(INTRO_KEY, '1');
          } catch {
            // Shown again next time; harmless.
          }
          setIntro(false);
          scrollTo(0, 0);
        }}
      />
    );

  return (
    <div className="oaw-build">
      {notice && <p className="oaw-notice">{notice}</p>}
      <Step n="1" title="訂閱月費" done={gate === 'ready'} open={gate === 'unpaid' || billingOpen}>
        {billing?.quota?.paid ? (
          <p>
            訂閱到 {billing.quota.paidUntil}，本月額度剩 {billing.quota.percentLeft}%
            {billing.quota.extraTwdLeft ? `，加值餘額 NT$${billing.quota.extraTwdLeft}` : ''}。
          </p>
        ) : (
          <p>包含 AI 秘書、每日整理與介面修改的使用額度，用 LINE Pay 付款。</p>
        )}
        <div className="plans">
          <button
            className="btn brand"
            type="button"
            disabled={busy || !billing?.available}
            onClick={() => pay('month')}
          >
            {billing?.quota?.paid ? '續訂 1 個月' : '月繳'} NT$180
          </button>
          <button
            className="btn brand"
            type="button"
            disabled={busy || !billing?.available}
            onClick={() => pay('year')}
          >
            {billing?.quota?.paid ? '續訂 1 年' : '年繳'} NT$1,800（多送 2 個月）
          </button>
        </div>
        {billing?.quota?.paid && (
          <div className="plans">
            <button className="btn" type="button" disabled={busy} onClick={() => pay('topup30')}>
              加值 NT$30
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => pay('topup50')}>
              加值 NT$50
            </button>
          </div>
        )}
        {billing && !billing.available && (
          <p className="oaw-note">LINE Pay 暫時無法使用，請聯絡 Aprico。</p>
        )}
        {billing?.mode === 'sandbox' && (
          <p className="oaw-note">目前是 LINE Pay 測試模式，付款不會開通。</p>
        )}
      </Step>
      {gate === 'ready' && !billingOpen && (
        <button type="button" className="link" onClick={() => setBillingOpen(true)}>
          續訂或加值
        </button>
      )}

      <Step
        n="2"
        title="幫你的秘書設定一個名字"
        done={gate === 'ready' && answered}
        open={gate === 'ready' && !connected}
      >
        <label>
          秘書的名字
          <input
            value={answers.oaName}
            maxLength={40}
            placeholder="例如：小美的 AI 秘書"
            onChange={(e) => setAnswers({ ...answers, oaName: e.target.value })}
          />
        </label>
        {answers.oaName.trim() && <p className="oaw-note">✓ 已填好，可以繼續下一步。之後還可以再改。</p>}
      </Step>

      <Step
        n="3"
        title="準備秘書的家（GitHub）"
        done={connected}
        open={gate === 'ready' && answered && !connected}
      >
        <ol>
          <li>
            <div className="sub">
              <a className="btn" href={TEMPLATE_REPO} target="_blank" rel="noreferrer">
                從 Aprico 範本建立 ↗
              </a>
              <Guide id="repo" />
            </div>
            <small>名稱自取（英文），選 Public。</small>
          </li>
          <li>
            <div className="sub">
              {gh?.installationUrl ? (
                <a className="btn" href={gh.installationUrl} target="_blank" rel="noreferrer">
                  安裝程序小助手 ↗
                </a>
              ) : (
                <button className="btn" type="button" onClick={refresh}>
                  安裝程序小助手（重新讀取）
                </button>
              )}
              <Guide id="app" />
            </div>
            <small>
              {gh?.installationUrl
                ? '選「Only select repositories」，只勾剛建立的那一個。'
                : '還沒讀到連線資料，按一下重新讀取；還是不行請重新整理這一頁。'}
            </small>
          </li>
          <li>
            <div className="sub">
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
              <Guide id="connect" />
            </div>
          </li>
        </ol>
      </Step>

      <Step
        n="4"
        title="建立你的 LINE 官方帳號"
        done={lineOk || !idle}
        open={connected && idle && !lineOk}
      >
        <p className="oaw-note">代碼會在你的手機上加密後才送出，Aprico 看不到內容，也不會保存。</p>
        <ol>
          <li>
            <div className="sub">
              <a className="btn" href={GUIDES.oa.link[1]} target="_blank" rel="noreferrer">
                建立 LINE 官方帳號 ↗
              </a>
              <Guide id="oa" />
            </div>
            <small>免費。建好後在後台「設定 → Messaging API」按啟用。</small>
          </li>
          <li>
            <div className="sub">
              <a className="btn" href={GUIDES.msg.link[1]} target="_blank" rel="noreferrer">
                打開 LINE Developers ↗
              </a>
              <Guide id="msg" />
            </div>
            <small>複製官方帳號（Messaging API）的兩組代碼。</small>
            {field('OAW_LINE_MSG_ID')}
            {field('OAW_LINE_MSG_SECRET')}
          </li>
          <li>
            <div className="sub">
              <b>建立 LINE Login</b>
              <Guide id="login" />
            </div>
            <small>同一個服務提供者底下新增 LINE Login，並改成 Published。</small>
            {field('OAW_LINE_LOGIN_ID')}
            {field('OAW_LINE_LOGIN_SECRET')}
          </li>
        </ol>
      </Step>

      <Step
        n="5"
        title="建立秘書的記憶（Supabase 資料庫）"
        done={sbOk || !idle}
        open={connected && idle && lineOk && !sbOk}
      >
        <div className="sub">
          <a className="btn" href={GUIDES.supabase.link[1]} target="_blank" rel="noreferrer">
            打開 Supabase ↗
          </a>
          <Guide id="supabase" />
        </div>
        <small>免費註冊後，產生一組 sbp_ 開頭的 Access Token 貼在下面。</small>
        {field('SUPABASE_ACCESS_TOKEN')}
        <details>
          <summary>已經有 2 個 Supabase 免費專案？</summary>
          <label>
            使用既有專案的 Project ID（選填）
            <input
              value={sbRef}
              autoComplete="off"
              placeholder="例如：abcdefghijklmnopqrst"
              className={sbRef && !/^[a-z]{20}$/.test(sbRef.trim()) ? 'bad' : ''}
              onChange={(e) => setSbRef(e.target.value)}
            />
            <small>Supabase 專案網址 supabase.com/dashboard/project/ 後面那 20 個英文字母。</small>
          </label>
        </details>
      </Step>

      <Step n="6" title="開始打造" done={phase !== 'idle'} open={connected && idle}>
        <p className="oaw-note">
          秘書會裝到：{gh?.connection?.full_name}{' '}
          <button
            type="button"
            className="link"
            onClick={() => api({ action: 'github_disconnect', projectId }).then(refresh)}
          >
            換一個
          </button>
        </p>
        {!keysOk && <p className="oaw-note">把第 4、5 步的代碼都填好，這顆按鈕就會亮起來。</p>}
        <button className="btn brand" type="button" disabled={!keysOk || busy} onClick={start}>
          {busy ? '加密並送出中…' : '開始打造'}
        </button>
        {phase === 'failed' && (
          <p className="oaw-error">
            上一次沒有完成，確認代碼後再試一次。
            {status?.run?.url && (
              <a href={status.run.url} target="_blank" rel="noreferrer">
                {' '}
                查看紀錄 ↗
              </a>
            )}
          </p>
        )}
      </Step>

      <Step n="7" title="打造中" done={phase === 'done'} open={phase === 'running'}>
        <ul className="progress">
          {SETUP_STEPS.map(([k, l]) => (
            <li key={k} className={status?.steps?.[k] ? 'ok' : ''}>
              {l}
            </li>
          ))}
        </ul>
        <p className="oaw-note">大約 2–3 分鐘，可以先離開，回來會接著顯示進度。</p>
      </Step>

      <Step n="8" title="最後三件事" done={false} open={phase === 'done'}>
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
          <li>
            到你自己的官方帳號，點選單的「打開秘書」：三顆光球就在那裡，第一顆已經幫你開好行事曆秘書。
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
