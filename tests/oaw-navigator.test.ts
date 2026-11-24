import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cleanCode, isNavigator, oawUnlock } from '../supabase/functions/_shared/oaw-navigator.ts';

const respond = (data: unknown, status = 200) => Response.json(data, { status });
const hash = (c: string) => createHash('sha256').update(c).digest('hex');

/** Minimal fake of the two tables. */
function fake(codes: any[]) {
  const nav = new Set<string>();
  const db = {
    from(table: string) {
      const f: Record<string, any> = {};
      const q: any = {
        update: () => q,
        select: () => q,
        eq: (k: string, v: any) => ((f[k] = v), q),
        is: () => q,
        gt: () => q,
        maybeSingle: async () => ({ data: nav.has(f.project_id) ? { project_id: f.project_id } : null }),
        upsert: async (row: any) => (nav.add(row.project_id), { error: null }),
        then: (ok: any) => {
          const now = Date.now();
          const hit = codes.filter(
            (c) => c.code_hash === f.code_hash && c.project_id === f.project_id && !c.used_at && c.expires > now,
          );
          hit.forEach((c) => (c.used_at = now));
          return ok({ data: hit.map((c) => ({ project_id: c.project_id })), error: null });
        },
      };
      return table ? q : q;
    },
  };
  return { db, nav };
}

test('unlock codes are normalised; look-alike characters are refused', () => {
  assert.equal(cleanCode('abcd-efgh-jkmn'), 'ABCDEFGHJKMN');
  assert.equal(cleanCode('ABCD EFGH JKMN'), 'ABCDEFGHJKMN');
  assert.equal(cleanCode('ABCD-EFGH-JKM1'), ''); // 1 is not in the alphabet
  assert.equal(cleanCode('ABCD'), '');
  assert.equal(cleanCode(null), '');
});

test('a code works once, only for its own project, and not after it expires', async () => {
  const codes = [
    { code_hash: hash('ABCDEFGHJKMN'), project_id: 'p1', used_at: null, expires: Date.now() + 1000 },
    { code_hash: hash('ZZZZYYYYXXXX'), project_id: 'p1', used_at: null, expires: Date.now() - 1 },
  ];
  const { db } = fake(codes);
  assert.equal((await oawUnlock({ code: 'ABCD-EFGH-JKMN' }, db, 'p2', respond)).status, 400);
  assert.equal(await isNavigator(db, 'p2'), false);
  assert.equal((await oawUnlock({ code: 'ZZZZ-YYYY-XXXX' }, db, 'p1', respond)).status, 400);
  const ok = await oawUnlock({ code: 'abcd-efgh-jkmn' }, db, 'p1', respond);
  assert.deepEqual(await ok.json(), { plan: 'navigator' });
  assert.equal(await isNavigator(db, 'p1'), true);
  assert.equal((await oawUnlock({ code: 'ABCD-EFGH-JKMN' }, db, 'p1', respond)).status, 400);
  assert.equal((await oawUnlock({ code: 'nope' }, db, 'p1', respond)).status, 400);
});
