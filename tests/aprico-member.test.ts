import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  discountFor,
  memberAction,
  priceFor,
  reportDigest,
} from '../supabase/functions/_shared/aprico-member.ts';

const U = 'U' + 'a'.repeat(32);
const respond = (data: unknown, status = 200) => Response.json(data, { status });

test('prices: NT$180 / 1,800, 10% off at 3 referrals and 20% off at 5', () => {
  assert.deepEqual([0, 2, 3, 4, 5, 9].map(discountFor), [1, 1, 0.9, 0.9, 0.8, 0.8]);
  assert.equal(priceFor('month', 0), 180);
  assert.equal(priceFor('month', 3), 162);
  assert.equal(priceFor('year', 5), 1440);
});

function fake(user: any, opts: { gift?: any; reports?: number; key?: boolean } = {}) {
  const inserted: any[] = [];
  const db = {
    rpc: async (name: string) => {
      if (name === 'line_oa_kit_sec_user') return { data: user, error: null };
      if (name === 'line_oa_kit_sec_take') return { data: { allowed: true, kind: 'free', left: 3 } };
      if (name === 'line_oa_kit_sec_gift') return { data: opts.gift ?? { ok: false }, error: null };
      return { data: { paid: false } };
    },
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        gte: () => (table === 'line_oa_kit_sec_reports' ? Promise.resolve({ count: opts.reports ?? 0 }) : q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: table === 'line_oa_kit_runtime_keys' && opts.key ? { project_id: 'p' } : null }),
        insert: async (row: any) => (inserted.push(row), { error: null }),
        then: (ok: any) => ok({ data: [] }),
      };
      return q;
    },
  };
  return { db, inserted };
}

test('status shows the code, progress, gift state and discounted prices', async () => {
  const { db } = fake({ ref_code: '7K2M', refs: 3, gift_opened_at: null, trial_until: null }, { key: true });
  const s = await (await memberAction({ action: 'sec_status' }, db, U, respond)).json();
  assert.equal(s.refCode, 'APR-7K2M');
  assert.equal(s.gift, 'ready');
  assert.deepEqual(s.prices, { month: 162, year: 1620 });
  assert.equal(s.left, 3);
  assert.equal(s.connected, true);
  assert.equal(s.github, false);
  assert.match(s.latestVersion, /^\d{4}\.\d{2}\.\d{2}/);
});

test('the gift orb cannot be opened before a referral; reports are limited to 5 a day', async () => {
  const locked = fake({ ref_code: 'AAAA', refs: 0 });
  assert.equal((await memberAction({ action: 'sec_gift' }, locked.db, U, respond)).status, 409);
  const ok = fake({ ref_code: 'AAAA', refs: 1, gift_opened_at: '2026-11-24T00:00:00Z' }, { gift: { ok: true } });
  assert.equal((await (await memberAction({ action: 'sec_gift' }, ok.db, U, respond)).json()).gift, 'opened');
  const r = fake({ ref_code: 'AAAA', refs: 0 });
  assert.equal((await memberAction({ action: 'sec_report', text: ' ' }, r.db, U, respond)).status, 400);
  assert.equal((await memberAction({ action: 'sec_report', text: '提醒想改 8 點' }, r.db, U, respond)).status, 200);
  assert.deepEqual(r.inserted, [{ line_user_id: U, text: '提醒想改 8 點' }]);
  const full = fake({ ref_code: 'AAAA', refs: 0 }, { reports: 5 });
  assert.equal((await memberAction({ action: 'sec_report', text: 'x' }, full.db, U, respond)).status, 429);
});

test('the nightly report digest needs a one-use tick and marks reports as sent', async () => {
  const token = 'a'.repeat(64);
  const ticks = new Set([createHash('sha256').update(token).digest('hex')]);
  let marked: number[] = [];
  const db = {
    from: (table: string) => {
      let hash = '';
      const q: any = {
        delete: () => q,
        select: () => q,
        eq: (_k: string, v: string) => ((hash = v), q),
        gt: () => q,
        is: () => q,
        order: () => q,
        limit: async () => ({ data: [{ id: 1, text: '提醒沒有響' }, { id: 2, text: '想改提醒時間' }] }),
        update: () => q,
        in: async (_k: string, ids: number[]) => ((marked = ids), { error: null }),
        then: (ok: any) => ok({ data: table === 'line_oa_kit_sec_ticks' && ticks.delete(hash) ? [{ token_hash: hash }] : [] }),
      };
      return q;
    },
  };
  const sent: any[] = [];
  const push = async (to: string, m: any[]) => void sent.push([to, m[0].text]);
  const ai = async () =>
    new Response(JSON.stringify({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: '提醒相關 2 則：先看提醒排程。' }] }));
  const req = (t: string) => new Request('https://x/report-digest', { method: 'POST', headers: { 'x-sec-tick': t } });
  assert.equal((await reportDigest(req('bad'), db, 'k', U, push, ai as any)).status, 401);
  const ok = await reportDigest(req(token), db, 'k', U, push, ai as any);
  assert.deepEqual(await ok.json(), { reports: 2 });
  assert.equal(sent[0][0], U);
  assert.match(sent[0][1], /今日問題回報（2 則）[\s\S]*先看提醒排程/);
  assert.deepEqual(marked, [1, 2]);
  assert.equal((await reportDigest(req(token), db, 'k', U, push, ai as any)).status, 401); // used once
});
