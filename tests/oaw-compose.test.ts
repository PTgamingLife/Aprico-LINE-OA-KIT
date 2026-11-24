import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeInput, composeOutput } from '../supabase/functions/_shared/oaw-compose.ts';

test('compose input is validated per mode', () => {
  assert.equal(composeInput({ mode: 'x', text: 'hi' }), null);
  assert.equal(composeInput({ mode: 'polish', text: '' }), null);
  assert.equal(composeInput({ mode: 'polish', text: 'a'.repeat(1501) }), null);
  assert.deepEqual(composeInput({ mode: 'polish', text: ' 週六十點集合 ' }), {
    mode: 'polish',
    input: { announcement: '週六十點集合' },
  });
  const w = composeInput({
    mode: 'write',
    text: '幫我整理明天的行程',
    events: [{ day: '2026-11-24', time: '10:00', title: '聚餐', extra: 'dropped' }],
    todos: ['買蛋糕'],
  });
  assert.deepEqual(w?.input.events, [{ day: '2026-11-24', time: '10:00', title: '聚餐' }]);
  assert.equal(composeInput({ mode: 'write', text: 'x', events: [{ day: 'bad', title: 'a' }] }), null);
  const a = composeInput({ mode: 'ask', text: '幾點集合？', lines: ['小明：十點', '小華：好'] });
  assert.deepEqual(a?.input.recentLines, ['小明：十點', '小華：好']);
  assert.equal(composeInput({ mode: 'ask', text: 'x', lines: [123] }), null);
});

test('compose output is trimmed and must not be empty', () => {
  assert.equal(composeOutput({ text: '  ' }), null);
  assert.equal(composeOutput({}), null);
  assert.equal(composeOutput({ text: 'x'.repeat(2000) })?.text.length, 1000);
});
