// Pure helpers for the OAW build page (tested in tests/oaw-build-page.test.ts).

export const TEMPLATE_REPO = 'https://github.com/PTgamingLife/oaw-template/generate';

export const KEY_FIELDS = [
  {
    name: 'SUPABASE_ACCESS_TOKEN',
    label: 'Supabase Access Token',
    hint: 'Supabase → Account → Access Tokens → Generate',
    pattern: /^sbp_[A-Za-z0-9]{20,}$/,
  },
  {
    name: 'OAW_LINE_MSG_ID',
    label: 'Messaging API Channel ID',
    hint: 'LINE Developers → Messaging API channel → Basic settings',
    pattern: /^\d{8,12}$/,
  },
  {
    name: 'OAW_LINE_MSG_SECRET',
    label: 'Messaging API Channel secret',
    hint: '同一頁的 Channel secret',
    pattern: /^[a-f0-9]{32}$/,
  },
  {
    name: 'OAW_LINE_LOGIN_ID',
    label: 'LINE Login Channel ID',
    hint: 'LINE Login channel → Basic settings（狀態要改成 Published）',
    pattern: /^\d{8,12}$/,
  },
  {
    name: 'OAW_LINE_LOGIN_SECRET',
    label: 'LINE Login Channel secret',
    hint: '同一頁的 Channel secret',
    pattern: /^[a-f0-9]{32}$/,
  },
] as const;

/** Trim what people paste from a phone (spaces, line breaks) and check the shape. */
export function cleanKey(name: string, value: string) {
  const v = String(value ?? '').replace(/\s+/g, '');
  const field = KEY_FIELDS.find((f) => f.name === name);
  return field && field.pattern.test(v) ? v : '';
}

const empty = { label: '', action: 'message', content: '', format: 'text' };

/** Initial OA settings: the name the member chose, and nothing a stranger could be shown. */
export function initialConfig(answers: { template: string; oaName: string; goal: string }) {
  const oaName =
    String(answers.oaName ?? '')
      .trim()
      .slice(0, 40) || '我的官方帳號';
  const health = answers.template === 'health';
  // 秘書版 is a private secretary: no customer-facing menu texts or welcome message. (The
  // 領航者版 fills these in later from its 介面設計中心.)
  return {
    oaName,
    grid: 4,
    theme: 0,
    welcome: '',
    failure: '這個問題我還不會回答。',
    secretary: !health,
    cells: [empty, empty, empty, empty, empty, empty, empty, empty],
  };
}

export const SETUP_STEPS: [string, string][] = [
  ['render', '準備程式'],
  ['line_messaging', '驗證 Messaging API'],
  ['line_login', '驗證 LINE Login'],
  ['supabase_project', '建立資料庫專案'],
  ['database', '建立資料表'],
  ['liff', '建立 LIFF 網頁'],
  ['supabase_secrets', '寫入雲端設定'],
  ['functions', '部署功能'],
  ['webhook', '設定 Webhook'],
  ['owner_menu', '建立選單'],
  ['liff_config', '發布網頁'],
];

/** Where the build is: idle (nothing started), running, failed, or done. */
export function buildPhase(s: any) {
  const run = s?.run;
  // Setup finished but a later job (publishing the pages) failed: not done yet.
  if (s?.ok && run?.status === 'completed' && run.conclusion === 'failure') return 'failed';
  if (s?.ok) return 'done';
  if (!run) return 'idle';
  if (run.status !== 'completed') return 'running';
  return run.conclusion === 'success' ? 'done' : 'failed';
}

/**
 * Turn the setup script's last error into plain words: what went wrong, which step holds
 * the field to fix (4 = LINE, 5 = Supabase, 0 = unknown) and what to do.
 */
export function setupTrouble(error: unknown, setupOk = false) {
  const e = typeof error === 'string' ? error : '';
  if (setupOk)
    return {
      step: 0,
      title: '秘書裝好了，但秘書的頁面還沒辦法發布',
      fix: '你的 GitHub 空間還沒開啟「Pages（網頁）」功能。請打開你的 GitHub 空間 → Settings → 左邊選 Pages → Build and deployment 的 Source 選「GitHub Actions」。選好後回來再按一次「開始打造」，所有欄位都留空就可以。',
    };
  // A limited (scoped) token: Supabase names the permission it is missing.
  const missing = e.match(/Missing required permission\(s\): ([a-z_, ]+)/i);
  if (missing)
    return {
      step: 5,
      title: 'Supabase 的 Access Token 權限不夠',
      fix: `這組 Token 有限制權限，缺少：${missing[1].trim()}。請到 Supabase 的 Access Tokens 重新產生一組「不限制權限」的 Token（只需要填名稱的那一種）；如果一定要選權限，請把 Organizations 和 Projects 相關的讀取與寫入都打開，再貼到第 5 步。`,
    };
  if (/Supabase Token|SUPABASE_ACCESS_TOKEN/i.test(e))
    return {
      step: 5,
      title: 'Supabase 的 Access Token 不能用',
      fix: '常見原因：複製時少了幾個字、Token 已過期或被刪除，或建立時選了有權限限制的類型。請到 Supabase 的 Access Tokens 頁面重新產生一組（不要限制權限），再貼到第 5 步。',
    };
  if (/free projects|免費專案|免費方案|maximum limits/i.test(e))
    return {
      step: 5,
      title: 'Supabase 免費專案已經滿了',
      fix: '免費帳號最多 2 個專案。請在第 5 步展開「已經有 2 個 Supabase 免費專案？」填入要沿用的專案 ID，或先到 Supabase 刪掉一個不用的專案。',
    };
  if (/LINE Channel|Channel ID|Secret 不正確|LINE Login/i.test(e))
    return {
      step: 4,
      title: 'LINE 的代碼不正確',
      fix: e.slice(0, 120) + '。請回 LINE Developers 重新複製 Channel ID 和 Channel secret，貼到第 4 步。',
    };
  return {
    step: 0,
    title: e ? e.slice(0, 120) : '打造過程中斷了',
    fix: '可以直接再按一次「開始打造」；如果還是一樣，請到「問題回報」告訴我們。',
  };
}
