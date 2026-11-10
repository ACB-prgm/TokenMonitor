import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const result=await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),contents:`export {TelemetryParser} from './server/src/parser';export {callBucket,HistoryBuilder} from './server/src/efficiency';`},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {HistoryBuilder}=mod.exports;
const call=(extra={})=>({timestamp:'2026-10-01T00:00:00Z',input:100000,cached:90000,cacheWrite:0,output:1000,reasoning:500,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true,model:'gpt-6.1-sol',effort:'high',...extra});
test('aggregation retains effort and original rate identity, and excludes unknown cache data',()=>{
 const h=new HistoryBuilder();for(let i=0;i<20;i++)h.call(call());h.call(call({effort:'low'}));h.call(call({cachedRecorded:false}));
 assert.equal(h.data.buckets.length,2);assert.equal(h.data.buckets[0].cacheInput,2000000);
 assert.equal(h.data.buckets.reduce((n,b)=>n+b.calls,0),22);
 assert.equal(h.data.buckets.reduce((n,b)=>n+b.cacheInput,0),2100000);
});

test('per-call effort comes from recorded context and is cleared when unavailable',()=>{
 const p=new mod.exports.TelemetryParser();const turn=payload=>p.consume({type:'turn_context',payload});
 const usage=i=>p.consume({type:'event_msg',timestamp:`2026-10-01T00:00:0${i}Z`,payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,cached_input_tokens:80,cache_write_input_tokens:0,output_tokens:10}}}});
 turn({model:'gpt-6.1-sol',effort:'high'});usage(1);turn({model:'gpt-6-astra'});usage(2);turn({model:'gpt-6-astra',reasoning_effort:'low'});usage(3);
 assert.deepEqual(p.samples.map(s=>s.effort),['high',undefined,'low']);
});
