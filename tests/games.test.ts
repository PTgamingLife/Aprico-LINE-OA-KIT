import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {centerMenu} from '../src/center-menu.ts';
const games=new URL('../public/games/',import.meta.url);
test('six center buttons preserve design/build and add teaching/games without personal linking',()=>{
 const menu=centerMenu('https://learning.example/');assert.equal(menu.areas.length,6);assert.equal(menu.areas.reduce((sum,a)=>sum+a.bounds.width*a.bounds.height,0),1200*810);assert.match(JSON.stringify(menu.areas[0]),/design.html/);assert.match(JSON.stringify(menu.areas[4]),/learning.example/);assert.match(JSON.stringify(menu.areas[5]),/games.html/);assert.throws(()=>centerMenu(''));assert.throws(()=>centerMenu('javascript:alert(1)'));assert.throws(()=>centerMenu('https://user:pass@example.com'));
});
test('all three game entrypoints and local scripts/assets are present',async()=>{
 for(const game of ['more-minesweeper','stair-kids-pro','cat-box']){const html=await readFile(new URL(game+'/index.html',games),'utf8');assert.match(html,/viewport/);for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const path=match[1];if(!/^(?:https?:|data:|#)/.test(path))await access(new URL(game+'/'+path,games));}assert.doesNotMatch(html,/<script[^>]+src="https:/);}
 const hub=await readFile(new URL('../games.html',import.meta.url),'utf8');for(const slug of ['more-minesweeper','stair-kids-pro','cat-box'])assert.ok(hub.includes('/'+slug+'/index.html'));
});
test('cat game adapter never sends identity or scores to a backend',async()=>{
 const net=await readFile(new URL('cat-box/js/cb-net.js',games),'utf8'),config=await readFile(new URL('cat-box/js/cb-config.js',games),'utf8');assert.doesNotMatch(net,/fetch\(|getProfile|shareTargetPicker/);assert.doesNotMatch(config,/sb_publishable|https:\/\/.*supabase/);
 const context=vm.createContext({window:{}});vm.runInContext(net,context);assert.equal((await context.window.CB_NET.cbInitLiff()).cb_isLine,false);assert.equal(await context.window.CB_NET.cbSubmitScore({}),false);
});
test('cat game has ten valid levels and its first puzzle can be completed',async()=>{
 const context=vm.createContext({});for(const file of ['cb-engine.js','cb-levels.js'])vm.runInContext(await readFile(new URL('cat-box/js/'+file,games),'utf8'),context);
 const levels=context.CB_LEVELS,engine=context.CB_ENGINE;assert.equal(levels.length,10);const game=engine.cbCreateGame(levels[0]);engine.cbPull(game,0);for(let i=0;i<1000&&game.state==='play';i++)engine.cbStep(game);assert.equal(game.state,'win');
});
