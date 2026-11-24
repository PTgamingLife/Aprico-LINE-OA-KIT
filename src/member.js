// 會員中心 (member.html) of the Aprico OA. Four tabs, the same as the OA's four menu cells:
// 我的秘書 / 會員中心 / 推薦好友 / 問題回報. Every call carries the LIFF ID token; the studio
// function checks it and scopes everything to that LINE user.
const LIFF_ID = '2012197506-Vmb4O5iT';
const API = 'https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-studio';
const OA_ADD = 'https://line.me/R/ti/p/@228srwlt';
const TABS = [
  ['secretary', '我的秘書'],
  ['member', '會員中心'],
  ['refer', '推薦好友'],
  ['report', '問題回報'],
];
const root = document.getElementById('member');
const params = new URLSearchParams(location.search);
// Inside LIFF the query arrives in liff.state on the first load.
const state = new URLSearchParams(params.get('liff.state')?.replace(/^\?/, '') ?? '');
const q = (k) => params.get(k) ?? state.get(k);
let tab = TABS.some(([id]) => id === q('tab')) ? q('tab') : 'member';
let plan = 'month';
let me = null;

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
};
const panel = (...kids) => h('section', { class: 'panel' }, kids);
const row = (label, text, cls) => h('div', { class: 'row' }, h('b', {}, label), h('span', { class: 'pill ' + cls }, text));
const money = (n) => 'NT$' + Number(n).toLocaleString('en-US');

async function api(action, extra = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, idToken: window.liff.getIDToken(), ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(typeof data.error === 'string' ? data.error : '暫時無法連線，請稍後再試');
  return data;
}
function loadSdk() {
  if (window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}
const eventLine = (e) => `${e.day.slice(5).replace('-', '/')}${e.time ? ' ' + e.time : ''} ${e.title}`;

function secretary() {
  const chat = h('button', { class: 'btn3d', type: 'button' }, '回聊天室傳訊息給秘書');
  chat.addEventListener('click', () => (window.liff.isInClient() ? window.liff.closeWindow() : (location.href = OA_ADD)));
  const left =
    me.kind === 'free' ? `免費對話還剩 ${me.left} 則` : me.kind === 'trial' ? `試用中・今天還有 ${me.left} 則` : `會員・今天還有 ${me.left} 則`;
  return [
    h('div', { class: 'hero' }, h('img', { src: './mascot/secretary.png', alt: 'AI 秘書', width: '402', height: '480' })),
    panel(
      h('h2', {}, '☀️ 預設秘書：行事曆'),
      h('p', { class: 'muted' }, '把行程傳給我，我會記下來、整理成行事曆；輸入「行事曆」隨時查看。'),
      h('p', { class: 'muted' }, left),
      chat,
    ),
    panel(
      h('h2', {}, '接下來的行程'),
      h('p', { class: me.events.length ? 'list' : 'muted' }, me.events.length ? me.events.map(eventLine).join('\n') : '還沒有行程。試試傳「週五下午三點開會」。'),
    ),
    !me.connected &&
      panel(
        h('h2', {}, '想要更多？'),
        h('p', { class: 'muted' }, '成為會員並建立自己的官方帳號後，可以設定三顆光球：群組統計、定時推播、每日提醒，資料存在你自己的資料庫。'),
        h('a', { class: 'btn3d ghost', href: './showcase.html' }, '看看 AI 秘書能做什麼'),
      ),
  ];
}

function member() {
  const status = h('p', { class: 'error' });
  const out = [
    panel(
      h('h2', {}, '我的狀態'),
      row('付費狀態', me.paid ? `會員${me.paidUntil ? '・到 ' + me.paidUntil : ''}` : me.trialUntil ? '試用中' : '尚未付費', me.paid ? 'ok' : me.trialUntil ? 'wait' : 'no'),
      row('GitHub 專案', me.github ? '已建立' : '尚未建立', me.github ? 'ok' : 'no'),
      row('資料庫與官方帳號', me.connected ? '已連結' : '尚未連結', me.connected ? 'ok' : 'no'),
      row('版本', me.connected ? `最新版 ${me.latestVersion}` : '建立後顯示', 'wait'),
    ),
  ];
  if (!me.paid) {
    const plans = h('div', { class: 'plans' });
    for (const k of ['month', 'year']) {
      const b = h('button', { class: 'plan' + (plan === k ? ' on' : ''), type: 'button', 'aria-pressed': String(plan === k) },
        h('span', {}, k === 'month' ? '月繳' : '年繳（多送 2 個月）'),
        h('strong', {}, money(me.prices[k])),
        me.discount < 1 && h('s', {}, '原價 ' + money(me.basePrices[k])),
      );
      b.addEventListener('click', () => ((plan = k), render()));
      plans.append(b);
    }
    const pay = h('button', { class: 'btn3d sun', type: 'button' }, '用 LINE Pay 付款');
    pay.addEventListener('click', async () => {
      pay.disabled = true;
      try {
        const r = await api('sub_create', { product: plan, returnTo: 'member' });
        if (!r.order?.paymentUrl) throw Error('無法建立付款，請稍後再試');
        location.href = r.order.paymentUrl;
      } catch (e) {
        status.textContent = e.message;
        pay.disabled = false;
      }
    });
    out.push(
      panel(
        h('h2', {}, '成為會員'),
        h('p', { class: 'muted' }, me.discount < 1 ? `已套用推薦折扣 ${me.discount === 0.8 ? '8' : '9'} 折。` : '推薦 3 位朋友 9 折、5 位 8 折。'),
        plans,
        pay,
        status,
      ),
    );
  } else if (!me.connected) {
    out.push(
      panel(
        h('h2', {}, '下一步：建立你自己的官方帳號'),
        h('div', { class: 'steps' }, h('i', { class: 'done' }), h('i', { class: me.github ? 'done' : '' }), h('i'), h('i')),
        h('p', { class: 'muted' }, '① 付費（完成）② 建立 GitHub 專案 ③ 貼上 LINE 與資料庫金鑰 ④ 自動建置。秘書和資料都在你自己的帳號裡。'),
        h('a', { class: 'btn3d', href: './build.html' }, me.github ? '繼續建立' : '建立我的官方帳號'),
      ),
    );
  } else {
    out.push(
      panel(
        h('h2', {}, '管理'),
        h('a', { class: 'btn3d ghost', href: './build.html?update=1' }, '檢查新版本'),
        h('a', { class: 'btn3d ghost', href: './build.html?security=1' }, '帳號安全（鎖定／找回）'),
        h('a', { class: 'btn3d ghost', href: './build.html?renew=1' }, '續訂與加值'),
      ),
    );
  }
  const orb = h('button', { class: me.gift === 'locked' ? 'locked' : '', type: 'button', 'aria-label': '禮物光球' });
  const note = h('p', { class: 'muted' },
    me.gift === 'locked' ? '推薦 1 位朋友，就會得到一顆禮物光球。' : me.gift === 'ready' ? '你有一顆禮物光球，點一下打開：3 天試用，每天 20 則。' : me.trialUntil ? '禮物光球已打開，試用進行中。' : '禮物光球已經打開過了。');
  orb.addEventListener('click', async () => {
    if (me.gift === 'locked') return ((tab = 'refer'), render());
    if (me.gift !== 'ready') return;
    try {
      me = await api('sec_gift');
      render();
    } catch (e) {
      note.textContent = e.message;
    }
  });
  out.push(panel(h('h2', {}, '🎁 禮物光球'), h('div', { class: 'gift' }, orb, note)));
  return out;
}

function refer() {
  const text = `我在用 Aprico AI 秘書，LINE 上直接用，前 5 則免費。加好友後輸入我的推薦碼 ${me.refCode}：${OA_ADD}`;
  const share = h('button', { class: 'btn3d', type: 'button' }, '分享給朋友');
  share.addEventListener('click', async () => {
    try {
      if (window.liff.isApiAvailable?.('shareTargetPicker')) await window.liff.shareTargetPicker([{ type: 'text', text }]);
      else {
        await navigator.clipboard.writeText(text);
        share.textContent = '已複製邀請訊息';
      }
    } catch {
      share.textContent = '請長按上方推薦碼複製';
    }
  });
  const steps = h('div', { class: 'steps' }, [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= me.refs ? 'done' : '' })));
  return [
    panel(h('h2', {}, '我的推薦碼'), h('p', { class: 'code' }, me.refCode), h('p', { class: 'muted' }, '朋友加好友並在聊天室輸入你的推薦碼，就算推薦成功。每位朋友只能登記一次。'), share),
    panel(
      h('h2', {}, `已推薦 ${me.refs} 位`),
      steps,
      row('1 位', '禮物光球：3 天試用', me.refs >= 1 ? 'ok' : 'wait'),
      row('3 位', '會員費 9 折', me.refs >= 3 ? 'ok' : 'wait'),
      row('5 位', '會員費 8 折', me.refs >= 5 ? 'ok' : 'wait'),
    ),
  ];
}

function report() {
  const ta = h('textarea', { id: 'report-text', rows: '5', maxlength: '500', placeholder: '遇到什麼問題，或希望秘書多做什麼？' });
  const status = h('p', { class: 'muted' });
  const send = h('button', { class: 'btn3d', type: 'button' }, '送出');
  send.addEventListener('click', async () => {
    if (!ta.value.trim()) return;
    send.disabled = true;
    try {
      await api('sec_report', { text: ta.value });
      ta.value = '';
      status.className = 'muted';
      status.textContent = '✅ 已收到。我們每天晚上 9 點統一整理所有回報。';
    } catch (e) {
      status.className = 'error';
      status.textContent = e.message;
    }
    send.disabled = false;
  });
  return [panel(h('h2', {}, '告訴我們'), h('p', { class: 'muted' }, '每一則都會被看到。請不要在這裡填密碼或金鑰。'), ta, send, status)];
}

function render(notice) {
  const pages = { secretary, member, refer, report };
  root.replaceChildren(
    h('h1', {}, TABS.find(([id]) => id === tab)[1]),
    ...(notice ? [h('p', { class: 'muted' }, notice)] : []),
    ...pages[tab]().filter(Boolean),
    h('nav', { class: 'tabs' }, TABS.map(([id, label]) => {
      const b = h('button', { class: id === tab ? 'on' : '', type: 'button', 'aria-current': id === tab ? 'page' : 'false' }, label);
      b.addEventListener('click', () => ((tab = id), render(), scrollTo(0, 0)));
      return b;
    })),
  );
}

async function main() {
  await loadSdk();
  await window.liff.init({ liffId: LIFF_ID });
  if (!window.liff.isLoggedIn()) return window.liff.login({ redirectUri: location.href });
  // Back from LINE Pay: confirm the order once, then show the result on the member tab.
  let notice = '';
  if (q('pay') === 'sub' && /^[0-9a-f-]{36}$/.test(q('order') ?? '')) {
    tab = 'member';
    try {
      const r = await api('sub_confirm', { orderId: q('order') });
      notice = ['paid', 'test_paid'].includes(r.order?.status) ? '🎉 付款完成，歡迎成為會員！' : '付款還在確認中，稍後重新整理這一頁。';
    } catch (e) {
      notice = e.message;
    }
    history.replaceState(null, '', location.pathname + '?tab=member');
  } else if (q('pay') === 'sub-cancel') notice = '付款已取消。';
  me = await api('sec_status');
  render(notice);
}
main().catch((e) => root.replaceChildren(h('p', { class: 'error' }, e?.message || '載入失敗，請關閉後再開一次。')));
