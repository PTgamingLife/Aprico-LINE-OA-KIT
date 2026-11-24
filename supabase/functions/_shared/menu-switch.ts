// Aprico OA: 展示中心 ⇄ 建置中心 rich menus. The menu cell switches on the phone itself
// (richmenuswitch); 「我想要建置」 sent from the showcase page links the build menu here.
// Either way the user gets a short welcome to the build center.
import { BUILD_ALIAS, BUILD_WORD, CENTER_LIFF, DESIGN_COMMAND } from '../../../src/center-menu.ts';

type Deps = {
  authenticated: boolean;
  token: string;
  reply: (token: string, messages: any[]) => Promise<unknown>;
  fetcher?: typeof fetch;
};

export const welcomeToBuild = () => ({
  type: 'flex',
  altText: '歡迎來到建置中心',
  contents: {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#E4E8FF',
      contents: [{ type: 'text', text: '✨ 歡迎來到建置中心', weight: 'bold', color: '#2B2A4A' }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FFFFFF',
      contents: [
        {
          type: 'text',
          wrap: true,
          size: 'sm',
          color: '#2B2A4A',
          text: '下方選單已換成建置中心。先用「打造我的 LINE OA」設計，再到「開始建置」一步一步完成。想回去看看，點「回展示中心」。',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#5866D6',
          action: { type: 'message', label: DESIGN_COMMAND, text: DESIGN_COMMAND },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'uri', label: '開始建置', uri: CENTER_LIFF + '/build.html' },
        },
      ],
    },
  },
});

export async function menuGateway(event: any, deps: Deps) {
  if (!deps.authenticated || event.source?.type !== 'user') return false;
  const data = event.type === 'postback' ? String(event.postback?.data ?? '') : '';
  const text =
    event.type === 'message' && event.message?.type === 'text'
      ? String(event.message.text ?? '').trim()
      : '';
  if (data === 'aprico_menu=showcase') return true; // switched on the phone, nothing to say
  if (data !== 'aprico_menu=build' && text !== BUILD_WORD) return false;
  const user = event.source.userId;
  if (!/^U[0-9a-f]{32}$/.test(user || '') || typeof event.replyToken !== 'string') return true;
  if (text) {
    // From the showcase page: link this user's build menu (the alias names the current one).
    const f = deps.fetcher ?? fetch;
    const auth = { Authorization: `Bearer ${deps.token}` };
    const alias = await f(`https://api.line.me/v2/bot/richmenu/alias/${BUILD_ALIAS}`, {
      headers: auth,
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (typeof alias?.richMenuId === 'string' && /^richmenu-[0-9a-f]{32}$/.test(alias.richMenuId))
      await f(`https://api.line.me/v2/bot/user/${user}/richmenu/${alias.richMenuId}`, {
        method: 'POST',
        headers: auth,
      }).catch(() => null);
  }
  await deps.reply(event.replyToken, [welcomeToBuild()]);
  return true;
}
