import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDraft} from '../src/model.ts';
import {trialMenu,trialAreas,trialText,decodeMenuImage,safeTrialExternal} from '../src/trial-model.ts';
import {trialLine,previewPlatform,ensureTrialWebhook,validLineSignature} from '../supabase/functions/_shared/trial-line.ts';
import {trialReplyMessages} from '../supabase/functions/_shared/trial-replies.ts';
import {routeAssistantEvent} from '../supabase/functions/_shared/assistant-trial.ts';
import {broadcastGateway} from '../supabase/functions/_shared/broadcast-gateway.ts';
import {introFollowGateway} from '../supabase/functions/_shared/intro-delivery.ts';
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
 new Function('Deno','createClient','validLineSignature','trialLine','exitTrial','routeAssistantEvent','broadcastGateway','introFollowGateway','chatDesignGateway',code)({env:{get:(key:string)=>env[key]},serve:(f:any)=>{handler=f;}},()=>({}),validLineSignature,()=>async()=>{},async()=>{},async(_e:any,r:any)=>{routes.push([r.trialAuthenticated,r.assistantAuthenticated]);},broadcastGateway,introFollowGateway,async()=>false);
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
import {chatDesignGateway,pushReviewNotice} from '../supabase/functions/_shared/chat-design.ts';
import {secretaryPortraits,themes} from '../src/model.ts';

test('chat design resumes after 24 hours and saves a records design before simulating a calendar reply',async()=>{
 const owner='U'+'a'.repeat(32);
 let session:any,project:any,reply:any[],sequence=0;
 const db={from(table:string){
  let write:any;
  const query:any={select:()=>query,eq:()=>query,insert:(data:any)=>{write=data;return query;},update:(data:any)=>{write=data;return query;},
   single:()=>query.maybeSingle(),maybeSingle:async()=>{if(write)session=structuredClone(write);return {data:session};},
   upsert:async(data:any)=>{assert.equal(table,'line_oa_kit_designs');project=data;return {};}};
  return query;
 }};
 async function send(value:string,button=false,group=false,revision=session?.revision||''){
  const event={source:{type:group?'group':'user',userId:owner},replyToken:'fixture',webhookEventId:'chat-event-'+(++sequence),
   ...(button?{type:'postback',postback:{data:new URLSearchParams({aprico_design:value,v:revision}).toString()}}:{type:'message',message:{type:'text',text:value}})};
  reply=[];
  return chatDesignGateway(event,{authenticated:true,db,reply:async(_token,messages)=>{reply=messages;}});
 }
 assert.equal(await send('打造我的 LINE OA',false,true),false);
 await send('new',true);await send('next',true);await send('records',true);
 const action=reply![0].contents.footer.contents[0].action;
 assert.equal(action.inputOption,'openKeyboard');assert.equal(action.fillInText,'填寫 ');
 await send('open_name',true);assert.equal(session.state.step,'name');assert.equal(reply!.length,0);
 await send('填寫 我的秘書');
 session.updated_at='2020-01-01T00:00:00Z';
 await send('打造我的 LINE OA');
 assert.match(JSON.stringify(reply!),/繼續未完成設計/);
 await send('resume',true);
 assert.match(JSON.stringify(reply!),/LINE OA 名稱/);
 const oaAction=reply![0].contents.footer.contents[0].action;
 assert.equal(oaAction.label,'輸入 LINE OA 名稱');
 assert.equal(oaAction.inputOption,'openKeyboard');
 assert.equal(oaAction.fillInText,'填寫 ');
 await send('open_name',true);assert.equal(session.state.step,'oaName');
 await send('填寫 秘書服務');
 assert.match(JSON.stringify(reply!),/主要設計目標/);
 await send('填寫 減少整理客戶行程的時間');
 const scopeRevision=session.revision;
 await send('personal',true);
 assert.equal(session.state.step,'recordList');
 // Re-tapping the previous card recovers when LINE did not display the next one.
 await send('personal',true,false,scopeRevision);
 assert.equal(session.state.step,'recordList');
 const capabilities=reply![0].contents.footer.contents.flatMap((row:any)=>row.contents);
 assert.equal(capabilities.length,6);
 assert.ok(capabilities.every((item:any)=>item.height==='54px'&&item.action.type==='postback'));
 assert.doesNotMatch(JSON.stringify(reply),/"minHeight"/);
 await send('calendar',true);await send('tune',true);
 assert.equal(reply![0].contents.footer.contents[0].action.inputOption,'openKeyboard');
 await send('填寫 記錄行程');await send('confirm',true);await send('card',true);
 await send('private',true);await send('database',true);await send('finish',true);
 assert.equal(reply![0].contents.footer.contents[0].action.fillInText,'填寫 ');
 await send('填寫 本人確認');await send('save',true);
 assert.equal(project.line_subject,owner);
 assert.equal(project.config.goal,'減少整理客戶行程的時間');
 assert.deepEqual(project.config.secretary.routes,[{id:'calendar',notes:'記錄行程',format:'card',recipient:'private',destination:'database'}]);
 assert.match(JSON.stringify(reply!),/召喚秘書/);
 await send('summon',true);
 const portrait=session.state.portrait;
 assert.ok(secretaryPortraits.includes(portrait));
 assert.equal(project.config.portrait,portrait);
 assert.match(reply![0].contents.hero.url,new RegExp('summon-'+portrait+'\\.jpg$'));
 assert.ok(JSON.stringify(reply!).includes('給他裝備,帶她/他回家'));
 await send('summon',true);assert.equal(session.state.portrait,portrait);
 await send('demo',true);
 assert.equal(reply![0].contents.footer.contents[0].action.inputOption,'openKeyboard');
 await send('填寫 明天下午 3 點跟客戶開會');
 assert.match(JSON.stringify(reply!),/明天 15:00｜跟客戶開會/);
 await send('confirm',true);
 assert.equal(session.state.demo,undefined);
 assert.match(JSON.stringify(reply!),/示範行程已確認/);
 await send('new',true);await send('next',true);await send('oa',true);
 await send('填寫 新設計');await send('填寫 測試 OA');await send('填寫 讓顧客找到品牌服務');await send('4',true);
 const rows=reply![0].contents.contents.flatMap((bubble:any)=>bubble.footer.contents);
 assert.deepEqual(rows.map((row:any)=>row.contents[1].contents.map((swatch:any)=>swatch.backgroundColor)),themes.map(theme=>theme.colors));
 assert.deepEqual(rows.map((row:any)=>new URLSearchParams(row.action.data).get('aprico_design')),themes.map((_,index)=>String(index)));
 await send('7',true);assert.equal(session.state.draft.theme,7);
 assert.equal(session.state.step,'pattern');
 assert.equal(reply![0].contents.contents.flatMap((bubble:any)=>bubble.footer.contents).length,9);
 await send('image',true);assert.equal(session.state.step,'pattern');
 await send('arches',true);assert.equal(session.state.draft.pattern,'arches');assert.equal(session.state.step,'purpose');
 const [presets,other]=reply![0].contents.contents;
 assert.equal(presets.footer.contents.flatMap((row:any)=>row.contents).length,8);
 assert.match(JSON.stringify(other),/待辦清單.*圖片轉紀錄.*自行設計/);
 await send('games',true);await send('confirm',true);
 assert.equal(reply![0].contents.footer.contents.length,1);
 await send('text',true);assert.equal(session.state.step,'format');
 await send('web',true);assert.equal(session.state.draft.cells[0].responseFormat,'web');
 assert.equal(session.state.index,1);
});

test('paid review opens owner-scoped cards, preserves edits, and rejects earlier confirmation buttons',async()=>{
 const owner='U'+'a'.repeat(32),id='00000000-0000-4000-8000-000000000092';
 const config=emptyDraft();
 config.oaName='示範帳號';config.pattern='arches';
 config.cells[0]={label:'卜卦',action:'message',template:'custom',content:'示範文字',preset:'divination',responseFormat:'text'};
 config.secretary={direction:'both',conversation:'group',routes:[{id:'calendar',notes:'',format:'card',recipient:'private',destination:'database'}]};
 let current:any,access='manual_password',reply:any[]=[],approved:any[]=[],sequence=0;
 const db={from(table:string){
  const filters=new Map();let write:any;
  const query:any={select:()=>query,eq:(key:string,value:string)=>{filters.set(key,value);return query;},
   insert:(data:any)=>{write=data;return query;},update:(data:any)=>{write=data;return query;},
   single:()=>query.maybeSingle(),maybeSingle:async()=>{
    if(table==='line_oa_kit_designs')return {data:filters.get('line_subject')===owner?{id,config,revision:1,confirmed_revision:null}:null};
    if(table==='line_oa_kit_build_access')return {data:{grant_method:access}};
    assert.equal(table,'line_oa_kit_chat_review_sessions');
    if(write)current=structuredClone(write);return {data:current};
   }};
  return query;
 },rpc:async(name:string,args:any)=>{assert.equal(name,'line_oa_kit_confirm_chat_design');approved.push(args);return {data:2};}};
 async function send(data:Record<string,string>,subject=owner){
  reply=[];
  return chatDesignGateway({type:'postback',source:{type:'user',userId:subject},postback:{data:new URLSearchParams(data).toString()},replyToken:'fixture',webhookEventId:'review-event-'+(++sequence)},{
   authenticated:true,db,reply:async(_token,messages)=>{reply=messages;}
  });
 }
 await send({aprico_review:id});assert.match(reply[0].text,/已付款/);assert.equal(current,undefined);
 access='line_pay';
 await send({aprico_review:id},'U'+'b'.repeat(32));assert.equal(current,undefined);
 await send({aprico_review:id});
 assert.equal(reply.length,4);assert.match(JSON.stringify(reply),/示範帳號.*卜卦.*已授權群組.*本人／管理員私訊/);
 assert.doesNotMatch(JSON.stringify(reply),/"minHeight"/);
 const old='p.'+current.revision;
 const click=(aprico_design:string,v='p.'+current.revision)=>send({aprico_design,v});
 await click('menu');await click('cell:0');await click('divination');await click('confirm');await click('card');
 await click('approve',old);assert.equal(approved.length,0);
 await click('approve');assert.equal(approved.length,1);assert.equal(approved[0].p_config.cells[0].responseFormat,'card');
 assert.match(JSON.stringify(reply),/前往建置中心/);
});

test('payment review notice sends one recipient a postback with the order retry key',async()=>{
 const id='00000000-0000-4000-8000-000000000092',order='00000000-0000-4000-8000-000000000093';
 await pushReviewNotice('fixture','U'+'a'.repeat(32),id,order,async(url,init)=>{
  assert.equal(url,'https://api.line.me/v2/bot/message/push');
  assert.equal(new Headers(init?.headers).get('X-Line-Retry-Key'),order);
  const data=JSON.parse(String(init?.body));
  assert.equal(data.to,'U'+'a'.repeat(32));
  assert.equal(data.messages[0].contents.footer.contents[0].action.data,'aprico_review='+id);
  return new Response(null,{status:409});
 });
});
