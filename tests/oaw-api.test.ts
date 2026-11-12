import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oawApi, validOawConfig, cleanDigest } from '../supabase/functions/_shared/oaw-api.ts';
import { runtimeKeyDigest } from '../supabase/functions/_shared/runtime-ai.ts';

const key = 'aprico_' + 'a'.repeat(64);
const projectId = '11111111-1111-4111-8111-111111111111';
const owner = 'U' + 'b'.repeat(32);
const cell = (label = '', action = 'message', content = '') => ({
  label,
  action,
  content,
  format: 'text',
});
const config = {
  oaName: '測試',
  grid: 4,
  theme: 0,
  cells: [
    cell('關於我們', 'message', '介紹'),
    cell(),
    cell(),
    cell(),
    cell(),
    cell(),
    cell(),
    cell(),
  ],
  welcome: '歡迎',
  failure: '稍後回覆',
  secretary: false,
};

function fixture(paidRows: unknown[] = []) {
  const calls: any[] = [];
  const db = {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        limit: async () => ({ data: table === 'line_oa_kit_payments' ? paidRows : [] }),
        maybeSingle: async () => ({ data: { project_id: projectId, line_subject: owner } }),
      };
      return q;
    },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (name === 'line_oa_kit_quota_status')
        return {
          data: paidRows.length
            ? { paid: true, percentLeft: 63, extraTwdLeft: 20 }
            : { paid: false },
        };
      return { data: { reserved: 3 } };
    },
  };
  return { db, calls };
}

const req = (route: string, body: unknown, auth = key) =>
  new Request(`https://x/functions/v1/line-oa-kit-runtime-ai/${route}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth },
    body: JSON.stringify(body),
  });

const ai = (payload: unknown) => async (url: any, options: any) => {
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  const body = JSON.parse(String(options.body));
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.output_config.format.type, 'json_schema');
  return Response.json({
    id: 'msg',
    model: body.model,
    stop_reason: 'end_turn',
    usage: { input_tokens: 300, output_tokens: 200 },
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  });
};

test('every OAW route requires a valid project key', async () => {
  const { db } = fixture();
  const res = await oawApi(req('status', {}, 'aprico_bad'), db, 'k');
  assert.equal(res.status, 401);
  assert.ok(await runtimeKeyDigest(key));
});

test('status reports the subscription quota as percentages', async () => {
  assert.deepEqual(await (await oawApi(req('status', {}), fixture().db, 'k')).json(), {
    paid: false,
  });
  assert.deepEqual(
    await (await oawApi(req('status', {}), fixture([{ project_id: projectId }]).db, 'k')).json(),
    { paid: true, percentLeft: 63, extraTwdLeft: 20 },
  );
});

test('design returns a validated config and bills the owner quota as design', async () => {
  const { db, calls } = fixture();
  const changed = { ...config, grid: 6 };
  const res = await oawApi(
    req('design', { requestId: 'evt-design-0001', request: '改成 6 格', config }),
    db,
    'k',
    ai({ summary: '選單改成 6 格。', config: changed }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { summary: '選單改成 6 格。', config: changed });
  assert.equal(calls[0].name, 'line_oa_kit_quota_reserve');
  assert.equal(calls[0].args.p_feature, 'design');
  assert.equal(calls[0].args.p_subject, owner);
  assert.equal(calls[1].name, 'line_oa_kit_quota_settle');
  assert.equal(calls[1].args.p_usage.feature, 'design');
});

test('design rejects an invalid AI config instead of passing it on', async () => {
  const bad = { ...config, cells: config.cells.slice(0, 4) };
  const res = await oawApi(
    req('design', { requestId: 'evt-design-0002', request: '改', config }),
    fixture().db,
    'k',
    ai({ summary: 'x', config: bad }),
  );
  assert.equal(res.status, 502);
});

test('design input is validated before any points are reserved', async () => {
  const { db, calls } = fixture();
  const res = await oawApi(req('design', { requestId: 'short', request: '改', config }), db, 'k');
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('digest extracts records and drops malformed ones', async () => {
  const res = await oawApi(
    req('digest', {
      requestId: 'evt-digest-0001',
      messages: [{ at: '2026-11-12 10:00', who: 'owner', text: '明天下午三點看牙醫，午餐 120' }],
    }),
    fixture().db,
    'k',
    ai({
      events: [
        { date: '2026-11-13', time: '15:00', title: '看牙醫' },
        { date: 'tomorrow', time: '', title: 'x' },
      ],
      expenses: [
        { date: '2026-11-12', amount: 120, note: '午餐' },
        { date: '2026-11-12', amount: -5, note: 'bad' },
      ],
      todos: [],
      life: [],
      summary: '今天也辛苦了',
    }),
  );
  const out = await res.json();
  assert.deepEqual(out.events, [{ date: '2026-11-13', time: '15:00', title: '看牙醫' }]);
  assert.deepEqual(out.expenses, [{ date: '2026-11-12', amount: 120, note: '午餐' }]);
});

test('points errors map to clear status codes', async () => {
  const db = { ...fixture().db, rpc: async () => ({ data: { error: 'points_insufficient' } }) };
  const res = await oawApi(
    req('digest', {
      requestId: 'evt-digest-0002',
      messages: [{ at: 'x', who: 'friend', text: 'hi' }],
    }),
    db,
    'k',
  );
  assert.equal(res.status, 402);
});

test('config validator and digest cleaner guard the boundary', () => {
  assert.ok(validOawConfig(config));
  assert.ok(!validOawConfig({ ...config, theme: 9 }));
  assert.ok(
    !validOawConfig({
      ...config,
      cells: [...config.cells.slice(0, 7), cell('網站', 'web', 'http://x')],
    }),
  );
  assert.equal(cleanDigest({ summary: 'x'.repeat(100) }).summary.length, 60);
});

test('rate limited owners get 429 instead of an AI call', async () => {
  const db = { ...fixture().db, rpc: async () => ({ data: { error: 'rate_limited' } }) };
  const res = await oawApi(
    req('digest', {
      requestId: 'evt-digest-0003',
      messages: [{ at: 'x', who: 'owner', text: 'hi' }],
    }),
    db,
    'k',
    async () => {
      throw Error('AI must not be called');
    },
  );
  assert.equal(res.status, 429);
});
