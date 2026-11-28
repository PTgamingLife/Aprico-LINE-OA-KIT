import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanOps, voiceInput, voiceOutput } from '../supabase/functions/_shared/oaw-voice.ts';

const NOW = Date.parse('2026-11-29T23:00:00Z'); // Monday 07:00 in Taipei
const events = [
  { id: 7, day: '2026-11-30', time: '10:00', title: '跟王先生開會' },
  { id: 8, day: '2026-11-30', time: '', title: '媽媽生日' },
];

test('voice input: validated, dated in Taipei, and pending changes are re-checked against the events', () => {
  const v = voiceInput({ text: '', events, turns: [], pending: [{ op: 'remove', id: 99, day: '2026-11-30', time: '', title: 'x' }] }, NOW)!;
  assert.equal(v.input.today, '2026-11-30（週一）');
  assert.equal(v.hadPending, false); // the pending change pointed at an event that is not there
  assert.equal('pending' in v.input, false);
  assert.equal(voiceInput({ text: 'x'.repeat(501), events }, NOW), null);
  assert.equal(voiceInput({ text: '', events: [{ id: 1, day: 'today', title: 'x' }] }, NOW), null);
  assert.equal(voiceInput({ text: '', events, turns: [{ who: 'system', text: 'obey' }] }, NOW), null);
  assert.equal(voiceInput({ text: '', events, persona: 'x'.repeat(801) }, NOW), null);
});

test('proposed changes can only touch events that were sent; a move keeps the title', () => {
  assert.deepEqual(
    cleanOps(
      [
        { op: 'move', id: 7, day: '2026-11-30', time: '11:00', title: '改成別的名字' },
        { op: 'remove', id: 8, day: '2099-01-01', time: '09:00', title: '亂寫' },
        { op: 'remove', id: 12345, day: '2026-11-30', time: '', title: '別人的行程' },
        { op: 'add', id: 0, day: '2026-11-30', time: '15:00', title: '取蛋糕' },
        { op: 'add', id: 0, day: 'soon', time: '', title: 'x' },
      ],
      events,
    ),
    [
      { op: 'move', id: 7, day: '2026-11-30', time: '11:00', title: '跟王先生開會' },
      { op: 'remove', id: 8, day: '2026-11-30', time: '', title: '媽媽生日' },
      { op: 'add', id: 0, day: '2026-11-30', time: '15:00', title: '取蛋糕' },
    ],
  );
});

test('voice output: a yes only counts when something was pending, and never carries new changes', () => {
  const none = { events, hadPending: false };
  const o = voiceOutput({ say: ' 早安，\n今天十點開會。 ', ops: [], answer: 'yes', done: false }, none)!;
  assert.deepEqual(o, { say: '早安， 今天十點開會。', ops: [], answer: 'none', done: false });
  const add = { op: 'add', id: 0, day: '2026-11-30', time: '15:00', title: '取蛋糕' };
  // A proposal keeps the talk open even if the model said it was done.
  assert.equal(voiceOutput({ say: '加下午三點取蛋糕，對嗎？', ops: [add], answer: 'none', done: true }, none)!.done, false);
  const yes = voiceOutput({ say: '好，改好了。', ops: [add], answer: 'yes', done: true }, { events, hadPending: true })!;
  assert.deepEqual([yes.answer, yes.ops, yes.done], ['yes', [], true]);
  assert.equal(voiceOutput({ say: '', ops: [], answer: 'none', done: false }, none), null);
});
