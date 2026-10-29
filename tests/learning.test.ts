import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {courses,advanceLearning,emptyProgress} from '../src/learning/model.ts';
import {learningAction} from '../supabase/functions/_shared/learning-handler.ts';
import {CENTER_LEARNING,centerMenu} from '../src/center-menu.ts';
test('prepared official course button opens LIFF rather than Google gated source site',()=>{
 const menu=centerMenu(CENTER_LEARNING);assert.equal(menu.areas[4].action.uri,'https://liff.line.me/2012197506-Vmb4O5iT/learning.html');
 assert.match(readFileSync('scripts/render-center-menu.ps1','utf8'),/\[switch\]\$Arches/);
});
test('original three courses keep 21 illustrated units and eight questions each',()=>{
 assert.deepEqual(courses.map(c=>c.units.length),[6,7,8]);
 for(const c of courses){assert.equal(c.questions.length,8);for(const u of c.units)assert.ok(existsSync('public/learning-images/'+u.image.split('/').pop()));}
});
test('learning completion is ordered and client passed/score claims are ignored',()=>{
 const b={action:'learning_complete',courseId:'claude-01',unitIndex:0,revision:0,passed:true,quiz_score:8};
 const p=advanceLearning(b,[]);assert.equal(p.completed_count,1);assert.equal(p.passed,false);assert.equal(p.quiz_score,0);
 assert.throws(()=>advanceLearning({...b,unitIndex:4},[]));assert.throws(()=>advanceLearning({...b,courseId:'claude-api'},[]));
 assert.throws(()=>advanceLearning({...b,revision:0},[p]));
});
test('learning scores are computed server-side and highest result never regresses',()=>{
 const c=courses[0],old={...emptyProgress(c.id),completed_count:6,revision:6};
 const p=advanceLearning({action:'learning_quiz',courseId:c.id,revision:6,answers:c.questions.map(q=>q.ok)},[old]);
 assert.equal(p.quiz_score,8);assert.equal(p.passed,true);
 const again=advanceLearning({action:'learning_quiz',courseId:c.id,revision:p.revision,answers:c.questions.map(q=>(q.ok+1)%4)},[p]);
 assert.equal(again.quiz_score,8);assert.equal(again.passed,true);
 for(const answers of [[],[9,9,9,9,9,9,9,9],['0',0,0,0,0,0,0,0]])assert.throws(()=>advanceLearning({action:'learning_quiz',courseId:c.id,revision:6,answers},[old]));
 assert.throws(()=>advanceLearning({action:'learning_quiz',courseId:c.id,revision:0,answers:c.questions.map(q=>q.ok)},[]));
});
function fakeDb(rows:any[],conflict=false){
 const calls:any[]=[];let written:any;
 const q:any={eq:(...v:any[])=>{calls.push(v);return q;},select:()=>q,maybeSingle:async()=>({data:conflict?null:written,error:null}),then:(resolve:any)=>resolve({data:rows,error:null})};
 return{calls,get written(){return written;},from:(name:string)=>{assert.equal(name,'line_oa_kit_learning_progress');return{select:()=>q,insert:(r:any)=>{written=r;return q;},update:(r:any)=>{written=r;return q;}};}};
}
const response=(v:unknown,status=200)=>Response.json(v,{status});
test('learning handler scopes every read and write to verified LINE subject',async()=>{
 const db=fakeDb([]),subject='U'+'a'.repeat(32);
 const r=await learningAction({action:'learning_complete',courseId:'claude-01',unitIndex:0,revision:0,line_subject:'attacker'},db,subject,response);
 assert.equal(r.status,200);assert.equal(db.written.line_subject,subject);assert.deepEqual(db.calls[0],['line_subject',subject]);
 const edit=fakeDb([{...emptyProgress('claude-01'),revision:1,completed_count:1}]);
 await learningAction({action:'learning_complete',courseId:'claude-01',unitIndex:1,revision:1},edit,subject,response);
 assert.ok(edit.calls.some(v=>v[0]==='revision'&&v[1]===1));assert.ok(edit.calls.some(v=>v[0]==='course_id'&&v[1]==='claude-01'));
 const conflict=fakeDb([],true);assert.equal((await learningAction({action:'learning_complete',courseId:'claude-01',unitIndex:0,revision:0},conflict,subject,response)).status,409);
});
test('learning has no Google auth or user leaderboard; server authenticates before handler',()=>{
 const ui=readFileSync('src/learning.jsx','utf8'),entry=readFileSync('supabase/functions/line-oa-kit-studio/index.ts','utf8');
 assert.doesNotMatch(ui,/signInWithOAuth|honor_roll|setBoard|localStorage/);
 assert.ok(entry.indexOf("identity.aud!==channelId")<entry.indexOf('return await learningAction'));
 assert.match(ui,/getIDToken/);assert.match(ui,/liff\.init/);
});
