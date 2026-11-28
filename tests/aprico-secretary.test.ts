import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanEvents,
  eventLine,
  refCode,
  secretaryGateway,
} from '../supabase/functions/_shared/aprico-secretary.ts';

const U = 'U' + 'a'.repeat(32);
const ai = (payload: unknown) => async () =>
  new Response(
    JSON.stringify({
      model: 'claude-sonnet-5-5',
      id: 'm',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    }),
  );
function fixture(take: any[], refer: any = { ok: false, error: 'unknown' }, ownOa = false) {
  const sent: any[] = [],
    pushed: any[] = [],
    saved: any[] = [],
    calls: any[] = [];
  const db = {
    rpc: async (name: string, args: any) => {
      calls.push([name, args]);
      if (name === 'line_oa_kit_sec_take') return { data: take.shift() };
      if (name === 'line_oa_kit_sec_refer') return { data: refer };
      return { data: null };
    },
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        order: () => q,
        is: () => q,
        maybeSingle: async () => ({ data: ownOa ? { project_id: 'p' } : null }),
        limit: (n: number) => (n === 1 ? q : Promise.resolve({ data: saved })),
        insert: async (rows: any[]) => (saved.push(...rows), { error: null }),
      };
      return q;
    },
  };
  const deps = (fetcher?: any) => ({
    authenticated: true,
    db,
    aiKey: 'k',
    fetcher,
    now: () => Date.parse('2026-11-24T04:00:00Z'), // Tuesday noon in Taipei
    reply: async (_t: string, m: any[]) => void sent.push(...m),
    push: async (to: string, m: any[]) => void pushed.push([to, ...m]),
  });
  return { db, deps, sent, pushed, saved, calls };
}
const msg = (text: string) => ({ type: 'message', replyToken: 'r', source: { type: 'user', userId: U }, message: { type: 'text', text } });

test('referral codes: 4 characters, optional APR- prefix, no look-alikes', () => {
  assert.equal(refCode('apr-7k2m'), '7K2M');
  assert.equal(refCode('APR 7K2M'), '7K2M');
  assert.equal(refCode('APR-7K1M'), '');
  assert.equal(refCode('7K2M'), ''); // a bare word is a normal message
});

test('events from the AI are validated before they are saved', () => {
  const e = cleanEvents({
    events: [
      { date: '2026-11-27', time: '15:00', title: ' 開會 ' },
      { date: 'friday', time: '', title: 'x' },
      { date: '2026-11-28', time: '25:00', title: '看牙醫' },
    ],
  });
  assert.deepEqual(e, [
    { day: '2026-11-27', time: '15:00', title: '開會' },
    { day: '2026-11-28', time: '', title: '看牙醫' },
  ]);
  assert.equal(eventLine(e[0]), '11/27（五） 15:00 開會');
});

const turn = (over: object) => ({ kind: 'note', events: [], expenses: [], todos: [], remind: { time: '', text: '' }, reply: '好的', ...over });

test('a message is answered, saved and only then counted; the tour says which step is next', async () => {
  const f = fixture([{ allowed: true, kind: 'free', left: 5 }, { allowed: true, kind: 'free', left: 4 }]);
  const ok = await secretaryGateway(
    msg('週五下午三點開會'),
    f.deps(ai(turn({ kind: 'event', events: [{ date: '2026-11-27', time: '15:00', title: '開會' }] }))),
  );
  assert.equal(ok, true);
  assert.deepEqual(f.saved, [{ line_user_id: U, kind: 'event', day: '2026-11-27', time: '15:00', title: '開會', amount: null }]);
  assert.deepEqual(f.calls.map((c) => [c[0], c[1].p_commit]), [
    ['line_oa_kit_sec_take', false],
    ['line_oa_kit_sec_take', true],
  ]);
  const sent = JSON.stringify(f.sent);
  assert.match(sent, /已記下行程/);
  assert.match(sent, /這是「記行程」功能/);
  assert.match(sent, /下一步（2\/5）：我也會幫你記帳/);
  assert.match(sent, /午餐 120、計程車 250/); // the chip for step 2
  assert.equal(f.sent.length, 1);
});

test('the five steps: each kind is saved for what it is, and the fifth ends with a summary', async () => {
  // Step 2, expense: today's total includes what was saved earlier today.
  const e = fixture([{ allowed: true, kind: 'free', left: 4 }, { allowed: true, kind: 'free', left: 3 }]);
  e.saved.push({ line_user_id: U, kind: 'expense', day: '2026-11-24', time: '', title: '早餐', amount: 60 });
  await secretaryGateway(msg('午餐 120、計程車 250'), e.deps(ai(turn({ expenses: [{ title: '午餐', amount: 120 }, { title: '計程車', amount: 250 }] }))));
  assert.deepEqual(e.saved.slice(1).map((r) => [r.kind, r.title, r.amount]), [['expense', '午餐', 120], ['expense', '計程車', 250]]);
  assert.match(JSON.stringify(e.sent), /今天合計 NT\$430/);
  assert.match(JSON.stringify(e.sent), /下一步（3\/5）/);
  // Step 4, reminder: shown as a demonstration and said to be one.
  const r = fixture([{ allowed: true, kind: 'free', left: 2 }, { allowed: true, kind: 'free', left: 1 }]);
  await secretaryGateway(msg('每天早上八點提醒我喝水'), r.deps(ai(turn({ remind: { time: '08:00', text: '喝水' } }))));
  assert.deepEqual([r.saved[0].kind, r.saved[0].time, r.saved[0].title], ['remind', '08:00', '喝水']);
  assert.match(JSON.stringify(r.sent), /不會真的傳提醒/);
  // Off script: step 3 expects a todo but a calendar entry arrives; it is still kept.
  const o = fixture([{ allowed: true, kind: 'free', left: 3 }, { allowed: true, kind: 'free', left: 2 }]);
  await secretaryGateway(msg('明天九點看牙醫'), o.deps(ai(turn({ events: [{ date: '2026-11-25', time: '09:00', title: '看牙醫' }] }))));
  assert.equal(o.saved[0].kind, 'event');
  assert.match(JSON.stringify(o.sent), /這一步原本想讓你試試「待辦清單」/);
  // Step 5, a question: answered from records, nothing saved, then the summary card.
  const q = fixture([{ allowed: true, kind: 'free', left: 1 }, { allowed: true, kind: 'free', left: 0 }]);
  let seen = '';
  await secretaryGateway(
    msg('我這週有什麼事？'),
    q.deps(async (_u: any, init: any) => ((seen = String(init.body)), ai(turn({ kind: 'ask', reply: '週五 15:00 開會。' }))())),
  );
  assert.match(seen, /records/);
  assert.equal(q.saved.length, 0);
  assert.equal(q.sent.length, 2);
  assert.match(JSON.stringify(q.sent[0]), /秘書的回答/);
  assert.match(JSON.stringify(q.sent[1]), /五項功能都試過了/);
  assert.match(JSON.stringify(q.sent[1]), /member\.html/);
  // Members are not on the tour.
  const m = fixture([{ allowed: true, kind: 'member', left: 19 }, { allowed: true, kind: 'member', left: 18 }]);
  await secretaryGateway(msg('記得繳停車費'), m.deps(ai(turn({ todos: ['繳停車費'] }))));
  assert.doesNotMatch(JSON.stringify(m.sent), /下一步|這是「/);
});

test('the AI reply is validated: bad amounts, times and kinds never reach the database', async () => {
  const { cleanTurn, rowsOf } = await import('../supabase/functions/_shared/aprico-tour.ts');
  const t = cleanTurn({ kind: 'event', events: [], expenses: [{ title: '午餐', amount: -5 }, { title: '', amount: 10 }, { title: '晚餐', amount: 200 }], todos: [], remind: { time: '25:00', text: 'x' }, reply: 'ok' });
  assert.equal(t.kind, 'expense'); // what was found decides, not what the AI claims
  assert.deepEqual(t.expenses, [{ title: '晚餐', amount: 200 }]);
  assert.equal(t.remind, null);
  assert.equal(cleanTurn({ kind: 'drop tables', reply: 'x' }).kind, 'note');
  assert.deepEqual(rowsOf(cleanTurn({ kind: 'ask', reply: 'x' }), U, '2026-11-24'), []);
});

test('when the AI fails nothing is counted; when the allowance is used up the AI is not called', async () => {
  const f = fixture([{ allowed: true, kind: 'free', left: 5 }]);
  await secretaryGateway(msg('明天開會'), f.deps(async () => new Response('{}', { status: 500 })));
  assert.equal(f.calls.length, 1);
  assert.match(JSON.stringify(f.sent[0]), /不會扣/);
  const g = fixture([{ allowed: false, kind: 'free', left: 0 }]);
  let called = false;
  await secretaryGateway(msg('再一則'), g.deps(async () => ((called = true), new Response('{}'))));
  assert.equal(called, false);
  assert.match(JSON.stringify(g.sent[0]), /免費 5 則用完了/);
  assert.match(JSON.stringify(g.sent[0]), /member\.html/);
});

test('行事曆 is free; a referral code credits the friend and tells them', async () => {
  const f = fixture([], { ok: true, referrer: 'U' + 'b'.repeat(32), refs: 1 });
  await secretaryGateway(msg('行事曆'), f.deps());
  assert.equal(f.calls.length, 0);
  assert.match(JSON.stringify(f.sent[0]), /還沒有行程/);
  await secretaryGateway(msg('APR-7K2M'), f.deps());
  assert.deepEqual(f.calls[0], ['line_oa_kit_sec_refer', { p_user: U, p_code: '7K2M' }]);
  assert.equal(f.pushed[0][0], 'U' + 'b'.repeat(32));
  assert.match(JSON.stringify(f.pushed[0][1]), /禮物光球/);
});

test('groups, unsigned requests and non-text messages are left to other handlers', async () => {
  const f = fixture([]);
  assert.equal(await secretaryGateway({ ...msg('hi'), source: { type: 'group', groupId: 'C1', userId: U } }, f.deps()), false);
  assert.equal(await secretaryGateway(msg('hi'), { ...f.deps(), authenticated: false }), false);
  assert.equal(await secretaryGateway({ ...msg(''), message: { type: 'image' } }, f.deps()), false);
});

test('a member whose own OA is connected is sent there instead of using the shared secretary', async () => {
  const f = fixture([], undefined, true);
  let called = false;
  await secretaryGateway(msg('明天開會'), f.deps(async () => ((called = true), new Response('{}'))));
  assert.equal(called, false);
  assert.equal(f.calls.length, 0);
  assert.match(JSON.stringify(f.sent[0]), /你自己的官方帳號/);
});

test('the operator replays the tour with 「測試導覽」: no allowance used, own OA not in the way', async () => {
  // A member with their own OA connected, like the operator's main account.
  const f = fixture([], undefined, true);
  let tour = 0;
  const from = f.db.from;
  (f.db as any).from = (table: string) => {
    const q: any = from();
    if (table !== 'line_oa_kit_sec_users') return q;
    q.maybeSingle = async () => ({ data: { tour_test: tour } });
    q.update = (v: any) => ((tour = v.tour_test), q);
    return q;
  };
  const deps = (fetcher?: any) => ({ ...f.deps(fetcher), operator: U });
  await secretaryGateway(msg('測試導覽'), deps());
  assert.equal(tour, 5);
  assert.match(JSON.stringify(f.sent), /第一步（1\/5）/);
  f.sent.length = 0;
  await secretaryGateway(msg('週五下午三點開會'), deps(ai(turn({ events: [{ date: '2026-11-27', time: '15:00', title: '開會' }] }))));
  assert.equal(tour, 4);
  assert.match(JSON.stringify(f.sent), /下一步（2\/5）/);
  assert.equal(f.calls.filter((c) => c[0] === 'line_oa_kit_sec_take').length, 0);
  // The last step ends the replay; afterwards the account is itself again.
  tour = 1;
  f.sent.length = 0;
  await secretaryGateway(msg('我這週有什麼事？'), deps(ai(turn({ kind: 'ask', reply: '週五開會。' }))));
  assert.equal(tour, 0);
  assert.match(JSON.stringify(f.sent), /五項功能都試過了/);
  f.sent.length = 0;
  await secretaryGateway(msg('明天開會'), deps());
  assert.match(JSON.stringify(f.sent), /你自己的官方帳號/);
  // Anyone else typing the words is an ordinary message.
  const g = fixture([{ allowed: false, kind: 'free', left: 0 }]);
  await secretaryGateway(msg('測試導覽'), { ...g.deps(), operator: 'U' + 'c'.repeat(32) });
  assert.match(JSON.stringify(g.sent), /免費 5 則用完了/);
});
