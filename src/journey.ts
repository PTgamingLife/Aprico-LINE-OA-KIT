import { projectFieldIssue } from './project-guides.ts';
export const questSteps = [
  {
    id: 'audience',
    title: '誰會使用你的 OA？',
    kind: 'field',
    label: '服務對象',
    hint: '例如：第一次接觸品牌的顧客',
    topic: 'demand',
  },
  {
    id: 'purpose',
    title: '這個 OA 要幫你做什麼？',
    kind: 'field',
    label: '主要目的',
    hint: '例如：預約服務、介紹商品、互動活動',
    topic: 'demand',
  },
  {
    id: 'scenario',
    title: '顧客會怎麼使用？',
    kind: 'field',
    label: '使用情境',
    hint: '描述顧客從點選按鈕到得到結果的過程',
    topic: 'demand',
  },
  {
    id: 'success',
    title: '怎樣算完成服務？',
    kind: 'field',
    label: '成功條件',
    hint: '例如：顧客完成表單，看到確認訊息',
    topic: 'demand',
  },
  {
    id: 'failure',
    title: '服務遇到問題該如何處理？',
    kind: 'field',
    label: '服務遇到問題該如何處理？',
    hint: '例如：提示補齊資料，提供重新操作入口',
    topic: 'demand',
  },
  {
    id: 'human',
    title: '需要真人時找誰？',
    kind: 'field',
    label: '轉人工方式',
    hint: '說明轉人工條件與聯絡方式',
    topic: 'demand',
  },
  { id: 'github-signup', title: '登入自己的 GitHub', kind: 'guide', guide: 0 },
  { id: 'github-create', title: '建立專用 GitHub 專案', kind: 'guide', guide: 1 },
  { id: 'githubRepo', title: '填入 GitHub 專案網址', kind: 'guide', guide: 2, field: 'githubRepo' },
  {
    id: 'githubToken',
    title: '授權這個 GitHub 專案',
    kind: 'secret',
    label: 'GitHub 限權 Token',
    topic: 'github',
    url: 'https://github.com/settings/personal-access-tokens/new',
  },
  {
    id: 'messagingChannelId',
    title: '確認你的 LINE OA',
    kind: 'field',
    label: 'Messaging API Channel ID',
    hint: '請填 Messaging API 的 Channel ID，不是 LINE Login',
    topic: 'line',
    url: 'https://developers.line.biz/console/',
  },
  {
    id: 'lineSecret',
    title: '填入 LINE Channel Secret',
    kind: 'secret',
    label: 'Messaging API Channel Secret',
    topic: 'secrets',
    url: 'https://developers.line.biz/console/',
  },
  {
    id: 'lineToken',
    title: '填入 LINE Access Token',
    kind: 'secret',
    label: 'Channel Access Token（長效）',
    topic: 'secrets',
    url: 'https://developers.line.biz/console/',
  },
  {
    id: 'loginChannelId',
    title: '連接 LINE Login（LIFF）',
    kind: 'field',
    label: 'LINE Login Channel ID',
    hint: '在同一個 Provider 下選 LINE Login Channel → Basic settings',
    topic: 'line',
    url: 'https://developers.line.biz/console/',
  },
  {
    id: 'loginSecret',
    title: '填入 LINE Login Channel Secret',
    kind: 'secret',
    label: 'LINE Login Channel Secret',
    topic: 'secrets',
    url: 'https://developers.line.biz/console/',
  },
  {
    id: 'loginPublish',
    title: '檢查 LINE Login 發布狀態',
    kind: 'manual',
    topic: 'line',
    url: 'https://developers.line.biz/console/',
  },
  { id: 'supabase-signup', title: '登入自己的 Supabase', kind: 'guide', guide: 3 },
  { id: 'supabase-create', title: '準備專用 Supabase 專案', kind: 'guide', guide: 4 },
  {
    id: 'supabaseUrl',
    title: '填入 Supabase 專案網址',
    kind: 'guide',
    guide: 5,
    field: 'supabaseUrl',
  },
  {
    id: 'supabaseToken',
    title: '授權這個 Supabase 專案',
    kind: 'secret',
    label: '限專案 Supabase Access Token',
    topic: 'supabase',
    url: 'https://supabase.com/dashboard/account/tokens',
  },
  { id: 'review', title: '核對帳號，確認本次任務', kind: 'review', topic: 'confirm' },
  { id: 'automatic', title: '交給 AI 與系統自動完成', kind: 'automatic', topic: 'deploy' },
  {
    id: 'webhook',
    title: '開啟 LINE 的 Use webhook',
    kind: 'manual',
    topic: 'acceptance',
    url: 'https://developers.line.biz/console/',
  },
  { id: 'website', title: '打開網站，試一次操作', kind: 'acceptance', topic: 'acceptance' },
  { id: 'lineMessage', title: '傳一則 LINE 訊息測試', kind: 'acceptance', topic: 'acceptance' },
  { id: 'menu', title: '設定並測試每個選單入口', kind: 'acceptance', topic: 'acceptance' },
  { id: 'liff', title: '設定並測試 App 入口', kind: 'acceptance', topic: 'acceptance' },
] as const;
export const emptyCredentials = () => ({ supabaseToken: '', lineSecret: '', loginSecret: '' });
export function needsLiff(draft: any) {
  return (
    draft.secretary?.direction !== 'records' &&
    draft.cells.slice(0, draft.grid).some((c: any) => ['half', 'full'].includes(c.action))
  );
}
export const journeyLevels = [
  { title: '確認設計', ids: ['audience', 'purpose', 'scenario', 'success', 'failure', 'human'] },
  { title: '連接 GitHub', ids: ['githubToken'] },
  {
    title: '連接 LINE',
    ids: [
      'messagingChannelId',
      'lineSecret',
      'webhook',
      'loginChannelId',
      'loginSecret',
      'loginPublish',
    ],
  },
  { title: '連接 Supabase', ids: ['supabaseUrl', 'supabaseToken'] },
  { title: '部署與驗收', ids: ['review', 'automatic', 'website', 'lineMessage', 'menu', 'liff'] },
];
export function journeySteps(draft: any) {
  return journeyLevels
    .flatMap((level) => level.ids)
    .filter(
      (id) =>
        (!['loginChannelId', 'loginSecret', 'loginPublish', 'liff'].includes(id) ||
          needsLiff(draft)) &&
        (id !== 'menu' || draft.secretary?.direction !== 'records'),
    )
    .map((id) => questSteps.find((q) => q.id === id)!);
}
export function entered(q: any, setup: any, secrets: any) {
  const value = (q.kind === 'secret' ? secrets[q.id] : setup[q.field || q.id]) || '';
  if (q.field) return Boolean(value.trim()) && !projectFieldIssue(q.field, value);
  if (['messagingChannelId', 'loginChannelId'].includes(q.id))
    return /^\d{6,20}$/.test(value.trim());
  if (['lineSecret', 'loginSecret'].includes(q.id)) return /^[a-f\d]{32}$/i.test(value.trim());
  return Boolean(value.trim());
}
export function safeJourneyState(value: any) {
  const allowed = questSteps
    .filter((q) => (q.kind === 'guide' && !('field' in q)) || q.kind === 'manual')
    .map((q) => q.id);
  return {
    step: questSteps.some((q) => q.id === value?.step) ? value.step : 'audience',
    acks: Object.fromEntries(
      allowed.filter((id) => value?.acks?.[id] === true).map((id) => [id, true]),
    ),
  };
}
export function sameTarget(a: any, b: any) {
  return Boolean(
    a &&
      b &&
      a.botId === b.botId &&
      a.githubRepo === b.githubRepo &&
      a.ref === b.ref &&
      a.loginId === b.loginId &&
      a.previousWebhook === b.previousWebhook &&
      a.previousMenuId === b.previousMenuId,
  );
}
export function questProof(q: any, c: any) {
  const deployed =
    c.deployment?.status === 'awaiting_acceptance' &&
    (c.deployment.system_checks?.pagesMode !== 'actions' ||
      c.deployment.system_checks.pagesLive === true);
  if (q.id === 'githubToken' && c.githubApp)
    return { done: true, label: 'GitHub App 已綁定；執行前重驗' };
  if (q.kind === 'automatic')
    return {
      done: deployed,
      label: deployed ? '系統處理完成' : c.running ? '系統處理中' : '等待前置關卡',
    };
  if (q.kind === 'acceptance')
    return { done: deployed && c.deployment?.user_checks?.[q.id] === true, label: '本人實測回報' };
  if (q.kind === 'manual')
    return { done: deployed || c.acks[q.id] === true, label: '本人操作確認' };
  if (q.kind === 'review')
    return { done: Boolean(c.plan) || Boolean(c.deployment), label: '系統已核對目標' };
  if (q.kind === 'guide' && !q.field)
    return { done: Boolean(c.acks[q.id]) || Boolean(c.deployment), label: '本人確認／已有帳號' };
  if (q.kind === 'secret' && c.deployment) return { done: true, label: '授權已使用；原文已清空' };
  const valid = entered(q, c.setup, c.secrets),
    saved =
      q.kind === 'secret' ||
      !c.savedSetup ||
      c.savedSetup[q.field || q.id] === c.setup[q.field || q.id];
  return {
    done: valid && saved,
    label:
      q.kind === 'secret'
        ? '已填入，待系統核對'
        : valid && saved
          ? '資料已保存'
          : '填寫並保存後過關',
  };
}
