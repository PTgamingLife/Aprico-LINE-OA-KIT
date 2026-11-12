import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_RE,
  connectCode,
  connectGateway,
  oawConnect,
} from '../supabase/functions/_shared/oaw-connect.ts';
import { runtimeKeyDigest } from '../supabase/functions/_shared/runtime-ai.ts';

const owner = 'U' + 'b'.repeat(32);
const projectId = '11111111-1111-4111-8111-111111111111';

function fakeDb({ paid = true, claimRows = [] as any[] } = {}) {
  const log: any[] = [];
  const q = (table: string) => {
    const call: any = { table, filters: [] };
    log.push(call);
    const chain: any = {
      select: (cols: string) => ((call.select = cols), chain),
      insert: async (row: any) => ((call.insert = row), { error: null }),
      upsert: async (row: any) => ((call.upsert = row), { error: null }),
      update: (row: any) => ((call.update = row), chain),
      eq: (c: string, v: any) => (call.filters.push(['eq', c, v]), chain),
      is: (c: string, v: any) => (call.filters.push(['is', c, v]), chain),
      gt: (c: string, v: any) => (call.filters.push(['gt', c, v]), chain),
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: { id: projectId } }),
      then: (resolve: any) =>
        resolve(
          call.select && call.update
            ? { data: claimRows, error: null }
            : { data: null, error: null },
        ),
    };
    return chain;
  };
  return {
    log,
    from: q,
    rpc: async () => ({ data: { paid } }),
  };
}

const ask = (text = '連接我的OA') => ({
  type: 'message',
  replyToken: 'r',
  source: { type: 'user', userId: owner },
  message: { type: 'text', text },
});

test('codes use an unambiguous 10-letter alphabet', () => {
  for (let i = 0; i < 50; i++) assert.match(connectCode(), CODE_RE);
});

test('asking in the Aprico OA stores only the digest and replies with a share link', async () => {
  const db = fakeDb(),
    replies: any[] = [];
  const handled = await connectGateway(ask(), {
    authenticated: true,
    db,
    reply: async (_t, m) => replies.push(...m),
  });
  assert.equal(handled, true);
  const row = db.log.find((c) => c.table === 'line_oa_kit_connect_codes').insert;
  assert.match(row.code_digest, /^[a-f0-9]{64}$/);
  assert.equal(row.project_id, projectId);
  const uri = replies[0].contents.footer.contents[0].action.uri;
  const code = decodeURIComponent(uri.split('?')[1]).replace('連接 ', '');
  assert.match(code, CODE_RE);
  assert.equal(await runtimeKeyDigest(code), row.code_digest);
});

test('unpaid owners get the subscription pitch and no code', async () => {
  const db = fakeDb({ paid: false }),
    replies: any[] = [];
  await connectGateway(ask(), {
    authenticated: true,
    db,
    reply: async (_t, m) => replies.push(...m),
  });
  assert.match(replies[0].altText, /尚未訂閱/);
  assert.ok(!db.log.some((c) => c.table === 'line_oa_kit_connect_codes'));
});

test('other messages and unauthenticated events pass through', async () => {
  const reply = async () => assert.fail('must not reply');
  assert.equal(
    await connectGateway(ask('你好'), { authenticated: true, db: fakeDb(), reply }),
    false,
  );
  assert.equal(await connectGateway(ask(), { authenticated: false, db: fakeDb(), reply }), false);
});

const claim = (code: string) =>
  new Request('https://x/functions/v1/line-oa-kit-runtime-ai/connect', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

test('a valid code is claimed once for a key and the owner is notified', async () => {
  const db = fakeDb({ claimRows: [{ line_subject: owner, project_id: projectId }] }),
    pushed: any[] = [];
  const res = await oawConnect(claim('abcdefghjk'), db, async (to, m) => pushed.push([to, m]));
  assert.equal(res.status, 200);
  assert.match((await res.json()).key, /^aprico_[a-f0-9]{64}$/);
  const update = db.log.find((c) => c.table === 'line_oa_kit_connect_codes');
  assert.deepEqual(
    update.filters.map((f: any) => f[1]),
    ['code_digest', 'used_at', 'expires_at'],
  );
  assert.equal(pushed[0][0], owner);
  assert.equal(pushed[0][1][0].contents.footer.contents[0].action.data, 'oaw-revoke:' + projectId);
});

test('unknown, used or malformed codes get no key', async () => {
  assert.equal((await oawConnect(claim('ABCDEFGHJK'), fakeDb(), async () => {})).status, 404);
  assert.equal((await oawConnect(claim('short'), fakeDb(), async () => {})).status, 400);
});
