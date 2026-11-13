import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OAW_SECRETS, oawBuildAction, projectPx } from '../supabase/functions/_shared/oaw-build.ts';

const subject = 'U' + 'b'.repeat(32);
const project = { id: '3745cb07-abcd-4c70-8b2b-1626adfa14b1' };
const respond = (data: unknown, status = 200) => Response.json(data, { status });
const db = (
  paid = true,
  conn: any = { installation_id: 7, repository_id: 9, full_name: 'cust/my-oa' },
) => {
  const q: any = {
    select: () => q,
    eq: () => q,
    update: () => q,
    maybeSingle: async () => ({ data: conn }),
  };
  return { from: () => q, rpc: async () => ({ data: { paid } }) };
};
const PERMS = {
  contents: 'write',
  pages: 'write',
  secrets: 'write',
  actions: 'write',
  actions_variables: 'write',
};

function github(perms = PERMS) {
  const calls: string[] = [];
  const fetcher = async (url: any, o: any) => {
    const path = String(url).replace('https://api.github.com', '');
    calls.push(`${o.method} ${path}`);
    if (path === '/repos/cust/my-oa/installation')
      return Response.json({ id: 7, permissions: perms, target_type: 'User' });
    if (path.startsWith('/app/installations/7/access_tokens'))
      return Response.json({ token: 'ghs_x' });
    if (path.endsWith('/secrets/public-key')) return Response.json({ key_id: 'k1', key: 'PUBKEY' });
    if (path.includes('/actions/variables/') && o.method === 'PATCH')
      return new Response('', { status: 404 });
    if (path.endsWith('/contents/oaw/config.json') && o.method === 'GET')
      return Response.json({ sha: 'abc' });
    if (path.endsWith('/contents/oaw/status.json'))
      return Response.json({
        content: btoa(JSON.stringify({ ok: true, steps: { liff: 'x' }, basic_id: '@a' })),
      });
    if (path.includes('/runs?'))
      return Response.json({ workflow_runs: [{ status: 'completed', conclusion: 'success' }] });
    return o.method === 'DELETE' || o.method === 'PUT' || o.method === 'POST'
      ? new Response(null, { status: 204 })
      : Response.json({});
  };
  return { calls, fetcher };
}
const call = (b: any, d = db(), g = github()) =>
  oawBuildAction(b, d, subject, project, respond, g.fetcher as any, async () => 'jwt');

test('the prefix is derived from the project and is a valid OAW_PX', () => {
  assert.match(projectPx(project.id), /^[a-z][a-z0-9]{1,7}$/);
});

test('unpaid owners and unconnected repos cannot build', async () => {
  assert.equal((await call({ action: 'oaw_build_key' }, db(false))).status, 402);
  assert.equal((await call({ action: 'oaw_build_key' }, db(true, null))).status, 409);
});

test('missing App permissions send the owner to the GitHub approval page', async () => {
  const res = await call(
    { action: 'oaw_build_key' },
    db(),
    github({ ...PERMS, secrets: 'read' } as any),
  );
  assert.equal(res.status, 409);
  assert.match((await res.json()).url, /settings\/installations\/7$/);
});

test('the browser gets the repo public key, never a token', async () => {
  const g = github();
  const out = await (await call({ action: 'oaw_build_key' }, db(), g)).json();
  assert.deepEqual(out, { repo: 'cust/my-oa', keyId: 'k1', key: 'PUBKEY', secrets: OAW_SECRETS });
  assert.ok(g.calls.includes('DELETE /installation/token'));
});

test('start writes only ciphertext secrets, variables and config, then runs setup', async () => {
  const g = github();
  const secrets = Object.fromEntries(OAW_SECRETS.map((n) => [n, 'c2VhbGVk']));
  const res = await call(
    { action: 'oaw_build_start', keyId: 'k1', secrets, template: 'health' },
    db(),
    g,
  );
  assert.equal(res.status, 200);
  for (const n of OAW_SECRETS)
    assert.ok(g.calls.includes(`PUT /repos/cust/my-oa/actions/secrets/${n}`));
  assert.ok(g.calls.includes('POST /repos/cust/my-oa/actions/variables'));
  assert.ok(g.calls.includes('POST /repos/cust/my-oa/actions/workflows/oaw-setup.yml/dispatches'));
  const reuse = github();
  await call(
    { action: 'oaw_build_start', keyId: 'k1', secrets, sbRef: 'abcdefghijklmnopqrst' },
    db(),
    reuse,
  );
  assert.ok(reuse.calls.includes('PATCH /repos/cust/my-oa/actions/variables/OAW_SB_REF'));
  assert.equal(
    (await call({ action: 'oaw_build_start', keyId: 'k1', secrets, sbRef: 'Bad-Ref' })).status,
    400,
  );
  // Plain text is refused: only base64 ciphertext is relayed.
  const bad = await call({
    action: 'oaw_build_start',
    keyId: 'k1',
    secrets: { ...secrets, OAW_LINE_MSG_SECRET: 'plain text!' },
  });
  assert.equal(bad.status, 400);
});

test('finish removes the App installation after a successful setup', async () => {
  const g = github();
  const res = await call({ action: 'oaw_build_finish' }, db(), g);
  assert.deepEqual(await res.json(), { removed: true });
  assert.ok(g.calls.includes('DELETE /app/installations/7'));
});
