import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lockAllFor,
  lockGateway,
  oawSecurityAction,
} from '../supabase/functions/_shared/oaw-security.ts';

const subject = 'U' + 'b'.repeat(32);
const project = { id: '3745cb07-abcd-4c70-8b2b-1626adfa14b1' };
const respond = (data: unknown, status = 200) => Response.json(data, { status });

function fakeDb(opts: { lock?: any; conn?: any; keys?: any[] } = {}) {
  const writes: any[] = [];
  const db = {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        is: async () => ({ data: opts.keys ?? [] }),
        maybeSingle: async () => ({
          data: table === 'line_oa_kit_owner_locks' ? (opts.lock ?? null) : (opts.conn ?? null),
        }),
        upsert: async (row: any) => (writes.push(['upsert', table, row]), { error: null }),
        delete: () => (writes.push(['delete', table]), q),
      };
      return q;
    },
  };
  return { db, writes };
}
const conn = { installation_id: 7, repository_id: 9, full_name: 'cust/my-oa' };

function github() {
  const calls: string[] = [];
  const fetcher = async (url: any, o: any = {}) => {
    const path = String(url).replace('https://api.github.com', '');
    calls.push(`${o.method ?? 'GET'} ${path}`);
    if (path === '/repos/cust/my-oa/installation')
      return Response.json({
        id: 7,
        target_type: 'User',
        permissions: {
          contents: 'write',
          pages: 'write',
          secrets: 'write',
          actions: 'write',
          actions_variables: 'write',
        },
      });
    if (path.startsWith('/app/installations/7/access_tokens'))
      return Response.json({ token: 'ghs_x' });
    if (path.endsWith('/secrets/public-key')) return Response.json({ key_id: 'k1', key: 'PUB' });
    if (path.includes('/actions/variables/') && o.method === 'PATCH')
      return new Response('', { status: 404 });
    return o.method && o.method !== 'GET' ? new Response(null, { status: 204 }) : Response.json({});
  };
  return { calls, fetcher };
}
const act = (b: any, db: any, g = github()) =>
  oawSecurityAction(b, db, subject, project, respond, g.fetcher as any, async () => 'jwt');

test('locking needs no GitHub; status shows it', async () => {
  const { db, writes } = fakeDb();
  assert.equal((await act({ action: 'oaw_lock' }, db)).status, 200);
  assert.deepEqual(writes[0].slice(0, 2), ['upsert', 'line_oa_kit_owner_locks']);
  const s = await (
    await act({ action: 'oaw_security_status' }, fakeDb({ lock: { locked_at: 't' } }).db)
  ).json();
  assert.equal(s.locked, true);
});

test('unlock and recovery need the GitHub App on the repo', async () => {
  const none = await act({ action: 'oaw_unlock' }, fakeDb().db);
  assert.equal(none.status, 409);
  assert.equal((await none.json()).code, 'github_binding_required');
  const { db, writes } = fakeDb({ conn, lock: { locked_at: 't' } });
  assert.equal((await act({ action: 'oaw_unlock' }, db)).status, 200);
  assert.deepEqual(writes.at(-1), ['delete', 'line_oa_kit_owner_locks']);
});

test('recovery stores only the sealed code, sets a reset nonce, runs setup and unlocks', async () => {
  const g = github();
  const { db, writes } = fakeDb({ conn });
  const bad = await act({ action: 'oaw_recover', keyId: 'k1', code: '123456 plain' }, db, g);
  assert.equal(bad.status, 400);
  const res = await act({ action: 'oaw_recover', keyId: 'k1', code: 'c2VhbGVk' }, db, g);
  assert.equal(res.status, 200);
  assert.ok(g.calls.includes('PUT /repos/cust/my-oa/actions/secrets/OAW_BIND_CODE'));
  assert.ok(g.calls.some((c) => c.startsWith('POST /repos/cust/my-oa/actions/variables')));
  assert.ok(g.calls.includes('POST /repos/cust/my-oa/actions/workflows/oaw-setup.yml/dispatches'));
  assert.ok(g.calls.includes('DELETE /installation/token'));
  assert.deepEqual(writes.at(-1), ['delete', 'line_oa_kit_owner_locks']);
});

test('「鎖定我的 OA」 locks every connected OA of the sender', async () => {
  const { db, writes } = fakeDb({
    keys: [{ project_id: 'p1' }, { project_id: 'p2' }, { project_id: 'p1' }],
  });
  assert.equal(await lockAllFor(db, subject), 2);
  assert.equal(writes[0][2].length, 2);
  const replies: any[] = [];
  const handled = await lockGateway(
    {
      type: 'message',
      replyToken: 'r',
      source: { type: 'user', userId: subject },
      message: { type: 'text', text: '鎖定我的 OA' },
    },
    { authenticated: true, db, reply: async (_t, m) => void replies.push(m) },
  );
  assert.equal(handled, true);
  assert.match(replies[0][0].text, /已鎖定你的 2 個官方帳號/);
  const other = await lockGateway(
    {
      type: 'message',
      replyToken: 'r',
      source: { type: 'user', userId: subject },
      message: { type: 'text', text: '你好' },
    },
    { authenticated: true, db, reply: async () => {} },
  );
  assert.equal(other, false);
});
