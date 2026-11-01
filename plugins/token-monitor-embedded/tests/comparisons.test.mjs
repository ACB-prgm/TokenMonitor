import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const result=await build({stdin:{resolveDir:new URL('..',import.meta.url).pathname,contents:`export {compareCohorts} from './server/src/comparisons';export {TelemetryParser} from './server/src/parser';export {callBucket,HistoryBuilder} from './server/src/efficiency';`},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {compareCohorts,callBucket,HistoryBuilder}=mod.exports;
const call=(extra={})=>({timestamp:'2026-10-01T00:00:00Z',input:100000,cached:90000,cacheWrite:0,output:1000,reasoning:500,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true,model:'gpt-6.1-sol',effort:'high',...extra});
const calls=(n,extra={})=>Array.from({length:n},()=>callBucket(call(extra)));
test('weighted cohorts compare like models without changing overall spending',()=>{
 const baseline=[...calls(20),...calls(80,{model:'gpt-6-astra'})],current=[...calls(80),...calls(20,{model:'gpt-6-astra'})];
 const r=compareCohorts(current,baseline,true);assert.ok(Math.abs(r.cost.delta)<1e-10);assert.equal(r.cost.provisional,false);assert.equal(r.cost.coverage,1);
 assert.ok(Math.abs(r.context.delta)<1e-10);assert.equal(r.cache.current,90);
});
test('different or missing model and effort prevent comparable assessments',()=>{
 for(const extra of [{effort:undefined},{effort:'low'},{model:undefined},{model:'unknown'}]){
  const r=compareCohorts(calls(20,extra),calls(100),true);assert.equal(r.cost.provisional,true);assert.equal(r.cost.coverage,0);
 }
 });
test('input cost and cache cohorts pool efforts but still require a recorded model',()=>{
 for(const effort of [undefined,'low']){
  const r=compareCohorts(calls(20,{effort}),calls(20),true);
  assert.equal(r.cost.provisional,true);
  assert.equal(r.context.provisional,false);assert.equal(r.cache.provisional,false);
  assert.equal(r.context.cohorts[0].effort,undefined);
 }
 assert.equal(compareCohorts(calls(20,{model:undefined}),calls(20),true).context.provisional,true);
});
test('input and output references use their own cohort weights',()=>{
 const current=[...calls(80),...calls(20,{effort:'medium',input:200000,cached:100000})];
 const baseline=[...calls(20),...calls(80,{effort:'medium',input:200000,cached:100000})];
 const r=compareCohorts(current,baseline,true);
 assert.ok(Math.abs(r.cost.delta)<1e-10);
 const expected=baseline.reduce((n,b)=>n+b.inputCost,0)/100;
 assert.ok(Math.abs(r.context.reference-expected)<1e-10);
 assert.notEqual(r.context.delta,0);assert.equal(r.context.cohorts.length,1);
});
test('missing and sparse references identify the exact cohort and counts',()=>{
 const r=compareCohorts([...calls(128,{effort:'medium'}),...calls(33)],calls(100,{effort:'medium'}),true);
 assert.match(r.cost.reason,/No reference calls for gpt-6.1-sol \/ high/);
 assert.deepEqual(r.cost.cohorts.find(c=>c.effort==='high'),{model:'gpt-6.1-sol',effort:'high',currentCalls:33,referenceCalls:0});
 assert.equal(r.context.provisional,false);
 assert.match(compareCohorts(calls(20),calls(19),true).cost.reason,/20 current \/ 19 reference/);
 const partial=[...calls(20),...calls(1,{outputRecorded:false})];
 assert.equal(compareCohorts(calls(20),partial,true).cost.provisional,true);
 assert.equal(compareCohorts(calls(20),partial,true).context.provisional,false);
});
test('cohorts ignore tier, region and pricing band while retaining their cost effects',()=>{
 for(const extra of [{serviceTier:'auto'},{serviceTier:'priority'},{serviceTier:'fast'},{serviceTier:'batch'},{regionalProcessing:true},{input:300000,cached:290000}]){
  const current=calls(20,extra),baseline=calls(100);
  const r=compareCohorts(current,baseline,true);
  for(const metric of ['cost','context','cache']){assert.equal(r[metric].provisional,false);assert.equal(r[metric].coverage,1);assert.equal(r[metric].baselineCalls,100);}
  assert.ok(Math.abs(r.cost.current-current[0].cost)<1e-10);
  assert.ok(Math.abs(r.cost.reference-baseline[0].cost)<1e-10);
  if(extra.serviceTier!=='auto')assert.notEqual(r.cost.delta,0);
 }
 const missingBand=calls(20).map(({rateBand,...rest})=>rest);
 assert.equal(compareCohorts(missingBand,calls(100),true).cost.provisional,false);
});
test('sample, import, pricing and zero-reference gates are neutral',()=>{
 assert.equal(compareCohorts(calls(19),calls(100),true).cost.provisional,true);
 assert.equal(compareCohorts(calls(20),calls(19),true).cost.provisional,true);
 assert.equal(compareCohorts(calls(20),calls(100),false).cost.provisional,true);
 assert.equal(compareCohorts([],[],true).cost.delta,null);
 assert.equal(compareCohorts(calls(20),calls(100,{input:0,cached:0,output:0}),true).context.provisional,true);
 const r=compareCohorts([...calls(20),...calls(1,{outputRecorded:false})],calls(100),true);assert.equal(r.cost.provisional,true);assert.equal(r.context.provisional,false);
});
test('aggregation retains effort and original rate identity, and excludes unknown cache data',()=>{
 const h=new HistoryBuilder();for(let i=0;i<20;i++)h.call(call());h.call(call({effort:'low'}));h.call(call({cachedRecorded:false}));
 assert.equal(h.data.buckets.length,2);assert.equal(h.data.buckets[0].cacheInput,2000000);
 assert.equal(compareCohorts(h.data.buckets,calls(100),true).cache.provisional,true);
});

test('per-call effort comes from recorded context and is cleared when unavailable',()=>{
 const p=new mod.exports.TelemetryParser();const turn=payload=>p.consume({type:'turn_context',payload});
 const usage=i=>p.consume({type:'event_msg',timestamp:`2026-10-01T00:00:0${i}Z`,payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,cached_input_tokens:80,cache_write_input_tokens:0,output_tokens:10}}}});
 turn({model:'gpt-6.1-sol',effort:'high'});usage(1);turn({model:'gpt-6-astra'});usage(2);turn({model:'gpt-6-astra',reasoning_effort:'low'});usage(3);
 assert.deepEqual(p.samples.map(s=>s.effort),['high',undefined,'low']);
});
