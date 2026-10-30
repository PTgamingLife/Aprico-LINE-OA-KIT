import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isBroadcastOwner,validateBroadcast,broadcastCard,gamesBroadcast} from '../src/broadcast-model.ts';
import {broadcastLine} from '../supabase/functions/_shared/broadcast-line.ts';
import {broadcastAction} from '../supabase/functions/_shared/broadcast-handler.ts';
import {broadcastGateway} from '../supabase/functions/_shared/broadcast-gateway.ts';
const owner='U'+'1'.repeat(32),other='U'+'2'.repeat(32),id='12345678-1234-4234-8234-123456789abc';
const response=(v:unknown,status=200)=>Response.json(v,{status});
function lineFixture(options:any={}){
 const calls:{path:string,body:any,key:string|null}[]=[];
 const fetcher:typeof fetch=async(url,init)=>{
  const path=String(url).replace('https://api.line.me/v2/bot',''),headers=new Headers(init?.headers),body=init?.body?JSON.parse(String(init.body)):undefined;
  calls.push({path,body,key:headers.get('X-Line-Retry-Key')});
  if(path==='/info')return Response.json({basicId:options.wrongBot?'@wrong':'@228srwlt',displayName:'Aprico fixture'});
  if(path==='/message/quota')return Response.json({type:'limited',value:options.quota??200});
  if(path==='/message/quota/consumption')return Response.json({totalUsage:options.usage??0});
  if(path.startsWith('/insight/followers'))return Response.json({status:options.unknownAudience?'unready':'ready',followers:4});
  if(path.startsWith('/message/validate/'))return Response.json({}, {status:options.invalidCard?400:200});
  if(path==='/message/broadcast'||path==='/message/push'){
   if(options.timeout)throw Error('secret data must not escape');
   return new Response(options.errorBody||'{}',{status:options.sendStatus??200,headers:{'x-line-request-id':'fixture-request'}});
  }
  throw Error('unexpected '+path);
 };
 return{calls,fetcher};
}
function memoryDb(initial:any=null,options:any={}){
 let row=initial?structuredClone(initial):null;const calls:any[]=[];
 const project=(r:any,cols:string)=>r?cols==='*'?structuredClone(r):Object.fromEntries(cols.split(',').map(k=>[k,structuredClone(r[k])])):null;
 return{calls,get row(){return row;},from:(name:string)=>{
  assert.equal(name,'line_oa_kit_broadcasts');let operation='read',values:any,cols='*';const filters:((r:any)=>boolean)[]=[];
  const resolve=()=>{
   const match=row&&filters.every(fn=>fn(row));
   if(operation==='insert'){if(row)return{data:null,error:{code:'23505'}};row={...values};}
   if(operation==='update'){if(!match)return{data:null,error:null};if(options.auditFailure&&values.status==='accepted')return{data:null,error:{code:'fixture'}};row={...row,...values};}
   return{data:operation==='read'&&!match?null:project(row,cols),error:null};
  };
  const q:any={select:(c:string)=>{cols=c;return q;},eq:(k:string,v:any)=>{calls.push([k,v]);filters.push(r=>r[k]===v);return q;},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q;},order:()=>q,limit:()=>q,
   insert:(v:any)=>{operation='insert';values=v;return q;},update:(v:any)=>{operation='update';values=v;return q;},maybeSingle:async()=>resolve(),then:(fn:any)=>{const v=resolve();return Promise.resolve(fn({...v,data:v.data?[v.data]:[]}));}};
  return q;
 },rpc:async(name:string,p:any)=>{
  calls.push(['rpc',name,p]);assert.equal(name,'line_oa_kit_claim_broadcast');
  if(!row||row.line_subject!==p.p_subject||row.id!==p.p_id||row.revision!==p.p_revision||!['draft','prepared'].includes(row.status))return{data:{error:'not_ready'},error:null};
  if(p.p_mode==='test'){if(row.test_revision>=row.revision)return{data:{error:'test_already_claimed'},error:null};row={...row,test_revision:row.revision,test_key:'23456789-1234-4234-8234-123456789abc',test_status:'sending'};return{data:{draft:structuredClone(row),retryKey:row.test_key}};}
  if(row.status!=='prepared'||row.confirm_hash!==p.p_confirm_hash)return{data:{error:'confirmation_expired'}};
  row={...row,status:'sending',revision:row.revision+1,confirm_hash:null};return{data:{draft:structuredClone(row),retryKey:row.id}};
 }};
}
const draft=()=>({id,line_subject:owner,config:gamesBroadcast(),revision:1,status:'draft',test_revision:0});
test('broadcast owner is explicit verified LINE subject, never name or caller claims',async()=>{
 assert.equal(isBroadcastOwner(owner,''),false);assert.equal(isBroadcastOwner(owner,owner),true);assert.equal(isBroadcastOwner(other,owner),false);
 for(const configured of ['',owner]){let touched=false;const db={from:()=>{touched=true;throw Error('must not read');}};const r=await broadcastAction({action:'broadcast_send',isOwner:true,owner},db,other,configured,'fixture',response);assert.equal(r.status,403);assert.equal(touched,false);}
 const s=await (await broadcastAction({action:'owner_status'},null,other,owner,'fixture',response)).json();assert.equal(s.ownSubject,other);assert.equal(s.authorized,false);assert.doesNotMatch(JSON.stringify(s),new RegExp(owner));
});
test('broadcast model accepts fixed Flex card and rejects unsafe destinations/images',()=>{
 const c=gamesBroadcast(),m=broadcastCard(c);assert.equal(m.type,'flex');assert.match(m.altText,/小遊戲/);assert.match(m.contents.footer.contents[0].action.uri,/games.html/);
 for(const url of ['javascript:alert(1)','http://example.com','https://user:pw@example.com','https://127.0.0.1','https://[::1]/','https://a.internal/'])assert.throws(()=>validateBroadcast({...c,url}));
 assert.throws(()=>validateBroadcast({...c,title:'x'.repeat(61)}));assert.throws(()=>validateBroadcast({...c,imageUrl:'https://evil.example/image.jpg'}));assert.throws(()=>validateBroadcast({...c,imageUrl:'https://ptgaminglife.github.io/a.svg'}));
 assert.equal(validateBroadcast({...c,imageUrl:'https://ptgaminglife.github.io/a.png',line_subject:other}).imageUrl,'https://ptgaminglife.github.io/a.png');
});
test('preflight checks OA quota audience and validates without sending',async()=>{
 const f=lineFixture();const info=await broadcastLine('private-token',f.fetcher).preflight(gamesBroadcast(),'broadcast');assert.equal(info.remaining,200);assert.equal(info.followers,4);assert.ok(f.calls.some(c=>c.path==='/message/validate/broadcast'));assert.equal(f.calls.filter(c=>c.path==='/message/broadcast').length,0);
 for(const options of [{wrongBot:true},{quota:2},{unknownAudience:true},{invalidCard:true}]){const x=lineFixture(options);await assert.rejects(()=>broadcastLine('fixture',x.fetcher).preflight(gamesBroadcast(),'broadcast'));assert.equal(x.calls.filter(c=>c.path==='/message/broadcast').length,0);}
});
test('draft save scopes owner and ignores client privilege or status changes',async()=>{
 const db=memoryDb();const r=await broadcastAction({action:'broadcast_save',id,revision:0,config:gamesBroadcast(),line_subject:other,status:'accepted'},db,owner,owner,'fixture',response);
 assert.equal(r.status,200);assert.equal(db.row.line_subject,owner);assert.equal(db.row.status,'draft');
});
test('prepare creates expiring confirmation but never sends and hashes its secret',async()=>{
 const db=memoryDb(draft()),f=lineFixture();const r=await (await broadcastAction({action:'broadcast_prepare',id,revision:1},db,owner,owner,'fixture',response,f.fetcher)).json();
 assert.match(r.confirmToken,/^[0-9a-f]{64}$/);assert.notEqual(db.row.confirm_hash,r.confirmToken);assert.equal(r.draft.revision,2);assert.ok(Date.parse(r.expiresAt)>Date.now());assert.equal(r.draft.confirm_hash,undefined);assert.equal(f.calls.filter(c=>c.path==='/message/broadcast').length,0);
});
test('broadcast requires explicit confirmation and atomic claim; concurrent requests send once',async()=>{
 const db=memoryDb(draft()),f=lineFixture();const p=await (await broadcastAction({action:'broadcast_prepare',id,revision:1},db,owner,owner,'fixture',response,f.fetcher)).json();
 const b={action:'broadcast_send',id,revision:2,confirmToken:p.confirmToken,confirmText:'確認發送給全部好友'};
 assert.equal((await broadcastAction({...b,confirmText:'yes'},db,owner,owner,'fixture',response,f.fetcher)).status,400);
 const r=await Promise.all([broadcastAction(b,db,owner,owner,'fixture',response,f.fetcher),broadcastAction(b,db,owner,owner,'fixture',response,f.fetcher)]);
 assert.ok(r.some(x=>x.status===409));assert.equal(f.calls.filter(c=>c.path==='/message/broadcast').length,1);assert.equal(db.row.status,'accepted');assert.equal(f.calls.find(c=>c.path==='/message/broadcast')!.key,id);
 const count=f.calls.length;assert.equal((await broadcastAction({...b,revision:3},db,owner,owner,'fixture',response,f.fetcher)).status,409);assert.equal(f.calls.length,count);
});
test('test card can only target verified owner and test replay is blocked',async()=>{
 const db=memoryDb(draft()),f=lineFixture(),b={action:'broadcast_test',id,revision:1,confirmTest:true,to:other};
 await broadcastAction(b,db,owner,owner,'fixture',response,f.fetcher);const send=f.calls.find(c=>c.path==='/message/push')!;assert.equal(send.body.to,owner);assert.ok(send.key);
 assert.equal((await broadcastAction(b,db,owner,owner,'fixture',response,f.fetcher)).status,409);assert.equal(f.calls.filter(c=>c.path==='/message/push').length,1);
});
test('timeouts become unknown and audit failure never permits automatic resend',async()=>{
 for(const options of [{timeout:true},{auditFailure:true}]){
  const db=memoryDb(draft(),options),f=lineFixture(options),p=await (await broadcastAction({action:'broadcast_prepare',id,revision:1},db,owner,owner,'fixture',response,f.fetcher)).json();
  const b={action:'broadcast_send',id,revision:2,confirmToken:p.confirmToken,confirmText:'確認發送給全部好友'};
  const result=await (await broadcastAction(b,db,owner,owner,'fixture',response,f.fetcher)).json();
  assert.equal(result.result.status,options.timeout?'unknown':'accepted');assert.equal(db.row.status,options.timeout?'unknown':'sending');assert.doesNotMatch(JSON.stringify(result),/secret data/);
  assert.equal((await broadcastAction({...b,revision:3},db,owner,owner,'fixture',response,f.fetcher)).status,409);assert.equal(f.calls.filter(c=>c.path==='/message/broadcast').length,1);
 }
});
test('gateway only replies for signed direct commands and never triggers broadcast',async()=>{
 const replies:any[]=[];let claims=0;const context={authenticated:true,owner,db:{from:()=>({insert:async()=>({error:++claims>1?{}:null})})},reply:async(_token:string,m:any[])=>{replies.push(m);}};
 const e={source:{type:'user',userId:owner},type:'message',message:{type:'text',text:'管理中心'},webhookEventId:'fixture_event_123',replyToken:'fixture'};
 assert.equal(await broadcastGateway(e,{...context,authenticated:false}),false);assert.equal(await broadcastGateway({...e,source:{type:'group',userId:owner}},context),false);
 assert.equal(await broadcastGateway(e,context),true);assert.match(JSON.stringify(replies),/admin.html/);await broadcastGateway(e,context);assert.equal(replies.length,1);
});
test('entrypoint verifies identity before broadcast and SQL permissions are private invoker',()=>{
 const source=readFileSync('supabase/functions/line-oa-kit-studio/index.ts','utf8');assert.ok(source.indexOf('identity.aud!==channelId')<source.indexOf('return await broadcastAction'));
 const sql=readFileSync('supabase/migrations/20261030021846_broadcast_center.sql','utf8');assert.match(sql,/security invoker/);assert.match(sql,/revoke all on function[\s\S]*from public,anon,authenticated/);assert.match(sql,/enable row level security/);assert.match(sql,/pg_advisory_xact_lock/);assert.doesNotMatch(sql,/security definer/i);
});
