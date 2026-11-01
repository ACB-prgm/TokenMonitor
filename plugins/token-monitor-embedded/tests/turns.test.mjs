import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
async function load(file){const b=await build({entryPoints:[new URL(file,import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',write:false});const m={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports;}
const {TurnCounter,estimateTurnPayback}=await load('../server/src/turns.ts');
const {TelemetryParser}=await load('../server/src/parser.ts');
const {EfficiencyStore}=await load('../server/src/efficiency.ts');
const now=Date.parse('2026-11-01T12:00:00Z'),stamp=new Date(now).toISOString();
const event=(t,p={})=>({type:'event_msg',timestamp:stamp,payload:{type:t,...p}});
function start(c,id){c.consume('event_msg',{type:'task_started',turn_id:id,turn_attribution:{turn_trigger:'composer'}},stamp);}
function end(c,id){c.consume('event_msg',{type:'task_complete',turn_id:id},stamp);}
test('completed turns count model calls once, without tool calls or duplicate lifecycle events',()=>{
 const c=new TurnCounter();start(c,'a');start(c,'a');c.call('m');c.consume('response_item',{type:'function_call'},stamp);c.call('m');end(c,'a');end(c,'a');start(c,'a');end(c,'a');
 assert.deepEqual(c.snapshot(),{models:[{model:'m',turns:1,calls:2}],epochCompleted:1});
});
test('abort, incomplete, missing-user, mixed-model and orphan completion evidence cannot create turns',()=>{
 const c=new TurnCounter();end(c,'orphan');start(c,'a');c.call('m');c.consume('event_msg',{type:'turn_aborted',turn_id:'a'},stamp);end(c,'a');
 start(c,'b');c.call('m');c.call('other');end(c,'b');
 c.consume('event_msg',{type:'task_started',turn_id:'missing-user'},stamp);c.call('m');end(c,'missing-user');
 start(c,'incomplete');c.call('m');assert.deepEqual(c.snapshot(),{models:[],epochCompleted:0});
});
test('compaction resets epoch and a spanning completed turn remains outside the new epoch',()=>{
 const c=new TurnCounter();start(c,'a');c.call('m');end(c,'a');start(c,'b');c.call('m');c.consume('compacted',{},stamp);c.call('m');end(c,'b');assert.equal(c.snapshot().epochCompleted,0);
 start(c,'c');c.call('m');end(c,'c');assert.equal(c.snapshot().epochCompleted,1);assert.deepEqual(c.snapshot().models,[{model:'m',turns:3,calls:4}]);
});
test('legacy user-message boundaries work; mismatched ids and non-user triggers are excluded',()=>{
 const c=new TurnCounter();c.consume('event_msg',{type:'user_message'},stamp);c.call('m');c.consume('event_msg',{type:'task_complete'},stamp);
 c.consume('event_msg',{type:'task_started',turn_id:'auto',turn_attribution:{turn_trigger:'scheduled'}},stamp);c.consume('response_item',{type:'message',role:'user'},stamp);c.call('m');end(c,'auto');
 start(c,'bad');c.consume('turn_context',{turn_id:'different'},stamp);c.call('m');end(c,'bad');assert.deepEqual(c.snapshot().models,[{model:'m',turns:1,calls:1}]);
});
const args=(extra={})=>({forecast:{model:'m',status:'available',breakEvenCalls:6,completedCalls:20,horizonCalls:20,netSavingsUsd:.1,assumptions:{pricingAvailable:true,contextLimitKnown:true,growth:{source:'thread'},output:{fallback:false}}},stats:{epochCompleted:4,models:[{model:'m',turns:5,calls:20}]},history:[{model:'m',turns:20,calls:40}],ready:true,available:true,lastCall:stamp,now,...extra});
test('turn conversion uses smaller qualifying mean, 25% buffer and upward rounding',()=>{
 const r=estimateTurnPayback(args());assert.equal(r.source,'both');assert.equal(r.threadMean,4);assert.equal(r.historyMean,2);assert.equal(r.bufferedMean,1.5);assert.equal(r.turns,4);
 assert.equal(estimateTurnPayback(args({stats:{epochCompleted:4,models:[{model:'m',turns:4,calls:16}]}})).source,'history');
 assert.equal(estimateTurnPayback(args({history:[{model:'m',turns:19,calls:38}]})).source,'thread');
 assert.equal(estimateTurnPayback(args({stats:{epochCompleted:4,models:[]},history:[]})).status,'unavailable');
 const f=args().forecast;assert.equal(estimateTurnPayback(args({forecast:{...f,breakEvenCalls:7}})).turns,5);
});
test('guidance gates require recent telemetry, observed forecasts and recovered prior compaction',()=>{
 const original=args();for(const extra of [{ready:false},{available:false},{ended:true},{lastCall:undefined},{lastCall:new Date(now-7200001).toISOString()},{lastCall:new Date(now+1).toISOString()},{isCompacting:true},{awaitingPostCompactionCall:true},{hasCompactions:true},{hasCompactions:true,latestPayback:{valid:true,breakEven:null}},{hasCompactions:true,latestPayback:{valid:false,breakEven:1}},{hasCompactions:true,latestCompaction:stamp,latestPayback:{valid:true,breakEven:1,timestamp:'older'}}])assert.equal(estimateTurnPayback(args(extra)).status,'unavailable',JSON.stringify(extra));
 for(const patch of [{status:'limited'},{breakEvenCalls:null},{breakEvenCalls:21},{breakEvenCalls:Infinity},{netSavingsUsd:0},{netSavingsUsd:-1},{netSavingsUsd:.0000009},{assumptions:{...original.forecast.assumptions,growth:{source:'default'}}},{assumptions:{...original.forecast.assumptions,growth:{}}},{assumptions:{...original.forecast.assumptions,output:{}}},{assumptions:{...original.forecast.assumptions,output:{fallback:true}}},{assumptions:{...original.forecast.assumptions,contextLimitKnown:false}}])assert.equal(estimateTurnPayback(args({forecast:{...original.forecast,...patch}})).status,'unavailable');
 assert.equal(estimateTurnPayback(args({hasCompactions:true,latestPayback:{valid:true,breakEven:2}})).status,'available');
 assert.equal(estimateTurnPayback(args({forecast:{...original.forecast,netSavingsUsd:.000001}})).status,'available');
});
function records(id,count){let i=0;const rows=[{type:'session_meta',payload:{id}},{type:'turn_context',timestamp:stamp,payload:{model:'m'}}];for(let n=0;n<count;n++){rows.push(event('task_started',{turn_id:id+n,turn_attribution:{turn_trigger:'composer'}}));for(let j=0;j<2;j++)rows.push({type:'event_msg',timestamp:new Date(now+i++*1000).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:1000+i,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:1}}}});rows.push({...event('task_complete',{turn_id:id+n}),timestamp:new Date(now+i*1000).toISOString()});}return rows;}
test('parser replay deduplicates model calls and lifecycle events without changing accounting',()=>{
 const p=new TelemetryParser(),rows=records('a',5);for(const r of rows){p.consume(r);p.consume(r);}assert.equal(p.callCount,10);assert.equal(p.turns.snapshot().models[0].calls,10);assert.equal(p.turns.snapshot().epochCompleted,5);
});
test('versioned historical replay preserves totals, restart and other-chat-only turn aggregates',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'turns-history-'));try{
 mkdirSync(path.join(home,'sessions'));const files=['a','b'].map(id=>{const file=path.join(home,'sessions',id+'.jsonl');writeFileSync(file,records(id,id==='a'?5:20).map(JSON.stringify).join('\n')+'\n');return {id,file};});
 let s=new EfficiencyStore(home);await s.scan(home,files,true,now);const before=s.snapshot('a',now);assert.deepEqual(before.turns.other,[{model:'m',turns:20,calls:40}]);s.close();
 const db=new DatabaseSync(path.join(home,process.env.TOKEN_MONITOR_DEV==='1'?'token-monitor-dev':'token-monitor-embedded','efficiency.sqlite'));db.prepare('UPDATE threads SET basis=?').run('legacy-format');db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('baseline','frozen-record');db.close();
 s=new EfficiencyStore(home);await s.scan(home,files,true,now+6000);const after=s.snapshot('a',now);assert.deepEqual(after.thread,before.thread);assert.deepEqual(after.periods.all.summary,before.periods.all.summary);assert.deepEqual(after.turns,before.turns);s.close();
 const read=new DatabaseSync(path.join(home,process.env.TOKEN_MONITOR_DEV==='1'?'token-monitor-dev':'token-monitor-embedded','efficiency.sqlite'));assert.equal(read.prepare("SELECT value FROM meta WHERE key='baseline'").get().value,'frozen-record');read.close();
 s=new EfficiencyStore(home);assert.deepEqual(s.snapshot('a',now).turns,before.turns);s.close();
 }finally{rmSync(home,{recursive:true,force:true});}
});

test('a second user message after calls without a fresh turn boundary is ambiguous',()=>{
 const c=new TurnCounter();start(c,'a');c.call('m');c.consume('event_msg',{type:'user_message'},new Date(now+1000).toISOString());end(c,'a');assert.equal(c.snapshot().epochCompleted,0);
});
