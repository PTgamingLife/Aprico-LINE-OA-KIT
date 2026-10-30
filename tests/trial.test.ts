import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDraft} from '../src/model.ts';
import {trialMenu,trialAreas,trialText,decodeMenuImage,safeTrialExternal} from '../src/trial-model.ts';
import {trialLine,previewPlatform,ensureTrialWebhook,validLineSignature} from '../supabase/functions/_shared/trial-line.ts';
import {trialReplyMessages} from '../supabase/functions/_shared/trial-replies.ts';
import {routeAssistantEvent} from '../supabase/functions/_shared/assistant-trial.ts';
import {broadcastGateway} from '../supabase/functions/_shared/broadcast-gateway.ts';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const version='11111111-2222-4333-8444-555555555555';
const subject='U'+'1'.repeat(32);
function routerFixture(active=true,duplicate=false){
 const d=emptyDraft();d.cells[0].label='優惠';d.cells[0].content='只屬於這個會員';const calls={owners:[] as string[],replies:[] as any[],assistant:0,exits:[] as string[]};
 const db={from:(table:string)=>({select:()=>({eq:(_key:string,value:string)=>{calls.owners.push(value);return{maybeSingle:async()=>({data:active?{active,config:d,version}:null})};}}),insert:async()=>({error:duplicate?{code:'23505'}:null})})};
 const context={trialAuthenticated:true,assistantAuthenticated:true,db,reply:async(_t:string,m:any[])=>{calls.replies.push(m);},exit:async(s:string)=>{calls.exits.push(s);},assistant:async()=>{calls.assistant++;}};
 const event={type:'message',source:{type:'user',userId:subject},replyToken:'fixture',webhookEventId:'fixture_event_123',message:{type:'text',text:'優惠'}};
 return{calls,context,event};
}
test('personal trial reads only signed sender and never enters assistant AI',async()=>{
 const{calls,context,event}=routerFixture();await routeAssistantEvent({...event,owner:'U'+'2'.repeat(32)},context);assert.deepEqual(calls.owners,[subject]);assert.match(JSON.stringify(calls.replies),/只屬於這個會員/);assert.equal(calls.assistant,0);
});
test('group assistant and non-trial users keep original behavior',async()=>{
 const group=routerFixture();await routeAssistantEvent({...group.event,source:{type:'group',groupId:'fixture',userId:subject}},group.context);assert.equal(group.calls.assistant,1);assert.equal(group.calls.owners.length,0);
 const inactive=routerFixture(false);await routeAssistantEvent(inactive.event,inactive.context);assert.equal(inactive.calls.assistant,1);assert.equal(inactive.calls.replies.length,0);
});
test('assistant channel authentication alone cannot read trial data',async()=>{
 const{context,calls,event}=routerFixture();context.trialAuthenticated=false;await routeAssistantEvent(event,context);assert.equal(calls.owners.length,0);assert.equal(calls.assistant,1);context.assistantAuthenticated=false;await routeAssistantEvent(event,context);assert.equal(calls.assistant,1);
});
test('trial suppresses paid AI triggers, deduplicates and exits only its sender',async()=>{
 const f=routerFixture();await routeAssistantEvent({...f.event,message:{type:'text',text:'小A 幫我呼叫 AI'}},f.context);assert.equal(f.calls.assistant,0);assert.match(JSON.stringify(f.calls.replies),/不會呼叫 AI/);
 const duplicate=routerFixture(true,true);await routeAssistantEvent(duplicate.event,duplicate.context);assert.equal(duplicate.calls.replies.length,0);assert.equal(duplicate.calls.assistant,0);
 const exit=routerFixture();await routeAssistantEvent({...exit.event,message:{type:'text',text:'結束試用'}},exit.context);assert.deepEqual(exit.calls.exits,[subject]);assert.equal(exit.calls.assistant,0);
});
test('integrated entrypoint validates raw platform and original assistant HMAC separately',async()=>{
 const source=await readFile(new URL('../supabase/functions/line-assistant/index.ts',import.meta.url),'utf8');
 const code=stripTypeScriptTypes(source.split('\n').filter(line=>!line.startsWith('import ')).join('\n'));
 let handler:any;const routes:any[]=[];const env={ASSIST_LINE_CHANNEL_SECRET:'original-fixture',LINE_OA_KIT_MESSAGING_CHANNEL_SECRET:'platform-fixture',LINE_OA_KIT_MESSAGING_ACCESS_TOKEN:'fixture',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
 new Function('Deno','createClient','validLineSignature','trialLine','exitTrial','routeAssistantEvent','broadcastGateway',code)({env:{get:(key:string)=>env[key]},serve:(f:any)=>{handler=f;}},()=>({}),validLineSignature,()=>async()=>{},async()=>{},async(_e:any,r:any)=>{routes.push([r.trialAuthenticated,r.assistantAuthenticated]);},broadcastGateway);
 const raw=JSON.stringify({events:[{type:'message'}]});
 async function signed(secret:string,text=raw){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)))));return new Request('https://fixture.invalid',{method:'POST',body:raw,headers:{'x-line-signature':sig}});}
 assert.equal((await handler(await signed('platform-fixture'))).status,200);assert.deepEqual(routes.pop(),[true,false]);
 assert.equal((await handler(await signed('original-fixture'))).status,200);assert.deepEqual(routes.pop(),[false,true]);
 assert.equal((await handler(await signed('other-fixture'))).status,401);assert.equal((await handler(await signed('platform-fixture','changed'))).status,401);assert.equal(routes.length,0);
});
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
test('chat preview is enabled only for the exact approved assistant endpoint with readiness',async()=>{
 const seen:string[]=[];const endpoint='https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-assistant';
 const fetcher:typeof fetch=async(url)=>{const u=String(url);seen.push(u);return Response.json(u.endsWith('/oauth/verify')?{client_id:'2010626491'}:u.endsWith('/v2/bot/info')?{displayName:'fixture',basicId:'@fixture'}:u.endsWith('/webhook/endpoint')?{endpoint,active:true}:{trialChatReady:true});};
 const info=await previewPlatform('fixture','fixture',fetcher);assert.equal(info.available,true);assert.equal(info.chatRepliesAvailable,true);assert.equal(seen.at(-1),endpoint);
});
test('webhook verifies exact HMAC and rejects malformed or changed content',async()=>{
 const raw=new TextEncoder().encode('{"events":[]}'),secret='fixture-only';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,raw))));
 assert.equal(await validLineSignature(raw,sig,secret),true);assert.equal(await validLineSignature(new TextEncoder().encode('changed'),sig,secret),false);assert.equal(await validLineSignature(raw,'bad!',secret),false);
});
