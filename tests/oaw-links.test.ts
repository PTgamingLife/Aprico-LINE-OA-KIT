import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanScope, inboxUrl, oawLinks } from '../supabase/functions/_shared/oaw-links.ts';

// Small in-memory stand-in for the Supabase query builder (only what oawLinks uses).
function memoryDb() {
  const tables: Record<string, any[]> = {};
  let n = 0;
  const db = {
    tables,
    from(name: string) {
      const rows = (tables[name] ??= []);
      let filters: ((r: any) => boolean)[] = [];
      let mode: 'select' | 'update' | 'delete' | 'insert' = 'select';
      let patch: any = null,
        inserted: any[] = [],
        head = false,
        lim = Infinity;
      const matches = () => rows.filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (mode === 'insert') return inserted;
        const hit = matches();
        if (mode === 'update') hit.forEach((r) => Object.assign(r, patch));
        if (mode === 'delete') hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
        return hit.slice(0, lim);
      };
      const q: any = {
        select: (_c?: string, o?: any) => ((head = Boolean(o?.head)), q),
        insert: (v: any) => {
          mode = 'insert';
          inserted = (Array.isArray(v) ? v : [v]).map((r) => ({
            id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
            created_at: new Date(Date.now() + n).toISOString(),
            at: new Date().toISOString(),
            ...r,
          }));
          rows.push(...inserted);
          return q;
        },
        update: (v: any) => ((mode = 'update'), (patch = v), q),
        delete: () => ((mode = 'delete'), q),
        eq: (k: string, v: any) => (filters.push((r) => r[k] === v), q),
        neq: (k: string, v: any) => (filters.push((r) => r[k] !== v), q),
        gt: (k: string, v: any) => (filters.push((r) => r[k] > v), q),
        gte: (k: string, v: any) => (filters.push((r) => r[k] >= v), q),
        in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), q),
        or: (expr: string) => {
          const parts = [...expr.matchAll(/(\w+)\.eq\.([\w-]+)/g)].map((m) => [m[1], m[2]]);
          // Pairs grouped by and(...) when present, otherwise any of the conditions.
          const groups = expr.includes('and(')
            ? [parts.slice(0, 2), parts.slice(2, 4)]
            : parts.map((p) => [p]);
          filters.push((r) => groups.some((g) => g.every(([k, v]) => r[k] === v)));
          return q;
        },
        order: () => q,
        limit: (x: number) => ((lim = x), q),
        single: async () => ({ data: run()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (res: any) => {
          const data = run();
          return res(head ? { count: data.length, error: null } : { data, error: null });
        },
      };
      return q;
    },
  };
  return db;
}

const respond = (data: unknown, status = 200) => Response.json(data, { status });
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222';
const key = 'B' + 'A'.repeat(85) + '==';
const inboxA = 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/oaaaaa-api',
  inboxB = 'https://bcdefghijklmnopqrstu.supabase.co/functions/v1/oabbbb-api';
const call = async (db: any, project: string, body: any, pings: string[] = []) => {
  const res = await oawLinks(
    body,
    db,
    { project_id: project, line_subject: 'U' + 'a'.repeat(32) },
    respond,
    (async (url: string) => (pings.push(url), new Response('{}'))) as any,
    () => {},
  );
  return { status: res.status, body: await res.json() };
};

test('scope and inbox address are validated', () => {
  assert.equal(cleanScope({ daily: 999 }).daily, 100);
  assert.equal(cleanScope({ send: { manual: 'yes' } }).send.manual, false);
  assert.equal(inboxUrl(inboxA), inboxA);
  assert.equal(inboxUrl('https://evil.example.com/functions/v1/oaaaaa-api'), null);
});

test('pair with a one-time code, send within scope, deliver and acknowledge', async () => {
  const db = memoryDb(),
    pings: string[] = [];
  const created = await call(db, A, { op: 'create', label: '行政部', key, inbox: inboxA });
  assert.equal(created.status, 200);
  assert.match(created.body.code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(
    (await call(db, A, { op: 'accept', code: created.body.code, label: 'x', key, inbox: inboxA }))
      .status,
    409,
  );
  const accepted = await call(
    db,
    B,
    { op: 'accept', code: created.body.code, label: '設計部', key, inbox: inboxB },
    pings,
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.link.peerLabel, '行政部');
  assert.deepEqual(pings, [inboxA]); // A hears that B accepted
  // The code is single use.
  assert.equal(
    (await call(db, B, { op: 'accept', code: created.body.code, label: 'y', key, inbox: inboxB }))
      .status,
    404,
  );

  const id = created.body.id;
  const sent = await call(
    db,
    A,
    { op: 'send', linkId: id, kind: 'manual', sealed: 'c2VhbGVk' },
    pings,
  );
  assert.equal(sent.status, 200);
  assert.equal(pings.at(-1), inboxB);
  // A has not opened automatic copies of events: refused.
  assert.equal(
    (await call(db, A, { op: 'send', linkId: id, kind: 'events', sealed: 'x' })).status,
    403,
  );

  const inbox = await call(db, B, { op: 'inbox' });
  assert.equal(inbox.body.messages.length, 1);
  assert.equal(inbox.body.messages[0].from_label, '行政部');
  assert.equal(inbox.body.messages[0].sealed, 'c2VhbGVk');
  await call(db, B, { op: 'ack', ids: [inbox.body.messages[0].id] });
  assert.equal((await call(db, B, { op: 'inbox' })).body.messages.length, 0);
  // Only metadata in the log.
  assert.doesNotMatch(JSON.stringify(db.tables.line_oa_kit_link_log), /c2VhbGVk/);
});

test('daily limit, outsiders and revoke', async () => {
  const db = memoryDb();
  const { body } = await call(db, A, { op: 'create', label: '行政部', key, inbox: inboxA });
  await call(db, B, { op: 'accept', code: body.code, label: '設計部', key, inbox: inboxB });
  await call(db, A, {
    op: 'scope',
    linkId: body.id,
    scope: { send: { manual: true }, accept: { manual: true }, daily: 2 },
  });
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await call(db, A, { op: 'send', linkId: body.id, kind: 'manual', sealed: 'x' })).status,
      200,
    );
  assert.equal(
    (await call(db, A, { op: 'send', linkId: body.id, kind: 'manual', sealed: 'x' })).status,
    429,
  );
  const C = '33333333-3333-4333-8333-333333333333';
  assert.equal(
    (await call(db, C, { op: 'send', linkId: body.id, kind: 'manual', sealed: 'x' })).status,
    404,
  );
  assert.equal((await call(db, B, { op: 'revoke', linkId: body.id })).status, 200);
  assert.equal(
    (await call(db, A, { op: 'send', linkId: body.id, kind: 'manual', sealed: 'x' })).status,
    404,
  );
  const left = (await call(db, A, { op: 'inbox' })).body.messages;
  assert.deepEqual(
    left.map((m: any) => m.kind),
    ['revoked'], // pending notices are cleared on revoke,
  );
});
