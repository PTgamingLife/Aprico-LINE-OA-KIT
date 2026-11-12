import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthScan, healthScore } from '../supabase/functions/_shared/oaw-health.ts';

const key = 'aprico_' + 'a'.repeat(64);
const owner = 'U' + 'b'.repeat(32);
const projectId = '11111111-1111-4111-8111-111111111111';
const db = () => {
  const calls: any[] = [];
  const q: any = {
    select: () => q,
    eq: () => q,
    is: () => q,
    maybeSingle: async () => ({ data: { project_id: projectId, line_subject: owner } }),
  };
  return {
    calls,
    from: () => q,
    rpc: async (name: string, args: any) => (calls.push({ name, args }), { data: { reserved: 1 } }),
  };
};
const img = { type: 'image/jpeg', data: 'AAAA' };
const req = (body: unknown) =>
  new Request('https://x/functions/v1/line-oa-kit-runtime-ai/health-scan', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
const report = (over: Record<string, unknown> = {}) => ({
  scores: { faceZone: [8, 8, 9, 8, 7, 8], tongue: [7, 8, 8, 7, 8], eye: [8, 9, 7, 8] },
  constitution: { type: '氣虛體質', description: '容易疲倦', crossVerify: '三診相符' },
  focus: [{ issue: '補氣調養', advice: '可能有糖尿病風險' }],
  ...over,
});
const ai =
  (payload: unknown, seen: any[] = []) =>
  async (_u: any, o: any) => {
    seen.push(JSON.parse(String(o.body)));
    return Response.json({
      id: 'm',
      model: 'claude-sonnet-5-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 4000, output_tokens: 1500 },
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    });
  };

test('score uses the facialmonitor v4 weights and rejects bad arrays', () => {
  const s = healthScore(report().scores)!;
  assert.equal(s.version, 4);
  assert.ok(s.total > 70 && s.total < 90);
  assert.equal(healthScore({ faceZone: [8], tongue: [], eye: [] }), null);
  assert.equal(healthScore({ ...report().scores, eye: [8, 9, 7, 11] }), null);
});

test('photos go to Claude as images and the report comes back without disease names', async () => {
  const seen: any[] = [],
    d = db();
  const res = await healthScan(
    req({ requestId: 'scan-000000001', face: img, tongue: img }),
    d,
    'k',
    ai(report(), seen),
  );
  assert.equal(res.status, 200);
  const out = (await res.json()).report;
  assert.equal(out.focus[0].advice, '建議請醫師確認');
  assert.ok(out.score.total > 0);
  const content = seen[0].messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[1].type, 'image');
  assert.equal(seen[0].output_config.format.type, 'json_schema');
  assert.equal(d.calls[0].name, 'line_oa_kit_quota_reserve');
});

test('missing or oversized photos are rejected before any quota is held', async () => {
  const d = db();
  const big = { type: 'image/jpeg', data: 'A'.repeat(1_400_004) };
  for (const body of [
    { requestId: 'scan-000000002', face: img },
    { requestId: 'scan-000000003', face: img, tongue: { type: 'image/gif', data: 'AAAA' } },
    { requestId: 'scan-000000004', face: img, tongue: big },
  ])
    assert.equal((await healthScan(req(body), d, 'k', ai(report()))).status, 400);
  assert.equal(d.calls.length, 0);
});

test('model output with broken scores is not passed on', async () => {
  const res = await healthScan(
    req({ requestId: 'scan-000000005', face: img, tongue: img }),
    db(),
    'k',
    ai(report({ scores: { faceZone: [1], tongue: [1], eye: [1] } })),
  );
  assert.equal(res.status, 502);
});

test('a request the API refuses releases the hold instead of keeping it', async () => {
  const d = db();
  const res = await healthScan(
    req({ requestId: 'scan-000000006', face: img, tongue: img }),
    d,
    'k',
    async () =>
      Response.json({ error: { type: 'invalid_request_error', message: 'x' } }, { status: 400 }),
  );
  assert.equal(res.status, 503);
  const settle = d.calls.find((c: any) => c.name === 'line_oa_kit_quota_settle');
  assert.deepEqual(settle.args.p_usage, {
    model: 'claude-sonnet-5-5',
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
  });
});
