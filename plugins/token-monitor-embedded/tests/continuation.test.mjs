import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {Continuation} from '../server/dist/continuation.mjs';
import {BridgeUsage} from '../server/dist/bridge-usage.mjs';
function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'tm-cont-'));let now=1000000,sends=0,failSend=false,archived=false;
 const u={accountId:'account',ordinaryUsageAllowed:true,rateLimits:{primary:{usedPercent:90,windowDurationMins:300,resetsAt:1010}}};
 const thread={thread:{id:'chat',kind:'codex',hostId:'local',status:{activeFlags:[]}},turns:[{id:'turn',status:'completed',error:null}]};
 const bridge={available:true,async call(tool){if(tool==='get_usage_limits')return structuredClone(u);if(tool==='read_thread')return structuredClone(thread);if(tool==='send_message_to_thread'){sends++;if(failSend)throw Error('unknown');return {};}}};
 const usage=new BridgeUsage(bridge,()=>now);usage.bind('source');let worker=new Continuation(root,usage,bridge,()=>now,()=>archived,()=>[thread.thread.id]);
 return {u,thread,usage,root,get worker(){return worker;},get sends(){return sends;},advance(n=30000){now+=n;},fail(){failSend=true;},archive(){archived=true;},async all(){return worker.view('chat','source','enable_all');},async enable(){return worker.view('chat','source','enable');},async view(action='status',id='chat'){return worker.view(id,'source',action);},async tick(){await worker.tick();},restart(){worker.close();worker=new Continuation(root,usage,bridge,()=>now,()=>archived,()=>[thread.thread.id]);},close(){worker.close();usage.close();rmSync(root,{recursive:true,force:true});}};
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

test('all threads discovers future local threads, persists, and current/off revoke global permission',async()=>{
 const f=fixture();try{
  assert.equal((await f.all()).mode,'all');f.restart();assert.equal((await f.view()).mode,'all');
  f.thread.thread.id='future';f.thread.turns[0]={id:'future-turn',status:'failed',error:{codexErrorInfo:'usageLimitExceeded'}};
  await new Promise(r=>setImmediate(r));await f.tick();assert.equal(f.sends,1);
  const off=await f.view('disable','future');assert.equal(off.mode,'off');
  f.thread.turns[0].id='another';await f.tick();assert.equal(f.sends,1);
  assert.equal((await f.view('enable','future')).mode,'current');
  f.thread.thread.id='other';f.thread.turns[0].id='other-turn';await f.tick();assert.equal(f.sends,1);
 }finally{f.close();}
});

test('an unavailable returned bucket cannot authorize a continuation',async()=>{
 const f=fixture();try{await f.enable();failed(f);f.u.rateLimitsByLimitId={codex:f.u.rateLimits,other:null};await f.tick();assert.equal(f.sends,0);}finally{f.close();}
});

test('offline Off from another caller revokes the validated scope and waiting work',async()=>{
 const f=fixture();try{
  await f.all();failed(f);f.u.rateLimits.primary.usedPercent=100;await f.tick();
  await f.worker.view('chat','source-b');f.usage.close();
  const db=new DatabaseSync(path.join(f.root,'continuation.sqlite'));
  db.prepare("INSERT INTO preferences VALUES('other-account','local','*','source-b',1,NULL,'All threads')").run();
  db.prepare("INSERT INTO preferences VALUES('account','other-host','*','source-b',1,NULL,'All threads')").run();
  assert.equal((await f.worker.view('chat','source-b')).mode,'all');
  assert.equal((await f.worker.view('chat','source-b','disable')).mode,'off');
  assert.equal(db.prepare("SELECT count(*) n FROM preferences WHERE account='account' AND host='local' AND enabled=1").get().n,0);
  assert.equal(db.prepare("SELECT phase FROM episodes").get().phase,'cancelled');
  assert.equal(db.prepare("SELECT enabled FROM preferences WHERE account='other-account'").get().enabled,1);
  assert.equal(db.prepare("SELECT enabled FROM preferences WHERE host='other-host'").get().enabled,1);
  db.close();f.restart();assert.equal((await f.worker.view('chat','source-b')).mode,'off');
 }finally{f.close();}
});
test('offline mutations need validated scope and unchanged selection',async()=>{
 const f=fixture();try{
  await f.all();f.usage.close();
  await assert.rejects(f.worker.view('chat','unknown-source','disable'),/cannot be confirmed/);
  await assert.rejects(f.worker.view('chat','source','disable',()=>false),/Selected chat changed/);
  assert.equal((await f.view()).mode,'all');
 }finally{f.close();}
});
test('scope write failure rolls back permissions and waiting episode changes',async()=>{
 const f=fixture();try{
  await f.all();failed(f);f.u.rateLimits.primary.usedPercent=100;await f.tick();
  const db=new DatabaseSync(path.join(f.root,'continuation.sqlite'));
  db.exec("CREATE TRIGGER fail_scope BEFORE UPDATE OF source ON preferences BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  await assert.rejects(f.enable(),/injected failure/);
  assert.equal((await f.view()).mode,'all');
  assert.equal(db.prepare('SELECT phase FROM episodes').get().phase,'waiting');
  db.exec('DROP TRIGGER fail_scope');f.usage.close();
  db.exec("CREATE TRIGGER fail_off BEFORE UPDATE ON episodes BEGIN SELECT RAISE(ABORT,'offline failure'); END");
  await assert.rejects(f.view('disable'),/offline failure/);
  assert.equal((await f.view()).mode,'all');db.close();
 }finally{f.close();}
});
test('separate processes changing Current thread leave exactly one scope enabled',async()=>{
 const f=fixture();try{
  const moduleURL=new URL('../server/dist/continuation.mjs',import.meta.url).href;
  const usageURL=new URL('../server/dist/bridge-usage.mjs',import.meta.url).href;
  const code=`
   import {Continuation} from ${JSON.stringify(moduleURL)};
   import {BridgeUsage} from ${JSON.stringify(usageURL)};
   const [root,id]=process.argv.slice(1);
   const bridge={available:true,async call(tool){return tool==='get_usage_limits'?{accountId:'account'}:{thread:{id,hostId:'local',kind:'codex'}};}};
   const usage=new BridgeUsage(bridge);const worker=new Continuation(root,usage,bridge);
   process.send('ready');process.once('message',async()=>{try{for(let i=0;i<30;i++)await worker.view(id,id,'enable');worker.close();usage.close();process.disconnect();}catch(e){console.error(e);process.exit(1);}});
  `;
  const children=['a','b'].map(id=>spawn(process.execPath,['--input-type=module','-e',code,f.root,id],{stdio:['ignore','ignore','pipe','ipc']}));
  const exits=children.map(child=>new Promise((resolve,reject)=>{let errors='';child.stderr.on('data',d=>errors+=d);child.on('error',reject);child.on('exit',n=>n===0?resolve():reject(Error(errors)));}));
  await Promise.all(children.map(child=>new Promise(resolve=>child.once('message',resolve))));
  children.forEach(child=>child.send('go'));await Promise.all(exits);
  const db=new DatabaseSync(path.join(f.root,'continuation.sqlite'));
  const rows=db.prepare('SELECT thread FROM preferences WHERE enabled=1').all();db.close();
  assert.equal(rows.length,1);assert.ok(['a','b'].includes(rows[0].thread));
 }finally{f.close();}
});
