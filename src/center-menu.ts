export const CENTER_LIFF = 'https://liff.line.me/2012197506-Vmb4O5iT';
export const CENTER_LEARNING = CENTER_LIFF + '/learning.html';
export const DESIGN_COMMAND = '打造我的 LINE OA';
export const REVIEW_COMMAND = '確認我的建置設計';
// Two menus in the Aprico OA, switched per user with LINE's rich menu aliases.
export const SHOWCASE_ALIAS = 'aprico-showcase';
export const BUILD_ALIAS = 'aprico-build';
export const BUILD_WORD = '我想要建置';
export const SHOWCASE_URL = CENTER_LIFF + '/showcase.html';
const switchTo = (alias: string, label: string, target: 'build' | 'showcase') => ({
  type: 'richmenuswitch',
  label,
  richMenuAliasId: alias,
  data: 'aprico_menu=' + target,
});
const grid = (actions: unknown[]) =>
  actions.map((action, i) => ({
    bounds: { x: (i % 3) * 400, y: Math.floor(i / 3) * 405, width: 400, height: 405 },
    action,
  }));

/** 展示中心: what new friends see first; the last cell switches to the build center. */
export function showcaseMenu() {
  return {
    size: { width: 1200, height: 810 },
    selected: true,
    name: 'Aprico showcase arches',
    chatBarText: '開啟 Aprico 展示中心',
    areas: grid([
      { type: 'uri', label: 'LINE 的好處', uri: SHOWCASE_URL + '#line' },
      { type: 'uri', label: 'OA 能長什麼樣子', uri: SHOWCASE_URL + '#oa' },
      { type: 'uri', label: 'AI 秘書能做什麼', uri: SHOWCASE_URL + '#ai' },
      { type: 'uri', label: '使用案例', uri: SHOWCASE_URL + '#cases' },
      { type: 'uri', label: '聯絡專員', uri: 'https://line.me/ti/p/ZC-w2BuPoi' },
      switchTo(BUILD_ALIAS, BUILD_WORD, 'build'),
    ]),
  };
}
export const buildReviewUrl = (projectId: string) =>
  'https://line.me/R/oaMessage/%40228srwlt/?' +
  encodeURIComponent(REVIEW_COMMAND + ' ' + projectId);
export function centerMenu(learningUrl: string) {
  const url = new URL(learningUrl);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw Error('請先提供正確的 AI 教學 HTTPS 網址');
  const entries = [
    { label: DESIGN_COMMAND, type: 'message', text: DESIGN_COMMAND },
    { label: '開始建置', uri: CENTER_LIFF + '/build.html' },
    { label: '回展示中心', type: 'switch' },
    { label: '聯絡專員', uri: 'https://line.me/ti/p/ZC-w2BuPoi' },
    { label: 'AI 官方內容中文版教學', uri: url.href },
    { label: '小遊戲專區', uri: CENTER_LIFF + '/games.html' },
  ];
  return {
    size: { width: 1200, height: 810 },
    selected: true,
    name: 'Aprico build center puzzle',
    chatBarText: '開啟 Aprico 建置中心',
    areas: grid(
      entries.map((entry: any) =>
        entry.type === 'switch'
          ? switchTo(SHOWCASE_ALIAS, entry.label, 'showcase')
          : entry.type === 'message'
            ? { type: 'message', label: entry.label, text: entry.text }
            : { type: 'uri', label: entry.label, uri: entry.uri },
      ),
    ),
  };
}

/** New Aprico OA: the OA itself is the secretary. One menu, four cells, for every friend. */
export const MEMBER_PAGE = CENTER_LIFF + '/member.html';
export function secretaryMenu() {
  const cells = [
    ['我的秘書', 'secretary'],
    ['會員中心', 'member'],
    ['推薦好友', 'refer'],
    ['問題回報', 'report'],
  ];
  return {
    size: { width: 1200, height: 405 },
    selected: true,
    name: 'Aprico secretary four cells',
    chatBarText: '打開 AI 秘書選單',
    areas: cells.map(([label, tab], i) => ({
      bounds: { x: i * 300, y: 0, width: 300, height: 405 },
      action: { type: 'uri', label, uri: `${MEMBER_PAGE}?tab=${tab}` },
    })),
  };
}
