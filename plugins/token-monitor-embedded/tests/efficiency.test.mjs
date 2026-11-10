import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../server/src/efficiency.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false});const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const {historyBasis,HistoryBuilder,EfficiencyStore,inputCost,callBucket,summarize}=mod.exports;
const sample=(i=0,extra={})=>({timestamp:new Date(Date.UTC(2026,9,1,0,0,i)).toISOString(),input:100000,cached:90000,cacheWrite:0,output:1000,reasoning:500,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true,model:'gpt-6.1-sol',...extra});
test('independent input pricing, missing output, reasoning inclusion and weighted averages',()=>{assert.equal(inputCost(sample()),.029);assert.equal(inputCost(sample(0,{outputRecorded:false})),.029);assert.equal(callBucket(sample()).cost,.039);assert.equal(inputCost(sample(0,{cachedRecorded:false})),undefined);const s=summarize([callBucket(sample()),callBucket(sample(1,{model:'gpt-6-astra'}))]);assert.equal(s.costPerCall,(.039+.24)/2);assert.equal(s.calls,2);assert.equal(summarize([]).paybackRate,null);});
test('rolling buffers are exactly 100 normal calls and legacy first-call buffers retain earliest calls',()=>{const b=new HistoryBuilder();for(let i=0;i<150;i++)b.call(sample(i));assert.equal(b.data.first.length,100);assert.equal(b.data.last.length,100);assert.equal(b.data.first[0].timestamp,sample(0).timestamp);assert.equal(b.data.last[0].timestamp,sample(50).timestamp);assert.equal(summarize(b.data.buckets).calls,150);});
test('compaction payback uses actual calls, capacity validity and completion evidence',()=>{const b=new HistoryBuilder();b.call(sample());b.compact(sample(1).timestamp);for(let i=2;i<80;i++)b.call(sample(i,{input:40000,cached:40000}));b.activity(sample(79).timestamp);const d=b.finish(Date.parse(sample(79).timestamp)+7*864e5);assert.equal(d.paybacks[0].reason,'inactivity');assert.ok(d.paybacks[0].breakEven>0);assert.equal(d.paybacks[0].calls,78);assert.equal(summarize(d.buckets,d.paybacks).paybackRate,100);const invalid=new HistoryBuilder();invalid.call(sample());invalid.compact(sample(1).timestamp);invalid.call(sample(2,{input:50000}),60000);invalid.compact(sample(3).timestamp);assert.equal(invalid.data.paybacks[0].valid,false);});
test('zero-call compactions are unprofitable; active epochs remain pending',()=>{const b=new HistoryBuilder();b.call(sample());b.compact(sample(1).timestamp);b.activity(sample(1).timestamp);assert.equal(summarize(b.data.buckets,b.data.paybacks).pending,1);const d=b.finish(Date.parse(sample(2).timestamp),sample(2).timestamp);assert.equal(d.paybacks[0].reason,'session-end');assert.equal(summarize(d.buckets,d.paybacks).paybackRate,0);});
test('SQLite replay, restart, replacement and activation persistence',async()=>{const home=mkdtempSync(path.join(os.tmpdir(),'efficiency-'));try{mkdirSync(path.join(home,'sessions'));const file=path.join(home,'sessions','a.jsonl');const write=n=>writeFileSync(file,[JSON.stringify({type:'session_meta',payload:{id:'a'}}),JSON.stringify({type:'turn_context',payload:{model:'gpt-6.1-sol'}}),...Array.from({length:n},(_,i)=>JSON.stringify({type:'event_msg',timestamp:sample(i).timestamp,payload:{type:'token_count',info:{last_token_usage:{input_tokens:100000+i,cached_input_tokens:90000,cache_write_input_tokens:0,output_tokens:1000}}}}))].join('\n')+'\n');write(120);let store=new EfficiencyStore(home);await store.scan(home,[{id:'a',file}],true);let s=store.snapshot('a');const activation=s.activation;assert.equal(s.thread.calls,120);assert.equal(s.comparisonReady,true);await store.scan(home,[{id:'a',file}],true);assert.equal(store.snapshot('a').thread.calls,120);store.close();store=new EfficiencyStore(home);assert.equal(store.snapshot('a').activation,activation);write(2);await store.scan(home,[{id:'a',file}],true,Date.now()+6000);assert.equal(store.snapshot('a').thread.calls,2);store.close();}finally{rmSync(home,{recursive:true,force:true});}});
test('inactivity boundary is exactly seven days and fresh replay reopens it',()=>{const make=()=>{const b=new HistoryBuilder();b.call(sample());b.compact(sample(1).timestamp);b.call(sample(2,{input:40000,cached:40000}));b.activity(sample(2).timestamp);return b;};const stamp=Date.parse(sample(2).timestamp);assert.equal(make().finish(stamp+7*864e5-1).paybacks[0].completed,undefined);assert.equal(make().finish(stamp+7*864e5).paybacks[0].reason,'inactivity');const resumed=make();resumed.activity(new Date(stamp+8*864e5).toISOString());assert.equal(resumed.finish(stamp+8*864e5).paybacks[0].completed,undefined);});
test('observed retained context changes modeled overhead and recorded writes receive one credit',()=>{const b=new HistoryBuilder();b.call(sample());b.compact(sample(1).timestamp);const before=summarize(b.data.buckets).overhead;b.retainedContext(20000);assert.ok(summarize(b.data.buckets).overhead<before);const prior=summarize(b.data.buckets).overhead;b.call(sample(2,{input:30000,cached:10000,cacheWrite:20000}));assert.ok(Math.abs(summarize(b.data.buckets).overhead-(prior-.05))<1e-12);const credited=summarize(b.data.buckets).overhead;b.call(sample(3,{input:30000,cached:10000,cacheWrite:20000}));assert.equal(summarize(b.data.buckets).overhead,credited);});


function transcript(home,id,n,effort='high',date='2026-10-01',offset=0){
 const file=path.join(home,'sessions',id+'.jsonl');
 writeFileSync(file,[JSON.stringify({type:'session_meta',payload:{id}}),JSON.stringify({type:'turn_context',payload:{model:'gpt-6.1-sol',effort}}),...Array.from({length:n},(_,i)=>JSON.stringify({type:'event_msg',timestamp:new Date(Date.parse(date+'T00:00:00Z')+i*1000).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:100000+i+offset,cached_input_tokens:90000,cache_write_input_tokens:0,output_tokens:1000}}}}))].join('\n')+'\n');
 return {id,file};
}
test('deprecated metadata is inert and snapshots retain aggregates across restart and replacement',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'efficiency-retired-'));
 try{
  mkdirSync(path.join(home,'sessions'));
  const files=[transcript(home,'selected',33,'high','2026-10-31'),transcript(home,'old',120,'medium'),transcript(home,'later',150,'high','2026-10-20')];
  let store=new EfficiencyStore(home);await store.scan(home,files,true);const before=store.snapshot('selected');store.close();
  const {readdirSync}=await import('node:fs');const folder=readdirSync(home).find(n=>n.startsWith('token-monitor'));
  const db=new DatabaseSync(path.join(home,folder,'efficiency.sqlite'));const unused='unused deprecated metadata';
  db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('baseline',unused);db.close();
  store=new EfficiencyStore(home);await store.scan(home,files,true);const s=store.snapshot('selected');
  for(const field of ['baseline','baselineCalls','baselineProvisional','baselineStart','baselineEnd','baselineModels','threadModels','reference','comparisons'])assert.equal(Object.hasOwn(s,field),false,field);
  assert.equal(s.comparisonReady,true);assert.equal(s.periods.all.summary.calls,303);
  for(const field of ['thread','periods','paybacks','turns'])assert.deepEqual(s[field],before[field]);
  store.close();const verify=new DatabaseSync(path.join(home,folder,'efficiency.sqlite'));assert.equal(verify.prepare("SELECT value FROM meta WHERE key='baseline'").get().value,unused);verify.close();
  const shorter=transcript(home,'later',20,'high','2026-10-20');store=new EfficiencyStore(home);await store.scan(home,[files[0],files[1],shorter],true);
  const replaced=store.snapshot('selected');assert.equal(replaced.periods.all.summary.calls,173);assert.deepEqual(replaced.thread,before.thread);store.close();
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('period references precede UTC boundaries and all-history never compares against itself',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'efficiency-period-'));const now=Date.parse('2026-10-31T18:00:00Z');
 try{
  mkdirSync(path.join(home,'sessions'));const files=[transcript(home,'old',20,'high','2026-10-17'),transcript(home,'prior',20,'high','2026-10-24'),transcript(home,'boundary',20,'high','2026-10-25'),transcript(home,'current',20,'high','2026-10-31')];
  const store=new EfficiencyStore(home);await store.scan(home,files,true,now);const s=store.snapshot('current',now);
  assert.equal(s.periods['7'].summary.calls,40);assert.equal(s.periods['7'].previousSummary.calls,20);
  assert.equal(s.periods['30'].summary.calls,80);assert.equal(s.periods['30'].previousSummary.calls,0);
  assert.equal(s.periods.all.summary.calls,80);assert.equal(s.periods.all.previousSummary,undefined);assert.equal(s.comparisonReady,true);store.close();
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('comparison readiness requires completed history import',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'efficiency-small-'));
 try{
  mkdirSync(path.join(home,'sessions'));const files=[transcript(home,'a',20),transcript(home,'b',20)];
  const store=new EfficiencyStore(home);await store.scan(home,files,false,10000);assert.equal(store.snapshot('a').comparisonReady,false);
  await store.scan(home,files,true,16000);assert.equal(store.snapshot('a').comparisonReady,true);store.close();
 }finally{rmSync(home,{recursive:true,force:true});}
});

test('active imports, import errors and frozen calculation bases keep comparisons provisional',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'efficiency-readiness-'));let store;
 try{
  mkdirSync(path.join(home,'sessions'));const files=[transcript(home,'a',20)];store=new EfficiencyStore(home);
  const scanning=store.scan(home,files,true,10000);assert.equal(store.snapshot('a').progress.running,true);await scanning;
  assert.equal(store.snapshot('a').comparisonReady,true);
  const migrate=store.storage.migrate;store.storage.migrate=()=>{throw new Error('injected storage failure');};store.storage.changed();
  await assert.rejects(store.scan(home,files,true,16000),/injected storage failure/);
  assert.equal(store.snapshot('a').comparisonReady,false);assert.equal(store.snapshot('a').progress.failed,1);
  store.storage.migrate=migrate;await store.scan(home,files,true,22000);assert.equal(store.snapshot('a').comparisonReady,true);
  const oldBasis=store.storage.internBasis(JSON.stringify({version:0}));
  store.storage.statement('UPDATE history_sources SET basis=? WHERE id=?').run(oldBasis,'a');store.storage.changed();
  const frozen=store.snapshot('a');assert.equal(frozen.history.frozenThreads,1);assert.equal(frozen.comparisonReady,false);assert.equal(frozen.thread.calls,20);
 }finally{store?.close();rmSync(home,{recursive:true,force:true});}
});

test('older estimated calculation bases remain comparable only with matching pricing metadata',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'efficiency-compatible-'));let store;
 try{
  mkdirSync(path.join(home,'sessions'));const files=[transcript(home,'a',20)];store=new EfficiencyStore(home);await store.scan(home,files,true);
  const basis=JSON.parse(historyBasis);
  for(const version of [3,4,5]){
   const id=store.storage.internBasis(JSON.stringify({...basis,version}));store.storage.statement('UPDATE history_sources SET basis=? WHERE id=?').run(id,'a');store.storage.changed();
   assert.equal(store.snapshot('a').comparisonReady,true);assert.equal(store.snapshot('a').turns.ready,true);
  }
  for(const patch of [{version:99},{table:'different rates'},{verifiedAt:'different date'}]){
   const id=store.storage.internBasis(JSON.stringify({...basis,...patch}));store.storage.statement('UPDATE history_sources SET basis=? WHERE id=?').run(id,'a');store.storage.changed();
   assert.equal(store.snapshot('a').comparisonReady,false);assert.equal(store.snapshot('a').turns.ready,true);
  }
 }finally{store?.close();rmSync(home,{recursive:true,force:true});}
});
test('active compactions count immediately at break-even and keep tracking validity and net savings',()=>{
 const b=new HistoryBuilder();b.call(sample());b.compact(sample(1).timestamp);
 let i=2;
 while(b.data.paybacks[0].breakEven==null&&i<100){
  assert.equal(summarize(b.data.buckets,b.data.paybacks).pending,1);
  b.call(sample(i++,{input:40000,cached:40000}));
 }
 const epoch=b.data.paybacks[0];assert.ok(epoch.breakEven>0);assert.equal(epoch.completed,undefined);
 const paid=summarize(b.data.buckets,b.data.paybacks);
 assert.equal(paid.paybackRate,100);assert.equal(paid.evaluable,1);assert.equal(paid.profitable,1);assert.equal(paid.pending,0);assert.equal(paid.netSavings,epoch.net);
 const restored=new HistoryBuilder();restored.restore(structuredClone(b.checkpoint()));
 restored.call(sample(i++,{input:40000,cached:40000}));assert.ok(summarize([],restored.data.paybacks).netSavings>paid.netSavings);
 restored.compact(sample(i++).timestamp);const closed=summarize([],restored.data.paybacks);
 assert.equal(closed.evaluable,1);assert.equal(closed.profitable,1);assert.equal(closed.pending,1);
 b.call(sample(i,{input:40000,cached:40000}),50000);
 assert.equal(epoch.valid,false);assert.equal(summarize([],b.data.paybacks).paybackRate,null);
});
