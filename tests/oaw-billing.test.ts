import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billingAction,
  billingReminders,
  reminderCard,
} from '../supabase/functions/_shared/oaw-billing.ts';

const subject = 'U' + 'b'.repeat(32);
const respond = (data: unknown, status = 200) => Response.json(data, { status });
const env =
  (mode = 'production') =>
  (k: string) =>
    ({
      LINE_OA_KIT_LINEPAY_MODE: mode,
      LINE_OA_KIT_LINEPAY_CHANNEL_ID: '1234567890',
      LINE_OA_KIT_LINEPAY_CHANNEL_SECRET: 'secret',
      LINE_OA_KIT_LINEPAY_LIVE_ENABLED: 'true',
    })[k];
const ORDER = '11111111-1111-4111-8111-111111111111';
const TX = '2026111312345678901';

function fakeDb({ paid = false, order = null as any } = {}) {
  const rpcs: any[] = [],
    updates: any[] = [];
  let row: any = order;
  const q = (table: string) => {
    const c: any = { table, filters: {} };
    const chain: any = {
      select: () => chain,
      insert: (row: any) => ((c.insert = row), chain),
      update: (row: any) => (updates.push(row), (c.update = row), chain),
      delete: () => ((c.delete = true), chain),
      eq: (k: string, v: any) => ((c.filters[k] = v), chain),
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => {
        if (c.insert) row = { id: ORDER, ...c.insert, status: 'requesting', currency: 'TWD' };
        if (c.update) row = { ...row, ...c.update };
        return { data: row };
      },
      maybeSingle: async () => ({ data: c.update ? { id: ORDER } : order }),
      then: (r: any) => r(c.delete ? { data: [{ token_hash: 'x' }] } : { data: null, error: null }),
    };
    return chain;
  };
  return {
    rpcs,
    updates,
    from: q,
    rpc: async (name: string, args: any) => {
      rpcs.push({ name, args });
      if (name === 'line_oa_kit_quota_status')
        return { data: paid ? { paid: true, percentLeft: 90 } : { paid: false } };
      if (name === 'line_oa_kit_quota_order_settle')
        return { data: { status: 'paid', paidUntil: '2027-11-13' } };
      if (name === 'line_oa_kit_billing_due')
        return { data: [{ line_subject: subject, paid_until: '2026-12-12', kind: 'soon' }] };
      return { data: null };
    },
  };
}

function linePayApi() {
  const calls: string[] = [];
  const fetcher = async (url: any, o: any) => {
    const path = String(url).replace(/^https:\/\/[^/]+/, '');
    calls.push(`${o.method} ${path}`);
    if (path === '/v4/payments/request')
      return new Response(
        `{"returnCode":"0000","info":{"transactionId":${TX},"paymentUrl":{"web":"https://web-pay.line.me/pay"}}}`,
      );
    if (path.endsWith('/check')) return Response.json({ returnCode: '0110' });
    if (path.endsWith('/confirm')) return Response.json({ returnCode: '0000' });
    if (path.startsWith('/v4/payments?'))
      return new Response(
        `{"returnCode":"0000","info":[{"transactionType":"PAYMENT","transactionId":${TX},"orderId":"${ORDER}","currency":"TWD","payInfo":[{"amount":3870}]}]}`,
      );
    return Response.json({ returnCode: '9999' });
  };
  return { calls, fetcher };
}

test('a yearly order is created at NT$3,870 and sends the buyer to LINE Pay', async () => {
  const pay = linePayApi();
  const res = await billingAction(
    { action: 'sub_create', product: 'year' },
    fakeDb(),
    subject,
    respond,
    env(),
    pay.fetcher as any,
  );
  const out = await res.json();
  assert.equal(res.status, 200, JSON.stringify(out));
  assert.equal(out.order.paymentUrl, 'https://web-pay.line.me/pay');
  assert.ok(pay.calls.includes('POST /v4/payments/request'));
});

test('top-ups need an active subscription; unknown products are refused', async () => {
  const pay = linePayApi();
  assert.equal(
    (
      await billingAction(
        { action: 'sub_create', product: 'topup30' },
        fakeDb(),
        subject,
        respond,
        env(),
        pay.fetcher as any,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await billingAction(
        { action: 'sub_create', product: 'free' },
        fakeDb(),
        subject,
        respond,
        env(),
        pay.fetcher as any,
      )
    ).status,
    400,
  );
  assert.equal(pay.calls.length, 0);
});

test('confirm captures, verifies with LINE Pay, then settles once in the database', async () => {
  const pay = linePayApi();
  const db = fakeDb({
    order: {
      id: ORDER,
      line_subject: subject,
      product: 'year',
      amount: 3870,
      currency: 'TWD',
      environment: 'production',
      status: 'pending',
      transaction_id: TX,
    },
  });
  const res = await billingAction(
    { action: 'sub_confirm', orderId: ORDER },
    db,
    subject,
    respond,
    env(),
    pay.fetcher as any,
  );
  assert.equal(res.status, 200);
  assert.ok(pay.calls.some((c) => c.endsWith('/confirm')));
  const settle = db.rpcs.find((r) => r.name === 'line_oa_kit_quota_order_settle');
  assert.deepEqual(settle.args, { p_order: ORDER, p_subject: subject, p_transaction: TX });
});

test('reminders need a valid one-use tick and push one renewal card per row', async () => {
  const pushed: any[] = [];
  const bad = await billingReminders(
    new Request('https://x', { method: 'POST' }),
    fakeDb(),
    async () => {},
  );
  assert.equal(bad.status, 401);
  const ok = await billingReminders(
    new Request('https://x', { method: 'POST', headers: { 'x-billing-tick': 'a'.repeat(64) } }),
    fakeDb(),
    async (to, m) => pushed.push([to, m]),
  );
  assert.deepEqual(await ok.json(), { ok: true, sent: 1 });
  assert.equal(pushed[0][0], subject);
  assert.match(reminderCard('due', '2026-12-12').altText, /今天/);
});
