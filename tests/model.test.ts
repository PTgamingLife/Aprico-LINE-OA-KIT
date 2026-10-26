import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDraft,validateDraft} from '../src/model.ts';
test('grid and theme changes preserve every hidden cell',()=>{const d=emptyDraft();d.cells[7].content='保留我的功能';d.grid=4;d.theme=7;assert.equal(validateDraft(d).cells[7].content,'保留我的功能');});
test('only approved fields cross the save boundary',()=>{const d=validateDraft({...emptyDraft(),owner:'other-member',paid:true});assert.equal('owner' in d,false);assert.equal('paid' in d,false);});
test('reject malformed grid and oversized labels',()=>{assert.throws(()=>validateDraft({...emptyDraft(),grid:5}));const d=emptyDraft();d.cells[0].label='x'.repeat(31);assert.throws(()=>validateDraft(d));});
