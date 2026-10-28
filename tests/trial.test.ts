import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDraft} from '../src/model.ts';
import {trialMenu,trialAreas,trialText,decodeMenuImage,safeTrialExternal} from '../src/trial-model.ts';
import {trialLine,previewPlatform,ensureTrialWebhook,validLineSignature} from '../supabase/functions/_shared/trial-line.ts';
import {trialReplyMessages} from '../supabase/functions/_shared/trial-replies.ts';
const version='11111111-2222-4333-8444-555555555555';
test('all grid cells and return area fit LINE image without overlap',()=>{
 for(const grid of [4,6,8] as const){const d=emptyDraft();d.grid=grid;const areas=trialAreas(d);assert.equal(areas.length,grid);assert.equal(areas.reduce((n,a)=>n+a.bounds.width*a.bounds.height,0),1200*680);for(const a of areas){assert.ok(a.bounds.x>=0&&a.bounds.x+a.bounds.width<=1200);assert.ok(a.bounds.y>=56&&a.bounds.y+a.bounds.height<=736);}
 const menu=trialMenu(d,version);assert.equal(menu.areas.length,grid+1);assert.equal(menu.areas.at(-1)?.action.type,'uri');assert.match(JSON.stringify(menu.areas.at(-1)),/action=exit/);}
});
test('message actions use versioned postbacks, apps use private LIFF and no client owner ID',()=>{
 const d=emptyDraft();d.cells[1].action='half';const m=trialMenu(d,version,true);assert.equal(m.areas[0].action.type,'postback');assert.match(JSON.stringify(m.areas[0]),new RegExp(version));assert.match(JSON.stringify(m.areas[1]),/trial.html\?cell=1/);assert.doesNotMatch(JSON.stringify(m),/userId|line_subject/);assert.equal(trialMenu(d,version).areas[0].action.type,'uri');
});
test('stale personal menu never replies with saved content and paid modules are labeled',()=>{
 const d=emptyDraft();d.cells[0].content='private-reply';const t={active:true,version,config:d};
 assert.doesNotMatch(JSON.stringify(trialReplyMessages(t,{postback:{data:'aprico_trial=cell&v=old&i=0'}})),/private-reply/);
 assert.match(JSON.stringify(trialReplyMessages(t,{postback:{data:'aprico_trial=cell&v='+version+'&i=0'}})),/private-reply/);
 d.cells[0].template='health';assert.match(trialText(d,0),/展示模式/);assert.doesNotMatch(trialText(d,0),/private-reply/);
 d.cells[0].template='scratch';assert.match(trialText(d,0,true),/不發放真實獎品/);assert.throws(()=>trialText(d,8));
});
test('reject arbitrary images and unsafe external links',()=>{
 assert.throws(()=>decodeMenuImage('data:image/svg+xml;base64,AAAA'));assert.throws(()=>decodeMenuImage('data:image/png;base64,AAAA'));assert.equal(safeTrialExternal('javascript:alert(1)'), '');assert.equal(safeTrialExternal('https://user:password@example.org'),'');assert.equal(safeTrialExternal('前往 https://example.org/a'), 'https://example.org/a');
});
test('LINE requests stay on fixed hosts and upstream errors never reveal secrets',async()=>{
 const requests:string[]=[];const call=trialLine('not-a-real-token',async(url)=>{requests.push(String(url));return new Response('upstream private response',{status:401});});
 await assert.rejects(()=>call('https://evil.example/'),/trial_invalid_line_path/);await assert.rejects(()=>call('/v2/bot/info'),/^Error: trial_line_401$/);assert.deepEqual(requests,['https://api.line.me/v2/bot/info']);
});
test('existing platform webhook is never overwritten',async()=>{
 const writes:string[]=[];const fake:typeof fetch=async(url,init)=>{if(init?.method!=='GET')writes.push(String(url));return Response.json({endpoint:'https://other.example/webhook',active:true});};
 await assert.rejects(()=>ensureTrialWebhook('token',fake),/trial_existing_webhook/);assert.deepEqual(writes,[]);
});
test('platform metadata rejects wrong channel and never returns credentials',async()=>{
 const info=await previewPlatform('private-token','private-secret',async()=>Response.json({client_id:'other-channel'}));assert.equal(info.available,false);assert.doesNotMatch(JSON.stringify(info),/private-token|private-secret/);
});
test('webhook verifies exact HMAC and rejects malformed or changed content',async()=>{
 const raw=new TextEncoder().encode('{"events":[]}'),secret='fixture-only';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,raw))));
 assert.equal(await validLineSignature(raw,sig,secret),true);assert.equal(await validLineSignature(new TextEncoder().encode('changed'),sig,secret),false);assert.equal(await validLineSignature(raw,'bad!',secret),false);
});
