import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onboardingProbe} from '../supabase/functions/_shared/onboarding-probe.ts';
test('probe uses read-only paths and never returns IDs or keys',async()=>{
 const calls:string[]=[];
 const fetcher:typeof fetch=async(url,init)=>{calls.push(String(url));assert.equal(init?.method,undefined);return Response.json(String(url).endsWith('/info')?{basicId:'@228srwlt'}:{userIds:['private-id']});};
 const r=await onboardingProbe('private-token',fetcher);assert.equal(r.followersListAvailable,true);assert.doesNotMatch(JSON.stringify(r),/private/);assert.equal(calls.length,2);
});
test('403 follower listing is an explicit blocker, not an empty audience',async()=>{
 const r=await onboardingProbe('private-token',async(url)=>String(url).endsWith('/info')?Response.json({basicId:'@228srwlt'}):new Response('',{status:403}));assert.equal(r.followersListAvailable,false);assert.equal(r.followersListStatus,403);
});
test('wrong OA is rejected before accessing followers',async()=>{
 let n=0;const r=await onboardingProbe('token',async()=>{n++;return Response.json({basicId:'@wrong'});});assert.equal(r.reason,'wrong_oa');assert.equal(n,1);
});
