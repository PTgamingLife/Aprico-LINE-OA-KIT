import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyInput, tallyOutput } from '../supabase/functions/_shared/oaw-tally.ts';

const body = {
  subject: '便當',
  items: ['雞腿', '排骨'],
  lines: [
    { who: 'M1', text: '我要雞腿' },
    { who: 'M2', text: '排骨兩個不要辣' },
    { who: 'M1', text: '改排骨' },
  ],
};

test('tally input: speakers must be opaque labels', () => {
  assert.equal(tallyInput({ ...body, subject: '' }), null);
  assert.equal(tallyInput({ ...body, lines: [{ who: '王小明', text: 'x' }] }), null);
  assert.equal(tallyInput({ ...body, items: [5] }), null);
  assert.deepEqual(tallyInput(body)?.lines[1], { n: 2, who: 'M2', text: '排骨兩個不要辣' });
});

test('tally output: unknown speakers, items and lines are dropped', () => {
  const input = tallyInput(body)!;
  const out = tallyOutput(
    {
      entries: [
        { who: 'M1', item: '雞腿', qty: 1, note: '', line: 1 },
        { who: 'M2', item: '排骨', qty: 2, note: '不要辣', line: 2 },
        { who: 'M9', item: '雞腿', qty: 1, note: '', line: 1 },
        { who: 'M1', item: '牛排', qty: 1, note: '', line: 3 },
        { who: 'M1', item: '排骨', qty: 1, note: '', line: 9 },
        { who: 'M1', item: '雞腿', qty: 0, note: '', line: 3 },
      ],
      unclear: [{ who: 'M1', text: '改排骨？' }, { who: 'X', text: 'no' }],
    },
    input,
  );
  assert.equal(out?.entries.length, 3);
  assert.deepEqual(out?.entries[2], { who: 'M1', item: '雞腿', qty: 0, note: '', line: 3, values: [] });
  assert.equal(out?.unclear.length, 1);
  assert.equal(tallyOutput({}, input), null);
});

test('measures: one estimate per requested measure, bad numbers become 0', () => {
  const lines = [{ who: 'M1', text: '午餐吃雞腿便當' }];
  assert.equal(tallyInput({ subject: '飲食', lines, measures: ['a', 'b', 'c', 'd'] }), null);
  const input = tallyInput({ subject: '飲食', lines, measures: ['熱量 kcal', '蛋白質 g'] })!;
  assert.deepEqual((input as any).measures, ['熱量 kcal', '蛋白質 g']);
  const out = tallyOutput(
    {
      entries: [
        { who: 'M1', item: '雞腿便當', qty: 1, note: '', line: 1, values: [780.26, 'lots', 99] },
        { who: 'M1', item: '豆漿', qty: 1, note: '', line: 1, values: [-5] },
      ],
      unclear: [],
    },
    input,
  )!;
  assert.deepEqual(out.entries[0].values, [780.3, 0]); // extra values dropped, text becomes 0
  assert.deepEqual(out.entries[1].values, [0, 0]); // negative and missing become 0
});
