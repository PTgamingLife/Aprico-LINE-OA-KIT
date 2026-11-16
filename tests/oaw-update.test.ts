import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blobSha,
  classify,
  oawUpdateAction,
  type Release,
} from '../supabase/functions/_shared/oaw-update.ts';

const subject = 'U' + 'b'.repeat(32);
const project = { id: '3745cb07-abcd-4c70-8b2b-1626adfa14b1' };
const respond = (data: unknown, status = 200) => Response.json(data, { status });
const enc = (s: string) => new TextEncoder().encode(s);

test('blob SHA matches git', async () => {
  // `printf 'hello\n' | git hash-object --stdin`
  assert.equal(await blobSha(enc('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

const release: Release = {
  version: '2026.11.15',
  ref: 'r'.repeat(40),
  files: {
    '.github/workflows/oaw-setup.yml': { sha: 'w2', mode: '100644', known: ['w1'] },
    'liff/app.js': { sha: 'a2', mode: '100644', known: ['a1'] },
    'liff/menu-shapes.js': { sha: 'm1', mode: '100644', known: [] },
    'liff/old.js': { sha: null, mode: '100644', known: ['o1'] },
    'scripts/x.mjs': { sha: 'x2', mode: '100644', known: ['x1'] },
    'tests/t.ts': { sha: 't2', mode: '100644', known: ['t1'] },
    'oaw/config.json': { sha: 'evil', mode: '100644', known: [] },
  },
};

test('classify: untouched files update, edits conflict, data files are never listed', () => {
  const steps = classify(release, {
    '.github/workflows/oaw-setup.yml': 'w1',
    'liff/app.js': 'mine',
    'liff/old.js': 'o1',
    'scripts/x.mjs': 'x2',
    'oaw/config.json': 'customer',
  });
  assert.deepEqual(steps, [
    { path: '.github/workflows/oaw-setup.yml', action: 'update' },
    { path: 'liff/app.js', action: 'conflict', kind: 'modified' },
    { path: 'liff/menu-shapes.js', action: 'add' },
    { path: 'liff/old.js', action: 'delete' },
    { path: 'tests/t.ts', action: 'conflict', kind: 'deleted' },
  ]);
});

function setup(paid = true, perms: any = null) {
  const calls: string[] = [];
  const inserted: any[] = [];
  const PERMS = perms ?? {
    contents: 'write',
    pages: 'write',
    secrets: 'write',
    actions: 'write',
    actions_variables: 'write',
    workflows: 'write',
  };
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({
      data: { installation_id: 7, repository_id: 9, full_name: 'cust/my-oa' },
    }),
    insert: async (rows: any[]) => (inserted.push(...rows), { error: null }),
  };
  const db = { from: () => q, rpc: async () => ({ data: { paid } }) };
  const files: Record<string, Uint8Array> = {
    '.github/workflows/oaw-setup.yml': enc('new workflow\n'),
    'liff/app.js': enc('new app\n'),
    'liff/menu-shapes.js': enc('shapes\n'),
    'tests/t.ts': enc('test\n'),
  };
  const fetcher = async (url: any, o: any = {}) => {
    const u = String(url);
    const method = o.method ?? 'GET';
    if (u.startsWith('https://raw.githubusercontent.com/')) {
      calls.push('RAW ' + u.split('/').slice(-2).join('/'));
      const path = u.split(release.ref + '/')[1];
      return new Response(files[path]);
    }
    const path = u.replace('https://api.github.com', '');
    calls.push(`${method} ${path}`);
    if (path === '/repos/cust/my-oa/installation')
      return Response.json({ id: 7, permissions: PERMS, target_type: 'User' });
    if (path.startsWith('/app/installations/7/access_tokens'))
      return Response.json({ token: 'ghs_x' });
    if (path === '/repos/cust/my-oa') return Response.json({ default_branch: 'main' });
    if (path === '/repos/cust/my-oa/git/ref/heads/main')
      return Response.json({ object: { sha: 'head' } });
    if (path === '/repos/cust/my-oa/git/commits/head')
      return Response.json({ tree: { sha: 'tree0' } });
    if (path.startsWith('/repos/cust/my-oa/git/trees/tree0'))
      return Response.json({
        truncated: false,
        tree: [
          { path: '.github/workflows/oaw-setup.yml', type: 'blob', sha: 'w1' },
          { path: 'liff/app.js', type: 'blob', sha: 'mine' },
          { path: 'liff/old.js', type: 'blob', sha: 'o1' },
          { path: 'scripts/x.mjs', type: 'blob', sha: 'x2' },
          { path: 'oaw/config.json', type: 'blob', sha: 'customer' },
        ],
      });
    if (path.endsWith('/contents/oaw/template-version.json'))
      return new Response('', { status: 404 });
    if (path === '/repos/cust/my-oa/git/blobs') return Response.json({ sha: 'blob-new' });
    if (path === '/repos/cust/my-oa/git/trees') {
      calls.push('TREE ' + o.body);
      return Response.json({ sha: 'tree1' });
    }
    if (path === '/repos/cust/my-oa/git/commits') return Response.json({ sha: 'c1' });
    return method === 'GET' ? Response.json({}) : new Response(null, { status: 204 });
  };
  return { db, calls, inserted, fetcher, files };
}

async function withShas(s: ReturnType<typeof setup>) {
  const r: Release = structuredClone(release);
  for (const [path, bytes] of Object.entries(s.files)) r.files[path].sha = await blobSha(bytes);
  return r;
}
const run = async (b: any, s = setup()) =>
  oawUpdateAction(
    b,
    s.db,
    subject,
    project,
    respond,
    s.fetcher as any,
    async () => 'jwt',
    await withShas(s),
  );

test('plan lists changes and conflicts without writing anything', async () => {
  const s = setup();
  const res = await run({ action: 'oaw_update_plan' }, s);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.version, '2026.11.15');
  assert.equal(body.current, null);
  assert.equal(body.changes, 3);
  assert.deepEqual(body.conflicts, [
    { path: 'liff/app.js', kind: 'modified' },
    { path: 'tests/t.ts', kind: 'deleted' },
  ]);
  assert.ok(!s.calls.some((c) => /^(POST|PATCH) \/repos/.test(c)));
});

test('apply keeps conflicts by default, never touches data files, reports without personal data', async () => {
  const s = setup();
  const res = await run({ action: 'oaw_update_apply', choices: { 'tests/t.ts': 'take' } }, s);
  assert.equal(res.status, 200);
  const tree = JSON.parse(s.calls.find((c) => c.startsWith('TREE '))!.slice(5));
  const paths = tree.tree.map((e: any) => e.path).sort();
  assert.deepEqual(paths, [
    '.github/workflows/oaw-setup.yml',
    'liff/menu-shapes.js',
    'liff/old.js',
    'oaw/template-version.json',
    'tests/t.ts',
  ]);
  assert.equal(tree.tree.find((e: any) => e.path === 'liff/old.js').sha, null);
  assert.ok(s.calls.includes('PATCH /repos/cust/my-oa/git/refs/heads/main'));
  assert.ok(s.calls.includes('POST /repos/cust/my-oa/actions/workflows/oaw-setup.yml/dispatches'));
  assert.ok(s.calls.includes('DELETE /installation/token'));
  const report = JSON.stringify(s.inserted);
  assert.doesNotMatch(report, /cust|my-oa|3745cb07|U[b]{32}/);
  assert.deepEqual(
    s.inserted.map((r) => [r.kind, r.path, r.choice]),
    [
      ['applied', null, null],
      ['modified', 'liff/app.js', 'keep'],
      ['deleted', 'tests/t.ts', 'take'],
    ],
  );
});

test('a tampered download stops the update before anything is written', async () => {
  const s = setup();
  const r = await withShas(s);
  r.files['liff/menu-shapes.js'].sha = 'f'.repeat(40);
  const res = await oawUpdateAction(
    { action: 'oaw_update_apply' },
    s.db,
    subject,
    project,
    respond,
    s.fetcher as any,
    async () => 'jwt',
    r,
  );
  assert.equal(res.status, 502);
  assert.ok(!s.calls.some((c) => c.startsWith('PATCH ')));
});

test('updates need a subscription and the workflows permission', async () => {
  assert.equal((await run({ action: 'oaw_update_plan' }, setup(false))).status, 402);
  const noWorkflows = setup(true, {
    contents: 'write',
    pages: 'write',
    secrets: 'write',
    actions: 'write',
    actions_variables: 'write',
  });
  const res = await run({ action: 'oaw_update_plan' }, noWorkflows);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'github_permissions_required');
});

test('a removed App installation closes the stale binding and asks to re-authorise', async () => {
  const s = setup();
  const updates: any[] = [];
  const q: any = {
    select: () => q,
    eq: () => q,
    update: (v: any) => (updates.push(v), q),
    maybeSingle: async () => ({
      data: { installation_id: 7, repository_id: 9, full_name: 'cust/my-oa' },
    }),
  };
  const db = { from: () => q, rpc: async () => ({ data: { paid: true } }) };
  const gone = async () => new Response('', { status: 404 });
  const res = await oawUpdateAction(
    { action: 'oaw_update_plan' },
    db,
    subject,
    project,
    respond,
    gone as any,
    async () => 'jwt',
    await withShas(s),
  );
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'github_binding_required');
  assert.ok(updates[0]?.revoked_at);
});
