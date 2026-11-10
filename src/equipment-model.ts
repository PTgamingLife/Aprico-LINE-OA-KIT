export const equipment = [
  {
    id: 'name',
    name: '名牌',
    description: '告訴秘書要為誰服務、完成什麼目標。',
    pages: ['audience', 'purpose'],
  },
  { id: 'uniform', name: '制服', description: '套用已保存的選單配色、印花與品牌外觀。', pages: [] },
  {
    id: 'skills',
    name: '技能手冊',
    description: '整理使用情境、成功條件、服務問題處理與轉人工方式。',
    pages: ['scenario', 'success', 'failure', 'human'],
  },
  {
    id: 'voice',
    name: '聲音與知識',
    description: '查看各格已保存的功能與回覆需求；需要變更時回到設計頁。',
    pages: [],
  },
  {
    id: 'tools',
    name: '工具包',
    description: '用自己的 GitHub 專用專案保存程式，並核對授權。',
    pages: ['github-signup', 'github-create', 'githubRepo', 'githubToken'],
  },
  {
    id: 'ring',
    name: '儲物戒',
    description: '連接自己的 Supabase 專案，安全保存資料與後端設定。',
    pages: ['supabase-signup', 'supabase-create', 'supabaseUrl', 'supabaseToken'],
  },
  {
    id: 'headset',
    name: '通訊耳機',
    description: '核對 LINE OA、Channel ID、Secret 及 LINE 後台設定。',
    pages: [
      'messagingChannelId',
      'lineSecret',
      'lineToken',
      'webhook',
      'loginChannelId',
      'loginSecret',
      'loginPublish',
    ],
  },
  {
    id: 'badge',
    name: '啟用徽章',
    description: '確認任務、等系統完成，再用手機逐項實測。',
    pages: ['review', 'automatic', 'website', 'lineMessage', 'menu', 'liff'],
  },
] as const;
export const equipmentForStep = (id: string) =>
  equipment.find((e) => (e.pages as readonly string[]).includes(id))?.id || 'name';
export function equipmentProgress(
  pages: { id: string; done: number; total: number }[],
  draft: any,
  saved: boolean,
) {
  return equipment.map((e) => {
    const units = pages.filter((p) => (e.pages as readonly string[]).includes(p.id));
    const designReady =
      e.id === 'uniform'
        ? saved
        : Boolean(
            saved &&
              draft.cells
                ?.slice(0, draft.grid)
                .every((c: any) => c.label?.trim() && c.content?.trim()),
          );
    const total = units.reduce((n, p) => n + p.total, 0) || 1,
      done = units.length ? units.reduce((n, p) => n + p.done, 0) : Number(designReady);
    return { ...e, total, done, complete: done === total };
  });
}
export function safeSecretaryProfile(value: any) {
  return { appearance: value?.appearance === 'male' ? 'male' : 'female' };
}
export function safeSecretaryNotes(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v?.text === 'string' && v.text.length <= 1200 && !sensitiveNote(v.text))
    .slice(-20)
    .map((v) => ({ text: v.text, date: typeof v.date === 'string' ? v.date.slice(0, 40) : '' }));
}
export function sensitiveNote(value: string) {
  return /(?:sk-(?:proj-|ant-)?[a-z\d_-]{12,}|(?:ghp_|github_pat_)[a-z\d_]{12,}|sb_secret_[a-z\d_-]{12,}|-----BEGIN[^\n]*PRIVATE KEY|Bearer\s+\S+|\beyJ[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+|\b[a-f\d]{32}\b)/i.test(
    value,
  );
}
