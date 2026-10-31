import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const result=await build({stdin:{resolveDir:new URL('..',import.meta.url).pathname,contents:`export {compareCohorts} from './server/src/comparisons';export {callBucket,HistoryBuilder} from './server/src/efficiency';`},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {compareCohorts,callBucket,HistoryBuilder}=mod.exports;
const call=(extra={})=>({timestamp:'2026-10-01T00:00:00Z',input:100000,cached:90000,cacheWrite:0,output:1000,reasoning:500,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true,model:'gpt-6.1-sol',effort:'high',...extra});
const calls=(n,extra={})=>Array.from({length:n},()=>callBucket(call(extra)));
test('weighted cohorts compare like models without changing overall spending',()=>{
 const baseline=[...calls(20),...calls(80,{model:'gpt-6-astra'})],current=[...calls(80),...calls(20,{model:'gpt-6-astra'})];
 const r=compareCohorts(current,baseline,true);assert.ok(Math.abs(r.cost.delta)<1e-10);assert.equal(r.cost.provisional,false);assert.equal(r.cost.coverage,1);
 assert.ok(Math.abs(r.context.delta)<1e-10);assert.equal(r.cache.current,90);
});
test('effort, pricing band, tier and missing metadata prevent misleading assessments',()=>{
 for(const extra of [{effort:undefined},{effort:'low'},{model:'unknown'},{input:300000,cached:290000},{serviceTier:'priority'},{regionalProcessing:true}]){
  const r=compareCohorts(calls(20,extra),calls(100),true);assert.equal(r.cost.provisional,true);assert.equal(r.cost.coverage,0);
 }
 assert.equal(compareCohorts(calls(20,{serviceTier:'auto'}),calls(100),true).cost.provisional,false);
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
