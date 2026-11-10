import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ResumeProbe,capacity} from '../server/dist/resume.mjs';
function fixture(t){
 const root=mkdtempSync(path.join(tmpdir(),'tm-resume-'));let now=100000;
 const state={usage:{accountId:'account',ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:{primary:{usedPercent:20,resetsAt:150},secondary:{usedPercent:30,resetsAt:200}}}},thread:{thread:{id:'target',hostId:'local',kind:'codex',title:'Fixture',status:{type:'idle'}},turns:[{id:'turn',status:'failed'}]},sent:[],calls:[],failSend:false,before:undefined};
 const bridge={available:true,async call(tool,args,source){state.calls.push(tool);if(state.before)await state.before(tool,args);if(tool==='get_usage_limits')return structuredClone(state.usage);if(tool==='read_thread')return structuredClone(state.thread);state.sent.push({args,source});if(state.failSend)throw Error('delivery timeout');return {acknowledgement:true};}};
 const probe=new ResumeProbe(root,bridge,()=>now);t.after(()=>{probe.close();rmSync(root,{recursive:true,force:true});});
 return {root,probe,bridge,state,advance:n=>now+=n};
}
test('capacity requires fresh known values and explicit ordinary-usage eligibility',()=>{
 assert.equal(capacity({}).ready,false);
 assert.equal(capacity({ordinaryUsageAllowed:true,rateLimitsByLimitId:null,rateLimits:{primary:{usedPercent:0}}}).ready,false);
 for(const usedPercent of [100,101,NaN,-1,'0'])assert.equal(capacity({ordinaryUsageAllowed:true,rateLimits:{primary:{usedPercent}}}).ready,false);
 assert.equal(capacity({ordinaryUsageAllowed:false,rateLimits:{primary:{usedPercent:0}}}).ready,false);
 assert.equal(capacity({ordinaryUsageAllowed:true,rateLimits:{primary:{usedPercent:0}}}).ready,true);
});
test('30-second test sends once to the exact host and target without changing model',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');await f.probe.tick();assert.equal(f.state.sent.length,0);
 f.advance(30000);await Promise.all([f.probe.tick(),f.probe.tick()]);await f.probe.tick();
 assert.equal(f.state.sent.length,1);assert.equal(f.state.sent[0].source,'source');assert.equal(f.state.sent[0].args.threadId,'target');assert.equal(f.state.sent[0].args.hostId,'local');assert.equal(f.state.sent[0].args.model,undefined);assert.match(f.state.sent[0].args.prompt,/Reply only/);assert.equal(f.probe.status('target').request.phase,'sent');
});
test('reset waits for exhausted windows and live capacity instead of assuming time means reset',async t=>{
 const f=fixture(t);
 f.state.usage.ordinaryUsageAllowed=false;f.state.usage.rateLimitsByLimitId.codex.primary.usedPercent=100;
 await f.probe.arm('target','source','reset');await f.probe.tick();f.advance(55000);await f.probe.tick();assert.equal(f.state.sent.length,0);
 f.state.usage.ordinaryUsageAllowed=true;f.state.usage.rateLimitsByLimitId.codex.primary.usedPercent=0;await f.probe.tick();assert.equal(f.state.sent.length,1);assert.match(f.state.sent[0].args.prompt,/Continue the task/);
});
test('additional exhausted buckets prevent an early send',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');f.advance(30000);f.state.usage.rateLimitsByLimitId.other={primary:{usedPercent:100}};await f.probe.tick();assert.equal(f.state.sent.length,0);assert.equal(f.probe.status('target').request.phase,'armed');
});
test('manual continuation cancels even while the new turn is running',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');f.state.thread.turns=[{id:'manual-turn',status:'inProgress'}];f.advance(30000);await f.probe.tick();assert.equal(f.state.sent.length,0);assert.equal(f.probe.status('target').request.phase,'cancelled');
});
test('manual cancellation during a usage request cannot be overwritten by the worker',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');f.advance(30000);
 f.state.before=async tool=>{if(tool==='get_usage_limits')f.probe.cancel('target');};await f.probe.tick();assert.equal(f.state.sent.length,0);assert.equal(f.probe.status('target').request.phase,'cancelled');
});
test('second thread check catches continuation during the usage read',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');f.advance(30000);f.state.before=async tool=>{if(tool==='get_usage_limits')f.state.thread.turns=[{id:'manual',status:'completed'}];};await f.probe.tick();assert.equal(f.state.sent.length,0);assert.equal(f.probe.status('target').request.phase,'cancelled');
});
test('account changes cancel and a failed read never authorizes a send',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');f.advance(30000);f.state.before=async tool=>{if(tool==='get_usage_limits')throw Error('offline');};await f.probe.tick();assert.equal(f.state.sent.length,0);assert.match(f.probe.status('target').request.message,/offline/);
 f.state.before=undefined;f.state.usage.accountId='other';await f.probe.tick();assert.equal(f.probe.status('target').request.phase,'cancelled');assert.equal(f.state.sent.length,0);
});
test('ambiguous send stays uncertain and is never automatically retried',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');f.state.failSend=true;f.advance(30000);await f.probe.tick();await f.probe.tick();assert.equal(f.state.sent.length,1);assert.equal(f.probe.status('target').request.phase,'uncertain');
});
test('persisted unique claim prevents duplicate arms across server instances',async t=>{
 const f=fixture(t),other=new ResumeProbe(f.root,f.bridge,()=>130000);t.after(()=>other.close());await f.probe.arm('target','source','test');await assert.rejects(other.arm('target','source','test'),/already has/);f.advance(30000);await Promise.all([f.probe.tick(),other.tick()]);assert.equal(f.state.sent.length,1);
});
test('closing cancels pending work and reopening does not replay it',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');f.probe.close();const other=new ResumeProbe(f.root,f.bridge,()=>140000);try{await other.tick();assert.equal(other.status('target').request.phase,'cancelled');assert.equal(f.state.sent.length,0);}finally{other.close();}
});
test('a dead process sending claim is marked uncertain, never replayed',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','test');const db=new DatabaseSync(path.join(f.root,'resume-probe.sqlite'));const row=db.prepare('SELECT * FROM resume_requests').get(),data=JSON.parse(row.data);data.pid=2147483647;data.phase='sending';db.prepare('UPDATE resume_requests SET phase=?,data=?').run(data.phase,JSON.stringify(data));db.close();assert.equal(f.probe.status('target').request.phase,'uncertain');await f.probe.tick();assert.equal(f.state.sent.length,0);
});
test('expiry and cancellation prevent delivery; busy targets cannot be armed',async t=>{
 const f=fixture(t);f.state.thread.turns[0].status='inProgress';await assert.rejects(f.probe.arm('target','source','test'),/idle/);f.state.thread.turns[0].status='failed';await f.probe.arm('target','source','test');f.advance(25*3600000);await f.probe.tick();assert.equal(f.probe.status('target').request.phase,'expired');assert.equal(f.state.sent.length,0);
});

test('chat toggle can be enabled during work and follows turns until usage runs out',async t=>{
 const f=fixture(t);f.state.thread.turns[0].status='inProgress';
 await f.probe.arm('target','source','reset');await f.probe.tick();
 f.state.thread.turns=[{id:'next-turn',status:'completed'}];f.advance(30000);await f.probe.tick();
 assert.equal(f.probe.status('target').request.waitingForLimit,true);assert.equal(f.state.sent.length,0);
 f.state.usage.ordinaryUsageAllowed=false;f.state.usage.rateLimitsByLimitId.codex.primary.usedPercent=100;
 f.state.thread.turns[0].status='inProgress';await f.probe.tick();assert.equal(f.probe.status('target').request.waitingForLimit,true);
 f.state.thread.turns[0].status='failed';await f.probe.tick();assert.equal(f.probe.status('target').request.waitingForLimit,false);
 f.advance(30000);f.state.usage.ordinaryUsageAllowed=true;f.state.usage.rateLimitsByLimitId.codex.primary.usedPercent=0;
 await f.probe.tick();await f.probe.tick();assert.equal(f.state.sent.length,1);assert.equal(f.probe.status('target').request.phase,'sent');
});
test('toggle cancellation and manual continuation after exhausted usage prevent dispatch',async t=>{
 const f=fixture(t);await f.probe.arm('target','source','reset');f.probe.cancel('target');await f.probe.tick();assert.equal(f.state.sent.length,0);
 await f.probe.arm('target','source','reset');f.state.usage.rateLimitsByLimitId.codex.primary.usedPercent=100;await f.probe.tick();
 f.state.thread.turns=[{id:'manual',status:'inProgress'}];await f.probe.tick();assert.equal(f.probe.status('target').request.phase,'cancelled');assert.equal(f.state.sent.length,0);
});
test('unknown reset time waits without dispatch and recovers when supplied',async t=>{
 const f=fixture(t);f.state.usage.rateLimitsByLimitId.codex.primary={usedPercent:100};await f.probe.arm('target','source','reset');await f.probe.tick();
 assert.match(f.probe.status('target').request.message,/known usage reset/);assert.equal(f.state.sent.length,0);
 f.state.usage.rateLimitsByLimitId.codex.primary.resetsAt=150;await f.probe.tick();assert.equal(f.probe.status('target').request.waitingForLimit,false);
});

test('every returned bucket must supply known capacity',()=>{
 const valid={primary:{usedPercent:2}};
 for(const bad of [null,{},[],false,'unknown',{primary:{}},{primary:{usedPercent:'2'}},{primary:{usedPercent:NaN}}]){
  assert.equal(capacity({ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:valid,other:bad}}).ready,false,JSON.stringify(bad));
 }
 for(const bucket of [valid,{secondary:{usedPercent:0}},{primary:{usedPercent:0},secondary:null}]){
  assert.equal(capacity({ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:bucket}}).ready,true);
 }
 assert.equal(capacity({ordinaryUsageAllowed:true,rateLimitsByLimitId:{}}).ready,false);
 assert.equal(capacity({ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:valid,weekly:{primary:{usedPercent:100}}}}).ready,false);
});
