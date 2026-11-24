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

test('a message is answered, saved and only then counted; the last two free ones are announced', async () => {
  const f = fixture([{ allowed: true, kind: 'free', left: 3 }, { allowed: true, kind: 'free', left: 2 }]);
  const ok = await secretaryGateway(
    msg('週五下午三點開會'),
    f.deps(ai({ events: [{ date: '2026-11-27', time: '15:00', title: '開會' }], reply: '好的' })),
  );
  assert.equal(ok, true);
  assert.deepEqual(f.saved, [{ line_user_id: U, day: '2026-11-27', time: '15:00', title: '開會' }]);
  assert.deepEqual(f.calls.map((c) => [c[0], c[1].p_commit]), [
    ['line_oa_kit_sec_take', false],
    ['line_oa_kit_sec_take', true],
  ]);
  assert.match(JSON.stringify(f.sent[0]), /已記下/);
  assert.match(JSON.stringify(f.sent[0]), /還剩 2 則/);
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
