import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),contents:`export {HistoryDatabase} from './server/src/history-database';export {importHistory} from './server/src/history-import';export {HistoryBuilder,summarize,historyBasis,EfficiencyStore} from './server/src/efficiency';export {TelemetryParser} from './server/src/parser';`},bundle:true,platform:'node',format:'cjs',write:false});const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const {HistoryDatabase,importHistory,HistoryBuilder,summarize,historyBasis,TelemetryParser}=mod.exports;
const now=Date.now(),stamp=i=>new Date(now-100000+i*1000).toISOString();
const call=(i,input=100000)=>({type:'event_msg',timestamp:stamp(i),payload:{type:'token_count',info:{model_context_window:475000,last_token_usage:{input_tokens:input,cached_input_tokens:Math.min(90000,input),cache_write_input_tokens:0,output_tokens:1000,reasoning_output_tokens:100}}}});
const lines=rs=>rs.map(r=>JSON.stringify(r)).join('\n')+'\n';
const header={type:'session_meta',timestamp:stamp(0),payload:{id:'a',source:'cli',title:'Secret title not retained in numeric checkpoint'}};
const context={type:'turn_context',timestamp:stamp(0),payload:{model:'gpt-6.1-sol',effort:'high'}};
function fixture(fn){const home=mkdtempSync(path.join(tmpdir(),'tm-import-'));mkdirSync(path.join(home,'sessions'));const f={id:'a',file:path.join(home,'sessions','a.jsonl')};mkdirSync(path.join(home,'store'));const file=path.join(home,'store','efficiency.sqlite');const db=new HistoryDatabase(file);try{return fn({home,f,db,file});}finally{db.close();rmSync(home,{recursive:true,force:true});}}
const drain=(db,home,f,extra={})=>{let r,n=0;do{r=importHistory(db,home,f,historyBasis,{maxBytes:512,maxMs:500,...extra});assert.ok(++n<10000);}while(!r.complete&&!r.waiting);return r;};
test('unchanged and incomplete transcripts refresh catalogue metadata without replaying usage',()=>fixture(({home,f,db})=>{
 writeFileSync(f.file,lines([header,context,call(1)]));drain(db,home,f);
 for(const partial of [false,true]){
  if(partial){appendFileSync(f.file,'{"unfinished":');drain(db,home,f);}
  const revision=db.revision();
  const result=importHistory(db,home,{...f,title:partial?'Waiting':'Renamed',workspace:'New workspace',archived:true},historyBasis);
  assert.equal(result.bytes,0);assert.notEqual(db.revision(),revision);
  assert.equal(db.savedTasks().length,0);
  assert.equal(db.savedTasks('',true)[0].title,partial?'Waiting':'Renamed');
  importHistory(db,home,f,historyBasis);
  assert.equal(db.savedTasks('',true)[0].archived,true);
  assert.equal(summarize(db.buckets()).calls,1);
 }
}));
test('scan fast paths observe metadata changes and removed catalogue members',async()=>{
 const home=mkdtempSync(path.join(tmpdir(),'tm-catalogue-refresh-'));mkdirSync(path.join(home,'sessions'));
 const f={id:'a',file:path.join(home,'sessions','a.jsonl'),title:'Original'};
 const store=new mod.exports.EfficiencyStore(home);
 try{
  writeFileSync(f.file,lines([header,context,call(1)]));await store.scan(home,[f],true,now);
  await store.scan(home,[{...f,title:'Renamed',archived:true}],true,now+1);
  assert.equal(store.savedTasks().length,0);assert.equal(store.savedTasks('',true)[0].title,'Renamed');
  assert.equal(store.snapshot('a',now).history.sourceAvailable,true);
  await store.scan(home,[],true,now+2);
  assert.equal(store.snapshot('a',now).history.sourceAvailable,false);
  assert.equal(store.savedTasks('',true)[0].sourceAvailable,false);
 }finally{store.close();rmSync(home,{recursive:true,force:true});}
});
function oracle(rs,end){const b=new HistoryBuilder(),p=new TelemetryParser(e=>{if(e.kind==='activity')b.activity(e.timestamp);else if(e.kind==='compaction')b.compact(e.timestamp);else if(e.kind==='retained')b.retainedContext(e.tokens);else if(e.kind==='turn')b.turn(e.turn);else b.call(e.sample,e.contextLimit);});rs.forEach(r=>p.consume(r));return b.finish(now,end);}
function closeTo(a,b){for(const k of ['calls','priced','inputPriced','cost','inputCost','overhead','evaluable','profitable','netSavings','pending','excluded'])assert.ok(Math.abs(a[k]-b[k])<1e-9,`${k}: ${a[k]} vs ${b[k]}`);}
test('bounded batches and append resumes match full parsing across turns and compactions',()=>fixture(({home,f,db})=>{
 const rs=[header,context,{type:'event_msg',timestamp:stamp(1),payload:{type:'task_started',turn_id:'t',turn_attribution:{turn_trigger:'composer'}}},call(2),{type:'compacted',timestamp:stamp(3),payload:{}},{type:'event_msg',timestamp:stamp(4),payload:{type:'token_count',info:{last_token_usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0,total_tokens:35000}}}},...Array.from({length:15},(_,i)=>call(i+5,40000)),{type:'event_msg',timestamp:stamp(20),payload:{type:'task_complete',turn_id:'t'}}];
 writeFileSync(f.file,lines(rs.slice(0,4)));drain(db,home,f);
 appendFileSync(f.file,lines(rs.slice(4)));f.end=stamp(30);drain(db,home,f);
 const expected=oracle(rs,f.end);closeTo(summarize(db.buckets('a'),db.outcomes('a')),summarize(expected.buckets,expected.paybacks));
 assert.equal(db.recent('a').length,16);assert.equal(db.turns()[0].calls,16);
 const revision=db.revision();assert.equal(importHistory(db,home,f,historyBasis).bytes,0);assert.equal(db.revision(),revision);
}));
test('restart resumes a partial final line without persisting its contents',()=>fixture(({home,f,db,file})=>{
 const content=lines([header,context,call(1)]);writeFileSync(f.file,content+JSON.stringify(call(2)).slice(0,50));drain(db,home,f);
 assert.equal(summarize(db.buckets()).calls,1);assert.equal(importHistory(db,home,f,historyBasis).bytes,0);
 appendFileSync(f.file,JSON.stringify(call(2)).slice(50)+'\n');drain(db,home,f);assert.equal(summarize(db.buckets()).calls,2);
 const state=db.statement('SELECT state FROM history_cursors').get().state;assert.doesNotMatch(state,/Secret title|payload|tool|message/);
 assert.ok(Buffer.byteLength(state)<65536);
}));
test('interrupted rewrite leaves published totals intact until replacement is complete',()=>fixture(({home,f,db})=>{
 writeFileSync(f.file,lines([header,context,call(1),call(2)]));drain(db,home,f);assert.equal(summarize(db.buckets()).calls,2);
 writeFileSync(f.file,lines([header,context,...Array.from({length:50},(_,i)=>call(i+1,120000))]));
 importHistory(db,home,f,historyBasis,{maxBytes:512});assert.equal(summarize(db.buckets()).calls,2);
 drain(db,home,f);assert.equal(summarize(db.buckets()).calls,50);assert.equal(db.statement("SELECT COUNT(*) AS n FROM history_sources WHERE id LIKE '~%'").get().n,0);
}));
test('failed batches roll back events, replay identities, totals and cursor',()=>fixture(({home,f,db})=>{
 writeFileSync(f.file,lines([header,context,call(1)]));drain(db,home,f);const before=db.statement('SELECT * FROM history_cursors').get();appendFileSync(f.file,lines([call(2)]));
 db.db.exec("CREATE TRIGGER fail_sample BEFORE INSERT ON history_samples BEGIN SELECT RAISE(ABORT,'injected full disk'); END;");
 assert.throws(()=>importHistory(db,home,f,historyBasis),/injected full disk/);assert.deepEqual(db.statement('SELECT * FROM history_cursors').get(),before);assert.equal(summarize(db.buckets()).calls,1);
 db.db.exec('DROP TRIGGER fail_sample');drain(db,home,f);assert.equal(summarize(db.buckets()).calls,2);
}));
test('retention preserves summaries, and missing source does not erase imported history',()=>fixture(({home,f,db})=>{
 writeFileSync(f.file,lines([header,context,call(1)]));drain(db,home,f);db.prune(now+91*864e5);assert.equal(db.recent().length,0);assert.equal(summarize(db.buckets()).calls,1);
 const revision=db.revision();drain(db,home,f);assert.equal(db.recent().length,0);assert.equal(db.revision(),revision);
 rmSync(f.file);assert.equal(importHistory(db,home,f,historyBasis).unavailable,true);assert.equal(summarize(db.buckets()).calls,1);assert.equal(db.savedTasks()[0].sourceAvailable,false);
}));
test('replayed cumulative records stay deduplicated across persisted checkpoints',()=>fixture(({home,f,db})=>{
 const first=call(1);first.payload.info.total_token_usage={input_tokens:100000,output_tokens:1000};writeFileSync(f.file,lines([header,context,first]));drain(db,home,f);
 const replay=structuredClone(first);replay.timestamp=stamp(2);appendFileSync(f.file,lines([replay,call(3)]));drain(db,home,f);assert.equal(summarize(db.buckets()).calls,2);
}));
test('retained compaction outcomes can reopen after their detail has expired',()=>fixture(({home,f,db})=>{
 const rs=[header,context,call(1),{type:'compacted',timestamp:stamp(2),payload:{}},call(3,40000)];writeFileSync(f.file,lines(rs));drain(db,home,f,{now:now+8*864e5});
 const initial=summarize(db.buckets(),db.outcomes());assert.equal(initial.evaluable,1);
 db.maintenance(now+100*864e5);assert.equal(db.statement('SELECT COUNT(*) AS n FROM history_paybacks').get().n,0);
 const late=call(4,40000);late.timestamp=new Date(now+100*864e5).toISOString();appendFileSync(f.file,lines([late]));drain(db,home,f,{now:now+101*864e5});
 const result=summarize(db.buckets(),db.outcomes());assert.equal(result.evaluable,0);assert.equal(result.pending,1);assert.equal(result.calls,3);
}));
test('a large nonnumeric record is skipped without retaining its text and the import progresses',()=>fixture(({home,f,db})=>{
 writeFileSync(f.file,lines([header,context,{type:'response_item',timestamp:stamp(1),payload:{type:'message',role:'assistant',content:'PRIVATE_SENTINEL'.repeat(200000)}},call(2)]));
 let r=importHistory(db,home,f,historyBasis,{maxBytes:4*1024*1024,maxMs:1});for(let i=0;!r.complete&&i<10;i++)r=importHistory(db,home,f,historyBasis,{maxBytes:4*1024*1024,maxMs:1});assert.equal(r.complete,true);assert.equal(summarize(db.buckets()).calls,1);
 const cursor=db.statement('SELECT state FROM history_cursors').get();assert.doesNotMatch(cursor.state,/PRIVATE_SENTINEL/);
}));
test('available numeric detail can be repriced after the original source disappears',async()=>{
 const home=mkdtempSync(path.join(tmpdir(),'tm-reprice-'));mkdirSync(path.join(home,'sessions'));const f={id:'a',file:path.join(home,'sessions','a.jsonl')};const store=new mod.exports.EfficiencyStore(home);
 try{
  writeFileSync(f.file,lines([header,context,call(1)]));await store.scan(home,[f],true,now);
  const expected=store.snapshot('a',now).thread.cost,db=store.storage,old=db.internBasis(JSON.stringify({...JSON.parse(historyBasis),table:'earlier rates'}));
  db.db.prepare('UPDATE history_sources SET basis=? WHERE id=?').run(old,'a');db.db.prepare('UPDATE history_day_basis SET basis=? WHERE source=?').run(old,'a');db.db.exec('UPDATE history_daily SET cost=cost*2,inputCost=inputCost*2');db.changed();rmSync(f.file);
  await store.scan(home,[],true,now+6000);assert.ok(Math.abs(store.snapshot('a',now+6000).thread.cost-expected)<1e-12);assert.equal(store.snapshot('a',now+6000).history.frozenThreads,0);
 }finally{store.close();rmSync(home,{recursive:true,force:true});}
});
test('inactivity closure is durable even when no new transcript records arrive',()=>fixture(({home,f,db})=>{
 writeFileSync(f.file,lines([header,context,call(1),{type:'compacted',timestamp:stamp(2),payload:{}},call(3,40000)]));drain(db,home,f);assert.equal(summarize(db.buckets(),db.outcomes()).pending,1);db.maintenance(now+8*864e5);assert.equal(summarize(db.buckets(),db.outcomes()).evaluable,1);assert.equal(JSON.parse(db.statement('SELECT state FROM history_cursors').get().state).builder.epoch.reason,'inactivity');
}));
test('complete recent numeric sequences reprice compaction charges without a transcript',async()=>{
 const home=mkdtempSync(path.join(tmpdir(),'tm-reprice-epoch-'));mkdirSync(path.join(home,'sessions'));const f={id:'a',file:path.join(home,'sessions','a.jsonl')};const store=new mod.exports.EfficiencyStore(home);
 try{
  const rs=[header,context,call(1),{type:'compacted',timestamp:stamp(2),payload:{}},...Array.from({length:20},(_,i)=>call(i+3,40000))];writeFileSync(f.file,lines(rs));f.end=stamp(50);await store.scan(home,[f],true,now);
  const expected=store.snapshot('a',now).thread,db=store.storage,old=db.internBasis(JSON.stringify({...JSON.parse(historyBasis),table:'earlier rates'}));
  db.db.prepare('UPDATE history_sources SET basis=? WHERE id=?').run(old,'a');db.db.prepare('UPDATE history_day_basis SET basis=? WHERE source=?').run(old,'a');db.db.exec('UPDATE history_daily SET cost=cost*2,overhead=overhead*2');db.changed();rmSync(f.file);
  await store.scan(home,[],true,now+6000);closeTo(store.snapshot('a',now+6000).thread,expected);assert.equal(store.snapshot('a',now+6000).history.frozenThreads,0);
 }finally{store.close();rmSync(home,{recursive:true,force:true});}
});

test('recorded compaction details survive bounded imports, restart and staged rebuild without transcript text',()=>fixture(({home,f,db,file})=>{
 const u={input_tokens:100100,cached_input_tokens:99000,cache_write_input_tokens:0,output_tokens:2100,reasoning_output_tokens:0};
 const comp={type:'compacted',timestamp:stamp(3),payload:{message:'PRIVATE SUMMARY',replacement_history:[{text:'PRIVATE HISTORY'}],compaction_response_id:'c1',latest_token_usage_record:{response_id:'c1',usage:u}}};
 writeFileSync(f.file,lines([header,context,call(1),comp]));drain(db,home,f);
 let c=db.compactionDetails('a')[0];assert.equal(c.source,'recorded');assert.equal(c.usage.output,2100);assert.equal(c.callPosition,.5);
 assert.equal(JSON.stringify(db.compactionDetails('a')).includes('PRIVATE'),false);
 const restarted=new HistoryDatabase(file);try{assert.deepEqual(restarted.compactionDetails('a'),db.compactionDetails('a'));}finally{restarted.close();}
 appendFileSync(f.file,lines([{type:'event_msg',timestamp:stamp(4),payload:{type:'token_count',info:{last_token_usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0,total_tokens:20000}}}},call(5,40000)]));drain(db,home,f);
 c=db.compactionDetails('a')[0];assert.equal(c.replacementTokens,20000);assert.equal(c.replacementWrite,.05);assert.equal(db.compactionDetails('a').length,1);
 const total=summarize(db.buckets('a')).overhead;assert.ok(Math.abs(total-c.totalCost)<1e-12);
 importHistory(db,home,f,historyBasis);assert.equal(summarize(db.buckets('a')).overhead,total);
 writeFileSync(f.file,lines([header,context,call(1),comp,call(6,40000)]));drain(db,home,f);assert.equal(db.compactionDetails('a').length,1);assert.equal(summarize(db.buckets('a')).calls,2);
 rmSync(f.file);assert.equal(db.compactionDetails('a')[0].usage.output,2100);
}));

test('schema v3 upgrades without losing totals or relabeling legacy compactions as recorded',()=>fixture(({db,file})=>{
 const b=new HistoryBuilder();b.call({timestamp:stamp(1),model:'gpt-6.1-sol',input:100000,cached:90000,cacheWrite:0,output:1000,reasoning:0,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true});b.compact(stamp(2));
 db.replace('legacy','old','legacy-basis',b.data);const overhead=summarize(db.buckets('legacy')).overhead;
 db.db.exec('DROP TABLE history_compactions; PRAGMA user_version=3');
 const upgraded=new HistoryDatabase(file);try{assert.equal(upgraded.statement('PRAGMA user_version').get().user_version,4);assert.equal(summarize(upgraded.buckets('legacy')).overhead,overhead);assert.deepEqual(upgraded.compactionDetails('legacy'),[]);}finally{upgraded.close();}
}));

test('recorded compaction usage reprices from numeric history after source loss',async()=>{
 const home=mkdtempSync(path.join(tmpdir(),'tm-recorded-reprice-'));mkdirSync(path.join(home,'sessions'));const f={id:'a',file:path.join(home,'sessions','a.jsonl')};const store=new mod.exports.EfficiencyStore(home);
 try{
  const c={type:'compacted',timestamp:stamp(3),payload:{compaction_response_id:'c',latest_token_usage_record:{response_id:'c',usage:{input_tokens:100000,cached_input_tokens:95000,cache_write_input_tokens:0,output_tokens:2000}}}};
  writeFileSync(f.file,lines([header,context,call(1),c,call(4,40000)]));await store.scan(home,[f],true,now);
  const expected=store.snapshot('a',now).thread.overhead,db=store.storage,old=db.internBasis(JSON.stringify({...JSON.parse(historyBasis),table:'old-table'}));
  db.statement('UPDATE history_sources SET basis=? WHERE id=?').run(old,'a');db.statement('UPDATE history_day_basis SET basis=? WHERE source=?').run(old,'a');db.changed();rmSync(f.file);
  await store.scan(home,[],true,now+6000);const snap=store.snapshot('a',now+6000);
  assert.ok(Math.abs(snap.thread.overhead-expected)<1e-12);assert.equal(snap.threadCompactions[0].source,'recorded');assert.equal(snap.threadCompactions[0].usage.output,2000);assert.equal(snap.history.frozenThreads,0);
 }finally{store.close();rmSync(home,{recursive:true,force:true});}
});
test('active payback survives incremental import, restart and closure without double counting',()=>fixture(({home,f,db,file})=>{
 writeFileSync(f.file,lines([header,context,call(1),{type:'compacted',timestamp:stamp(2),payload:{}}]));drain(db,home,f);
 assert.equal(summarize([],db.outcomes()).pending,1);
 let i=3;
 while(db.statement('SELECT breakEven FROM history_paybacks').get().breakEven==null&&i<100){
  appendFileSync(f.file,lines([call(i++,40000)]));drain(db,home,f);
 }
 assert.ok(i<100);assert.equal(db.statement('SELECT completed FROM history_paybacks').get().completed,null);
 const paid=summarize([],db.outcomes());assert.equal(paid.paybackRate,100);assert.equal(paid.pending,0);assert.equal(paid.evaluable,1);
 const reopened=new HistoryDatabase(file);
 try{
  assert.deepEqual(summarize([],reopened.outcomes()),paid);
  appendFileSync(f.file,lines([call(i++,40000)]));drain(reopened,home,f);
  const continued=summarize([],reopened.outcomes());assert.equal(continued.evaluable,1);assert.ok(continued.netSavings>paid.netSavings);
  appendFileSync(f.file,lines([{type:'compacted',timestamp:stamp(i++),payload:{}}]));drain(reopened,home,f);
  const closed=summarize([],reopened.outcomes());assert.equal(closed.profitable,1);assert.equal(closed.evaluable,1);assert.equal(closed.pending,1);
 }finally{reopened.close();}
}));
