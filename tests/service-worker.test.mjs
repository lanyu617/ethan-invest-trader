import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../site/sw.js',import.meta.url),'utf8');
function harness(){
 const handlers={};const state={paths:[],skip:0,claim:0,deleted:[],network:[]};
 const context={URL,Promise,Set,
  self:{location:{href:'https://example.test/sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>state.skip++,clients:{claim:()=>state.claim++}},
  caches:{open:async()=>({addAll:async paths=>state.paths=paths}),keys:async()=>['unrelated-cache','ethan-trader-shell-old','ethan-trader-shell-0.1.0'],delete:async key=>state.deleted.push(key),match:async()=>({cached:true})},
  fetch:async req=>{state.network.push(req);throw new Error('offline');}
 };
 vm.runInNewContext(script,context);return {handlers,state};
}
test('service worker precaches only packaged shell resources',async()=>{const {handlers,state}=harness();let p;handlers.install({waitUntil:x=>p=x});await p;assert.ok(state.paths.includes('https://example.test/assets/app.js'));assert.ok(state.paths.every(x=>!x.includes('/api/')));assert.equal(state.skip,0);});
test('service worker leaves future private API traffic alone',()=>{const {handlers}=harness();let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://example.test/api/account',mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);});
test('service worker never queues or intercepts writes',()=>{const {handlers}=harness();let intercepted=false;handlers.fetch({request:{method:'POST',url:'https://example.test/',mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);});
test('service worker navigation fallback returns shell on simulated network failure',async()=>{const {handlers}=harness();let p;handlers.fetch({request:{method:'GET',url:'https://example.test/',mode:'navigate'},respondWith:x=>p=x});assert.equal((await p).cached,true);});
test('service worker updates require explicit activation; unrelated caches retained',async()=>{const {handlers,state}=harness();handlers.message({data:{type:'UNKNOWN'}});assert.equal(state.skip,0);handlers.message({data:{type:'ACTIVATE_UPDATE'}});assert.equal(state.skip,1);let p;handlers.activate({waitUntil:x=>p=x});await p;assert.deepEqual(state.deleted,['ethan-trader-shell-old']);assert.equal(state.claim,1);});
