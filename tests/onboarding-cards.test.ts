import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {oaWelcomeCard,oaValueCard,onboardingCarousel,INTRO_SOURCES} from '../src/onboarding-cards.ts';
import {validateBroadcast} from '../src/broadcast-model.ts';
test('welcome cards fit existing owner-only editable card schema without sending',()=>{
 for(const c of [oaWelcomeCard(),oaValueCard()]){assert.deepEqual(validateBroadcast(c),c);assert.ok([...c.title].length<=60);assert.ok([...c.body].length<=1000);assert.match(c.url,/^https:\/\/liff.line.me\/2012197506-Vmb4O5iT\/design.html$/);assert.equal(c.imageUrl,'');}
 assert.match(oaWelcomeCard().body,/Email/);assert.match(oaWelcomeCard().body,/不保證觸及/);assert.match(oaWelcomeCard().body,/互補/);
});
test('comparison has current price, five credits, source/date and honest service boundaries',()=>{
 const c=oaValueCard();for(const phrase of ['NT$6,660','NT$3,860','5 次','NT$15,000','NT$5,000','不相加','不是全客製代工','帳號本身可免費申請','2026-10-30','另計'])assert.ok(c.body.includes(phrase),phrase);
 assert.doesNotMatch(c.body,/保證成交|全自動完成|省下\d+%|免費無限/);assert.equal(INTRO_SOURCES.length,3);
});
test('two-bubble LINE Flex carousel is a payload artifact, never a broadcast action',()=>{
 const card=onboardingCarousel();assert.equal(card.type,'flex');assert.equal(card.contents.type,'carousel');assert.equal(card.contents.contents.length,2);
 assert.ok(JSON.stringify(card).length<20000);for(const [i,b] of card.contents.contents.entries()){assert.equal(b.type,'bubble');assert.ok(b.header.contents[0].text.includes(`0${i+1}`));assert.equal(b.footer.contents[0].action.type,'uri');}
 const source=readFileSync(new URL('../src/onboarding-cards.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|Deno\.env|broadcast_send|api\.line\.me/);
});
test('public preview needs no login; templates do not bypass owner confirmation',()=>{
 const page=readFileSync(new URL('../src/intro.jsx',import.meta.url),'utf8'),admin=readFileSync(new URL('../src/admin.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(page,/fetch\(|getIDToken|\.login\(/);assert.match(page,/尚未自動發送/);assert.match(admin,/套用 LINE OA 優勢卡/);assert.match(admin,/套用方案比較卡/);assert.match(admin,/confirmText!=='確認發送給全部好友'/);
});
