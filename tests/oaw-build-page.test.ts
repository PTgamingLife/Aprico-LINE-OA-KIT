import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhase, cleanKey, initialConfig } from '../src/oaw-build-model.ts';
import { validOawConfig } from '../supabase/functions/_shared/oaw-api.ts';

test('pasted keys are trimmed and shape-checked', () => {
  assert.equal(cleanKey('OAW_LINE_MSG_ID', ' 2012562021\n'), '2012562021');
  assert.equal(cleanKey('OAW_LINE_MSG_SECRET', 'a'.repeat(32)), 'a'.repeat(32));
  assert.equal(cleanKey('OAW_LINE_MSG_SECRET', 'not a secret'), '');
  assert.equal(cleanKey('SUPABASE_ACCESS_TOKEN', 'sbp_' + 'f'.repeat(40)), 'sbp_' + 'f'.repeat(40));
  assert.equal(cleanKey('UNKNOWN', 'x'), '');
});

test('the two answers become a valid starting config', () => {
  for (const template of ['general', 'health']) {
    const c = initialConfig({ template, oaName: '小美的甜點店', goal: '方便預約' });
    assert.ok(validOawConfig(c), template);
    assert.match(c.welcome, /小美的甜點店/);
  }
  assert.ok(
    validOawConfig(
      initialConfig({ template: 'general', oaName: 'x'.repeat(99), goal: 'y'.repeat(999) }),
    ),
  );
});

test('build phase follows status.json and the latest run', () => {
  assert.equal(buildPhase(null), 'idle');
  assert.equal(buildPhase({ run: { status: 'in_progress' } }), 'running');
  assert.equal(buildPhase({ run: { status: 'completed', conclusion: 'failure' } }), 'failed');
  assert.equal(buildPhase({ ok: true }), 'done');
});
