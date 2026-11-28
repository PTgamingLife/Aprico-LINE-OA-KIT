// The Aprico OA is itself a secretary. Every friend can try it: 5 messages for life, a
// referral gift opens a 3-day trial, and members use it until their own OA is built.
// A message is turned into calendar entries by the AI and saved for that user only;
// 「行事曆」 lists them (free). What a user types is data, never an instruction.
import { CENTER_LIFF } from '../../../src/center-menu.ts';
import { claudeText } from './metered-text.ts';
import { cleanTurn, resultText, rowsOf, TOUR, TOUR_INSTRUCTIONS, TOUR_SCHEMA, TOUR_SUMMARY, tourNext } from './aprico-tour.ts';
export { cleanEvents, eventLine } from './aprico-tour.ts';
import { eventLine } from './aprico-tour.ts';

type Deps = {
  authenticated: boolean;
  db: any;
  aiKey: string;
  /** The operator's own LINE user id: may replay the tour with 「測試導覽」. */
  operator?: string;
  reply: (token: string, messages: any[]) => Promise<unknown>;
  push?: (to: string, messages: any[]) => Promise<unknown>;
  fetcher?: typeof fetch;
  now?: () => number;
};

export const MEMBER_URL = CENTER_LIFF + '/member.html';
export const SUGGESTIONS = [TOUR[0].example, '明天早上九點看牙醫'];
const SKY = '#E4E8FF',
  SUN = '#FFD98A',
  INK = '#2B2A4A',
  PAPER = '#FFFFFF';

const quick = (words: string[]) => ({
  items: words.map((w) => ({ type: 'action', action: { type: 'message', label: w.slice(0, 20), text: w } })),
});
export function card(title: string, body: string, opts: { button?: { label: string; uri: string }; chips?: string[]; sun?: boolean } = {}) {
  return {
    type: 'flex',
    altText: `${title}：${body}`.slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: opts.sun ? SUN : SKY,
        paddingAll: '12px',
        contents: [{ type: 'text', text: title, weight: 'bold', color: INK, wrap: true }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: PAPER,
        contents: [{ type: 'text', text: body.slice(0, 1500), wrap: true, size: 'sm', color: INK }],
      },
      ...(opts.button
        ? {
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#5866D6',
                  action: { type: 'uri', label: opts.button.label, uri: opts.button.uri },
                },
              ],
            },
          }
        : {}),
    },
    ...(opts.chips ? { quickReply: quick(opts.chips) } : {}),
  };
}

// A new friend is walked through five messages, one main function each (aprico-tour.ts).
export const greeting = () => [
  {
    type: 'text',
    text: '嗨，我是你的 AI 秘書 👋\n接下來的五則訊息，我帶你試試五種功能：記行程、記帳、待辦、定時提醒，還有直接問我。',
  },
  { type: 'text', text: `第一步（1/${TOUR.length}）：${TOUR[0].hint}\n點下面的句子，或用自己的話說：`, quickReply: quick([TOUR[0].example]) },
];

/** 4 characters, optional APR- prefix; I, O, 0, 1 are never used. */
export const refCode = (text: string) =>
  text.trim().toUpperCase().match(/^APR[-\s]?([A-HJ-NP-Z2-9]{4})$/)?.[1] ?? '';

const WEEK = '日一二三四五六';

export function limitCard(take: { kind: string }) {
  if (take.kind === 'busy') return card('秘書現在有點忙', '今天使用的人太多了，請明天再試。');
  if (take.kind === 'free')
    return card(
      '免費 5 則用完了',
      '成為會員後，秘書會搬進你自己的官方帳號：三顆光球、群組統計、定時提醒都能用，資料也存在你自己的資料庫。\n\n推薦 1 位朋友，還能先拿到 3 天試用。',
      { button: { label: '打開會員中心', uri: MEMBER_URL }, sun: true },
    );
  return card('今天的 20 則用完了', '明天會重新計算。', { button: { label: '打開會員中心', uri: MEMBER_URL } });
}

export async function secretaryGateway(event: any, deps: Deps) {
  if (!deps.authenticated || !deps.db || event?.source?.type !== 'user') return false;
  const userId: string = event.source.userId ?? '';
  if (!/^U[0-9a-f]{32}$/.test(userId) || !event.replyToken) return false;
  const reply = (...m: any[]) => deps.reply(event.replyToken, m.flat());
  if (event.type === 'follow') {
    await deps.db.rpc('line_oa_kit_sec_user', { p_user: userId });
    await reply(greeting());
    return true;
  }
  if (event.type !== 'message' || event.message?.type !== 'text') return false;
  const text: string = String(event.message.text ?? '').trim().slice(0, 500);
  if (!text) return false;
  const now = deps.now?.() ?? Date.now();
  const today = new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);

  if (text === '行事曆') {
    const { data } = await deps.db
      .from('line_oa_kit_sec_events')
      .select('day,time,title')
      .eq('line_user_id', userId)
      .eq('kind', 'event')
      .gte('day', today)
      .order('day', { ascending: true })
      .order('time', { ascending: true })
      .limit(20);
    await reply(
      card('📅 我的行事曆', data?.length ? data.map(eventLine).join('\n') : '還沒有行程。把行程傳給我試試看。', {
        chips: SUGGESTIONS,
      }),
    );
    return true;
  }
  // The operator can replay the tour on their own account: 「測試導覽」 makes the next five
  // messages behave like a new friend's, without touching the subscription or the allowance.
  const operator = !!deps.operator && userId === deps.operator;
  if (operator && text === '測試導覽') {
    await deps.db.rpc('line_oa_kit_sec_user', { p_user: userId });
    await deps.db.from('line_oa_kit_sec_users').update({ tour_test: TOUR.length }).eq('line_user_id', userId);
    await reply(greeting());
    return true;
  }
  let testing = 0;
  if (operator) {
    const { data: me } = await deps.db.from('line_oa_kit_sec_users').select('tour_test').eq('line_user_id', userId).limit(1).maybeSingle();
    testing = Math.max(0, Math.min(TOUR.length, Number(me?.tour_test) || 0));
  }
  const code = refCode(text);
  if (code) {
    const { data } = await deps.db.rpc('line_oa_kit_sec_refer', { p_user: userId, p_code: code });
    if (data?.ok) {
      await reply(card('🎁 推薦碼已登記', '謝謝！你的朋友會收到通知。你也可以把自己的推薦碼分享出去。', { chips: SUGGESTIONS }));
      // Tell the friend who referred them (one push); the gift orb waits in the member center.
      if (typeof data.referrer === 'string')
        await deps
          .push?.(data.referrer, [
            card(
              '🎁 有朋友用了你的推薦碼',
              data.refs === 1
                ? '你得到一顆禮物光球，到會員中心打開它，可以試用 3 天。'
                : `你已經推薦 ${data.refs} 位朋友。${data.refs >= 5 ? '會員費 8 折。' : data.refs >= 3 ? '會員費 9 折。' : ''}`,
              { button: { label: '打開會員中心', uri: MEMBER_URL }, sun: true },
            ),
          ])
          .catch(() => {});
    } else
      await reply(
        card(
          '推薦碼沒有登記',
          data?.error === 'already'
            ? '你已經登記過推薦碼了，每個人只能登記一次。'
            : data?.error === 'self'
              ? '不能輸入自己的推薦碼。'
              : '找不到這組推薦碼，請再確認一次。',
        ),
      );
    return true;
  }

  // Someone whose own OA is connected: their secretary lives there now.
  const { data: own } = testing
    ? { data: null }
    : await deps.db
    .from('line_oa_kit_runtime_keys')
    .select('project_id')
    .eq('line_subject', userId)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (own) {
    await reply(
      card(
        '你的秘書在你自己的官方帳號',
        '請到你自己的官方帳號傳訊息，行程和設定都在那裡。這裡可以查看會員狀態、推薦好友和回報問題。',
        { button: { label: '打開會員中心', uri: MEMBER_URL } },
      ),
    );
    return true;
  }
  // Check the allowance first, call the AI, and only count the message once it was answered.
  const peek = testing
    ? { allowed: true, kind: 'free', left: testing }
    : (await deps.db.rpc('line_oa_kit_sec_take', { p_user: userId, p_commit: false })).data;
  if (!peek?.allowed) {
    await reply(limitCard(peek ?? { kind: 'busy' }));
    return true;
  }
  // What this user saved before: the AI answers questions from it and from nothing else.
  const { data: kept } = await deps.db
    .from('line_oa_kit_sec_events')
    .select('kind,day,time,title,amount')
    .eq('line_user_id', userId)
    .order('day', { ascending: false })
    .limit(30);
  const records = (kept ?? []) as { kind?: string; day: string; time: string; title: string; amount?: number | null }[];
  const r: any = await claudeText(
    deps.aiKey,
    {
      instructions: TOUR_INSTRUCTIONS,
      input: JSON.stringify({
        today: `${today}（週${WEEK[new Date(today + 'T00:00:00Z').getUTCDay()]}）`,
        message: text,
        records,
      }),
      schema: TOUR_SCHEMA,
    },
    600,
    deps.fetcher ?? fetch,
  ).catch(() => null);
  let out: any = null;
  try {
    out = r?.text ? JSON.parse(r.text) : null;
  } catch {
    out = null;
  }
  if (!out) {
    await reply(card('秘書暫時沒聽清楚', '請再傳一次。這一則不會扣免費次數。'));
    return true;
  }
  let take: any;
  if (testing) {
    await deps.db.from('line_oa_kit_sec_users').update({ tour_test: testing - 1 }).eq('line_user_id', userId);
    take = { allowed: true, kind: 'free', left: testing - 1 };
  } else take = (await deps.db.rpc('line_oa_kit_sec_take', { p_user: userId, p_commit: true })).data;
  const turn = cleanTurn(out);
  // Earlier expenses of today (counted before this message's own rows are added).
  const spent = records.filter((x) => x.kind === 'expense' && x.day === today).reduce((n, x) => n + (x.amount ?? 0), 0);
  const rows = rowsOf(turn, userId, today);
  if (rows.length) await deps.db.from('line_oa_kit_sec_events').insert(rows);
  const result = resultText(turn, spent);
  // Free messages are the tour: `left` after this one tells which of the five it was.
  const step = take?.kind === 'free' && Number.isInteger(take.left) ? TOUR.length - take.left : 0;
  const next = tourNext(step, turn.kind);
  const main = card(result.title, result.body + (next.text ? `\n\n${next.text}` : ''), {
    chips: next.chip ? [next.chip] : step ? undefined : turn.kind === 'event' ? ['行事曆'] : SUGGESTIONS,
    sun: turn.kind !== 'note',
  });
  await reply(
    next.done
      ? [main, card('🎉 五項功能都試過了', TOUR_SUMMARY + '\n\n推薦 1 位朋友，還能先拿到 3 天試用。', { button: { label: '打開會員中心', uri: MEMBER_URL }, sun: true })]
      : [main],
  );
  return true;
}
