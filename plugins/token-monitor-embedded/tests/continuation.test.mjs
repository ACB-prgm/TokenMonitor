import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Continuation} from '../server/dist/continuation.mjs';
import {BridgeUsage} from '../server/dist/bridge-usage.mjs';
function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'tm-cont-'));let now=1000000,sends=0,failSend=false,archived=false;
 const u={accountId:'account',ordinaryUsageAllowed:true,rateLimits:{primary:{usedPercent:90,windowDurationMins:300,resetsAt:1010}}};
 const thread={thread:{id:'chat',kind:'codex',hostId:'local',status:{activeFlags:[]}},turns:[{id:'turn',status:'completed',error:null}]};
 const bridge={available:true,async call(tool){if(tool==='get_usage_limits')return structuredClone(u);if(tool==='read_thread')return structuredClone(thread);if(tool==='send_message_to_thread'){sends++;if(failSend)throw Error('unknown');return {};}}};
 const usage=new BridgeUsage(bridge,()=>now);usage.bind('source');let worker=new Continuation(root,usage,bridge,()=>now,()=>archived);
 return {u,thread,usage,root,get worker(){return worker;},get sends(){return sends;},advance(n=30000){now+=n;},fail(){failSend=true;},archive(){archived=true;},async enable(){return worker.view('chat','source','enable');},async view(action='status',id='chat'){return worker.view(id,'source',action);},async tick(){await worker.tick();},restart(){worker.close();worker=new Continuation(root,usage,bridge,()=>now,()=>archived);},close(){worker.close();usage.close();rmSync(root,{recursive:true,force:true});}};
}
const failed=f=>{f.thread.turns[0]={id:'turn',status:'failed',error:{codexErrorInfo:'usageLimitExceeded'}};};
test('default off, per chat permission, prompt threshold and dismissal persist',async()=>{
 const f=fixture();try{
  assert.equal((await f.view()).enabled,false);assert.equal((await f.view()).offer,true);
  await f.view('dismiss');assert.equal((await f.view()).offer,false);f.restart();assert.equal((await f.view()).offer,false);
  await f.enable();assert.equal((await f.view()).enabled,true);f.restart();assert.equal((await f.view()).enabled,true);
  await assert.rejects(f.view('enable','other'));await f.view('disable');assert.equal((await f.view()).enabled,false);
 }finally{f.close();}
});
test('completed, idle, manual interruption, generic failure and transient rate limit never send',async()=>{
 const f=fixture();try{await f.enable();for(const [status,error]of [['completed',null],['interrupted',null],['failed',null],['failed',{codexErrorInfo:'rateLimitExceeded'}],['failed',{codexErrorInfo:'other'}]]){Object.assign(f.thread.turns[0],{status,error});f.advance();await f.tick();}assert.equal(f.sends,0);}finally{f.close();}
});
test('confirmed usage failure waits for deadline, fresh capacity and survives restart without duplicate sends',async()=>{
 const f=fixture();try{await f.enable();failed(f);f.u.rateLimits.primary.usedPercent=100;f.u.ordinaryUsageAllowed=false;await f.tick();assert.equal(f.sends,0);
 f.restart();await new Promise(r=>setImmediate(r));f.advance();f.u.rateLimits.primary.usedPercent=2;f.u.ordinaryUsageAllowed=true;await f.tick();assert.equal(f.sends,1);await f.tick();assert.equal(f.sends,1);assert.equal((await f.view()).enabled,true);
 }finally{f.close();}
});
test('ambiguous delivery is not retried across workers or restart',async()=>{
 const f=fixture();try{await f.enable();failed(f);f.fail();await f.tick();assert.equal(f.sends,1);f.restart();await new Promise(r=>setImmediate(r));await f.tick();assert.equal(f.sends,1);}finally{f.close();}
});
test('manual continuation, disable, archive and account change prevent dispatch',async()=>{
 for(const action of ['manual','disable','archive','account']){const f=fixture();try{await f.enable();failed(f);f.u.rateLimits.primary.usedPercent=100;await f.tick();f.advance();f.u.rateLimits.primary.usedPercent=2;
 if(action==='manual')f.thread.turns[0]={id:'new',status:'completed'};
 if(action==='disable')await f.view('disable');if(action==='archive')f.archive();if(action==='account')f.u.accountId='other';await f.tick();assert.equal(f.sends,0,action);
 }finally{f.close();}}
});
test('unknown windows and unknown reset times never authorize dispatch',async()=>{
 const f=fixture();try{await f.enable();failed(f);f.u.rateLimits.primary.usedPercent=100;delete f.u.rateLimits.primary.resetsAt;await f.tick();assert.equal(f.sends,0);delete f.u.rateLimits.primary;await f.tick();assert.equal(f.sends,0);}finally{f.close();}
});
test('two workers sharing storage claim an interrupted turn only once',async()=>{
 const f=fixture();let other,otherSends=0;try{await f.enable();failed(f);
 const bridge={available:true,async call(tool){if(tool==='get_usage_limits')return structuredClone(f.u);if(tool==='read_thread')return structuredClone(f.thread);if(tool==='send_message_to_thread'){otherSends++;return {};}}};
 // Both workers race the same persisted episode.
 other=new Continuation(f.root,f.usage,bridge,()=>1000000);await Promise.all([f.tick(),other.tick()]);await new Promise(r=>setImmediate(r));assert.equal(f.sends+otherSends,1);
 }finally{other?.close();f.close();}
});
test('weekly exhaustion delays continuation and disabling works when bridge goes offline',async()=>{
 const f=fixture();try{await f.enable();failed(f);f.u.rateLimits.secondary={usedPercent:100,windowDurationMins:10080,resetsAt:1050};await f.tick();assert.equal(f.sends,0);
 f.advance(60000);f.u.rateLimits.secondary.usedPercent=1;await f.tick();assert.equal(f.sends,1);
 f.usage.close();assert.equal((await f.view()).enabled,true);await f.view('disable');assert.equal((await f.view()).enabled,false);
 }finally{f.close();}
});
