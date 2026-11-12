// Manual DB test for 20261112000100_oaw_subscription_quota.sql using PGlite (in-memory Postgres).
// Run: npm i --no-save @electric-sql/pglite@0.3.5 && node tests/oaw-quota-db.mjs supabase/migrations/20261112000100_oaw_subscription_quota.sql
// PGlite 0.3.5 crashes on exceptions raised inside plpgsql, so the raise paths are checked in review, not here.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
// Stand-ins for objects that already exist in production.
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.line_oa_kit_designs (id uuid primary key);
  insert into public.line_oa_kit_designs values ('11111111-1111-4111-8111-111111111111');`);
const sql = readFileSync(process.argv[2], 'utf8');
await db.exec(sql);
await db.exec(sql); // idempotent re-run
const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const P = '11111111-1111-4111-8111-111111111111', U = 'U' + 'a'.repeat(32);
const usage = (i, o) => ({ model: 'gpt-4.1-mini-2025-04-14', inputTokens: i, outputTokens: o, cachedTokens: 0 });

let r = await one(`select public.line_oa_kit_quota_reserve('r0',$1,$2,'design',0.01) as j`, [P, U]);
assert.equal(r.j.error, 'points_plan_required');
assert.deepEqual((await one(`select public.line_oa_kit_quota_status($1) as j`, [U])).j, { paid: false });

await one(`select public.line_oa_kit_subscription_extend($1, 1, 'manual')`, [U]);
let s = (await one(`select public.line_oa_kit_quota_status($1) as j`, [U])).j;
assert.equal(s.paid, true); assert.equal(s.percentLeft, 100); assert.equal(s.extraTwdLeft, 20);

// One call: hold 0.01 USD = NT$0.32, real cost 3000 in / 1500 out tokens.
r = await one(`select public.line_oa_kit_quota_reserve('r1',$1,$2,'design',0.01) as j`, [P, U]);
assert.equal(r.j.bucket, 'monthly');
const cost = Number((await one(`select public.line_oa_kit_quota_settle('r1',$1) as c`, [JSON.stringify(usage(3000, 1500))])).c);
assert.equal(cost, Number(((3000 * 0.4 + 1500 * 1.6) / 1e6 * 32).toFixed(6)));
assert.equal(Number((await one(`select used_twd from public.line_oa_kit_quota_periods`)).used_twd), cost);
// Settle is idempotent; duplicate request ids are refused.
assert.equal(Number((await one(`select public.line_oa_kit_quota_settle('r1',null) as c`)).c), cost);
assert.equal((await one(`select public.line_oa_kit_quota_reserve('r1',$1,$2,'design',0.01) as j`, [P, U])).j.error, 'points_request_exists');

// Exhaust the monthly NT$74: then grace NT$4 (sale NT$20), then refusal.
await db.query(`update public.line_oa_kit_quota_periods set used_twd = limit_twd - 0.1`);
r = await one(`select public.line_oa_kit_quota_reserve('r2',$1,$2,'digest',0.01) as j`, [P, U]);
assert.equal(r.j.bucket, 'grace');
const row = await one(`select held_monthly, held_grace from public.line_oa_kit_quota_usage where request_id='r2'`);
assert.equal(Number(row.held_monthly), 0.1); assert.equal(Number(row.held_grace), 0.22);
await one(`select public.line_oa_kit_quota_settle('r2',$1)`, [JSON.stringify(usage(100, 10))]); // tiny cost -> grace refunded first
assert.equal(Number((await one(`select grace_used_twd from public.line_oa_kit_quota_periods`)).grace_used_twd), 0);
s = (await one(`select public.line_oa_kit_quota_status($1) as j`, [U])).j;
assert.equal(s.extraTwdLeft, 20);
await db.query(`update public.line_oa_kit_quota_periods set used_twd = limit_twd, grace_used_twd = grace_twd`);
assert.equal((await one(`select public.line_oa_kit_quota_reserve('r3',$1,$2,'runtime',0.01) as j`, [P, U])).j.error, 'points_insufficient');

// Top-up NT$50 -> NT$10 of cost -> extra bar shows NT$50.
s = (await one(`select public.line_oa_kit_quota_topup($1, 50) as j`, [U])).j;
assert.equal(s.extraTwdLeft, 50); assert.equal(s.percentLeft, 0);
assert.equal((await one(`select public.line_oa_kit_quota_reserve('r4',$1,$2,'runtime',0.01) as j`, [P, U])).j.bucket, 'topup');

// Bad inputs.
assert.equal((await one(`select public.line_oa_kit_quota_reserve('r5',$1,$2,'runtime',0.5) as j`, [P, U])).j.error, 'invalid_reservation');
// Legacy grant: 12 months.
const until = (await one(`select public.line_oa_kit_subscription_extend('Ulegacy', 12, 'legacy') as d`)).d;
console.log('legacy paid until', until);
// Browser roles have no table grants.
const g = await one(`select count(*)::int n from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name like 'line_oa_kit_quota%'`);
assert.equal(g.n, 0);
console.log('ALL QUOTA TESTS PASSED');
