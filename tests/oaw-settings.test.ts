import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oawApi } from '../supabase/functions/_shared/oaw-api.ts';
import { validHealthSettings } from '../supabase/functions/_shared/oaw-settings.ts';

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

const health = {
  thresholds: { sysHigh: 140, sysLow: 90, diaHigh: 90, diaLow: 60, gluHigh: 130, gluLow: 70 },
  reminders: [{ time: '08:00', kind: 'measure', label: '早上量血壓' }],
  ownerNotify: { reminders: true, events: true, weekly: true },
  caregivers: [{ index: 0, alert: true, missed: true, weekly: true }],
};
const ask = (body: unknown, reply: unknown) =>
  oawApi(
    req('settings', { requestId: 'evt-settings-0001', ...(body as object) }),
    fixture().db,
    'k',
    ai(reply),
  );

test('settings: a plain note stays a note', async () => {
  const res = await ask(
    { request: '明天下午三點看牙醫', config, health },
    { kind: 'note', summary: '', config: null, health: null },
  );
  assert.deepEqual(await res.json(), { kind: 'note' });
});

test('settings: a clear request becomes a validated change proposal', async () => {
  const changed = { ...health, ownerNotify: { reminders: true, events: true, weekly: false } };
  const res = await ask(
    { request: '我不要收週報', config, health },
    { kind: 'change', summary: '你將不再收到每週週報。', config: null, health: changed },
  );
  assert.deepEqual(await res.json(), {
    kind: 'change',
    summary: '你將不再收到每週週報。',
    config: null,
    health: changed,
  });
});

test('settings: an unclear request asks back', async () => {
  const res = await ask(
    { request: '停用通報', config, health },
    { kind: 'ask', summary: '要停哪一種通知？', config: null, health: null },
  );
  assert.deepEqual(await res.json(), { kind: 'ask', summary: '要停哪一種通知？' });
});

test('settings: bad model output and bad input are rejected', async () => {
  const wrong = { ...health, caregivers: [{ index: 3, alert: false, missed: true, weekly: true }] };
  assert.equal(
    (
      await ask(
        { request: '停用', config, health },
        { kind: 'change', summary: 'x', config: null, health: wrong },
      )
    ).status,
    502,
  );
  assert.equal(
    (
      await ask(
        { request: '改', config, health },
        { kind: 'change', summary: 'x', config: null, health: null },
      )
    ).status,
    502,
  );
  assert.equal((await ask({ request: '', config, health }, {})).status, 400);
  assert.ok(
    !validHealthSettings({ ...health, thresholds: { ...health.thresholds, sysHigh: 999 } }, 1),
  );
  // Templates without health send null and never get a health change back.
  const res = await ask(
    { request: '選單改成圓角', config, health: null },
    { kind: 'change', summary: '改成圓角。', config: { ...config, shape: 1 }, health },
  );
  assert.equal((await res.json()).health, null);
});
