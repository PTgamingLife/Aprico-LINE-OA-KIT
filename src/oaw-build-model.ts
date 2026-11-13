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

/** Initial OA settings from the two answers; the owner refines them later by chatting. */
export function initialConfig(answers: { template: string; oaName: string; goal: string }) {
  const oaName =
    String(answers.oaName ?? '')
      .trim()
      .slice(0, 40) || '我的官方帳號';
  const goal = String(answers.goal ?? '')
    .trim()
    .slice(0, 200);
  const health = answers.template === 'health';
  return {
    oaName,
    grid: 4,
    theme: 0,
    welcome: `謝謝你加入「${oaName}」！${goal ? goal + '\n' : ''}點下方選單就能開始使用。`.slice(
      0,
      500,
    ),
    failure: '這個問題我還不會回答，請稍後由專人回覆你。',
    secretary: !health,
    cells: [
      { label: '會員卡', action: 'full', content: '', format: 'text' },
      {
        label: '關於我們',
        action: 'message',
        content: goal || '這裡可以介紹你的品牌與服務。',
        format: 'card',
      },
      { label: '營業時間', action: 'message', content: '週一至週五 10:00–18:00', format: 'text' },
      {
        label: '聯絡我們',
        action: 'message',
        content: '請直接留言，我們會盡快回覆你。',
        format: 'text',
      },
      empty,
      empty,
      empty,
      empty,
    ],
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
  if (s?.ok) return 'done';
  const run = s?.run;
  if (!run) return 'idle';
  if (run.status !== 'completed') return 'running';
  return run.conclusion === 'success' ? 'done' : 'failed';
}
