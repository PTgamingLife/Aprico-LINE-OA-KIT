import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIT_FILE_MAX, fitInput, fitOutput } from '../supabase/functions/_shared/oaw-fit.ts';

const chat = '2026/11/20（五）\n10:30\t我\t明天幾點集合？\n10:31\t朋友\t八點，記得帶水\n'.repeat(3);

test('fit input: one to three chat excerpts of a sane size', () => {
  assert.deepEqual(fitInput({ chats: [chat] }), { chats: [chat.trim()] });
  assert.equal(fitInput({ chats: [] }), null);
  assert.equal(fitInput({ chats: [chat, chat, chat, chat] }), null);
  assert.equal(fitInput({ chats: ['太短'] }), null);
  assert.equal(fitInput({ chats: ['x'.repeat(FIT_FILE_MAX + 1)] }), null);
  assert.equal(fitInput({ chats: [chat, 5] }), null);
});

test('fit output: sorted by fit and frequency, at most eight, unusable ones dropped', () => {
  const item = (title: string, fit: number, often: number, text = '這個群組是社團聊天，幫我記下每次集合的時間地點。') => ({ title, why: '常在問集合時間', often, fit, text });
  const out = fitOutput({
    summary: ' 你最常被問集合時間。\n也常忘記繳費。 ',
    items: [item('低', 2, 2), item('高', 5, 5), item('沒有文字', 5, 5, '太短'), item('中', 5, 3), item('超出範圍', 99, -4), ...Array.from({ length: 8 }, (_, i) => item('多' + i, 3, 3))],
  })!;
  assert.equal(out.summary, '你最常被問集合時間。 也常忘記繳費。');
  assert.equal(out.items.length, 8);
  assert.deepEqual(out.items.slice(0, 2).map((i: any) => i.title), ['高', '中']);
  assert.ok(!out.items.some((i: any) => i.title === '沒有文字'));
  // Scores outside 1-5 are clamped, so one wild number cannot jump the queue.
  assert.deepEqual(out.items.find((i: any) => i.title === '超出範圍') && [5, 1], [5, 1]);
  assert.equal(fitOutput({ summary: 'x', items: [] }), null);
  assert.equal(fitOutput(null), null);
});
