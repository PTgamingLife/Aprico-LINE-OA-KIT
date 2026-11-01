import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {questSteps,journeySteps,safeJourneyState,questProof,sameTarget,entered} from '../src/journey.ts';
import {emptyDraft} from '../src/model.ts';
import {emptySetup} from '../src/build-model.ts';
test('one system square, distinct human actions, optional LIFF only when needed',()=>{
 assert.equal(questSteps.filter(q=>q.kind==='automatic').length,1);assert.equal(new Set(questSteps.map(q=>q.id)).size,questSteps.length);
 const d=emptyDraft();d.cells.forEach(c=>c.action='message');assert.ok(!journeySteps(d).some(q=>q.id==='liff'));d.cells[0].action='half';assert.ok(journeySteps(d).some(q=>q.id==='liff'));
 for(const q of questSteps)assert.ok('topic'in q||'guide'in q);
});
test('resume whitelist never stores credentials or browser privilege claims',()=>{
 const stored=safeJourneyState({step:'automatic',secrets:{githubToken:'private'},plan:{},acks:{'github-signup':true,website:true,automatic:true,lineSecret:true}});
 assert.deepEqual(stored,{step:'automatic',acks:{'github-signup':true}});assert.doesNotMatch(JSON.stringify(stored),/private|lineSecret|plan/);
 assert.equal(safeJourneyState({step:'attacker'}).step,'audience');
});
test('entered URLs and token presence do not masquerade as verified authorization',()=>{
 const c={setup:{...emptySetup(),githubRepo:'https://github.com/customer/demo'},secrets:{githubToken:'fixture'},acks:{},plan:null,deployment:null};
 assert.equal(questProof(questSteps.find(q=>q.id==='review'),c).done,false);
 assert.match(questProof(questSteps.find(q=>q.id==='githubToken'),c).label,/待系統核對/);
 assert.equal(entered(questSteps.find(q=>q.id==='lineSecret'),{}, {lineSecret:'wrong'}),false);
});
test('draft or deployment request alone does not complete automatic or acceptance square',()=>{
 const auto=questSteps.find(q=>q.id==='automatic'),website=questSteps.find(q=>q.id==='website');
 for(const status of ['queued','running','failed','interrupted'])assert.equal(questProof(auto,{deployment:{status}}).done,false);
 const c={deployment:{status:'awaiting_acceptance',user_checks:{website:true}}};assert.equal(questProof(auto,c).done,true);assert.equal(questProof(website,c).done,true);assert.match(questProof(website,c).label,/本人實測/);
});
test('automatic handoff refuses changed provider targets',()=>{
 const p={botId:'one',githubRepo:'owner/repo',ref:'project'};assert.ok(sameTarget(p,{...p}));for(const key of Object.keys(p))assert.ok(!sameTarget(p,{...p,[key]:'changed'}));assert.ok(!sameTarget(p,null));
});
test('unsaved edits cannot advance persisted field progress',()=>{
 const q=questSteps.find(q=>q.id==='audience');const c={setup:{audience:'new'},savedSetup:{audience:'old'},secrets:{}};
 assert.equal(questProof(q,c).done,false);c.savedSetup.audience='new';assert.equal(questProof(q,c).done,true);
});
test('paid generation is only explicit; resume stores no intents and system internals are collapsed',()=>{
 const ui=readFileSync(new URL('../src/BuildJourney.jsx',import.meta.url),'utf8');
 assert.match(ui,/if\(!consent\|\|!ready\|\|!plan\|\|busy\)return/);assert.match(ui,/safeJourneyState\(\{step:q.id,acks\}\)/);assert.match(ui,/attempted.current.has/);assert.match(ui,/if\(!sameTarget/);assert.match(ui,/需要協助時才展開的紀錄/);assert.doesNotMatch(ui,/localStorage\.setItem\([^\n]*secrets/);
});
test('existing draft can resume deployment without a new paid generation request',()=>{
 const ui=readFileSync(new URL('../src/BuildJourney.jsx',import.meta.url),'utf8');
 assert.match(ui,/job\?\.status==='draft_ready'\?\{jobId:job.id\}:await api\(\{action:'generate_source'/);
 assert.match(ui,/credits.remaining===0&&job\?\.status!=='draft_ready'/);
 assert.match(ui,/沿用已保存的同版本草稿，不再扣 AI 次數/);
});
