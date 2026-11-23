import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orbInput, orbOutput } from '../supabase/functions/_shared/oaw-orb.ts';

const pieces = [
  { id: 1, type: 'record', text: '記下跟行程有關的內容' },
  { id: 4, type: 'push', text: '推播行事曆', answer: '每天 21:00' },
];

test('orb input is validated', () => {
  assert.equal(orbInput({ target: 'x', pieces }), null);
  assert.equal(orbInput({ target: 'me', pieces: [] }), null);
  assert.equal(orbInput({ target: 'me', pieces: [{ id: 1, type: 'hack', text: 'a' }] }), null);
  assert.equal(orbInput({ target: 'me', pieces: [pieces[0], pieces[0]] }), null);
  const input = orbInput({ target: 'group', pieces });
  assert.equal(input?.conversation, 'a group');
  assert.deepEqual(input?.pieces[1], { id: 4, type: 'push', description: '推播行事曆', ownerAnswer: '每天 21:00' });
});

test('orb output must cover every piece that was asked about', () => {
  const input = orbInput({ target: 'me', pieces })!;
  assert.equal(orbOutput({ pieces: [{ id: 1, text: 'a', question: '', params: {} }] }, input), null);
  const out = orbOutput(
    {
      note: '會記下行程並每天 21:00 推播。',
      pieces: [
        { id: 4, text: '每天 21:00 推播行事曆', question: '', params: { time: '21:00', show: 'calendar' } },
        { id: 1, text: '', question: '', params: { topic: '行程' } },
        { id: 99, text: 'extra', question: '', params: {} },
      ],
    },
    input,
  );
  assert.deepEqual(out?.pieces.map((p) => p.id), [1, 4]);
  assert.equal(out?.pieces[0].text, '記下跟行程有關的內容'); // empty rewrite falls back
});
