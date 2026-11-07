import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const built=await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),contents:`export {TelemetryParser} from './server/src/parser';export {HistoryBuilder,summarize} from './server/src/history-builder';export {price,rates} from './server/src/metrics';export {recordedCompaction,compactionLabel} from './server/src/compaction';`},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {TelemetryParser,HistoryBuilder,summarize,price,rates,recordedCompaction,compactionLabel}=mod.exports;
const time=i=>new Date(Date.UTC(2026,10,7,0,0,i)).toISOString();
const usage={input_tokens:111991,cached_input_tokens:111744,cache_write_input_tokens:0,output_tokens:2664,reasoning_output_tokens:100};
const compact=(i=2,u=usage,extra={})=>({type:'compacted',timestamp:time(i),payload:{compaction_response_id:'compact-1',latest_token_usage_record:{response_id:'compact-1',usage:u},...extra}});
const call=(i=1,input=120000,cacheWrite=0)=>({type:'event_msg',timestamp:time(i),payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,cached_input_tokens:input-cacheWrite,cache_write_input_tokens:cacheWrite,output_tokens:1000,reasoning_output_tokens:0}}}});
function parser(model='gpt-6.1-sol') {const p=new TelemetryParser();p.consume({type:'turn_context',payload:{model}});p.consume(call());return p;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('verified request uses recorded input/cache/output, reasoning is not charged twice',()=>{
 const p=parser();p.consume(compact());const c=p.compactions[0];
 assert.equal(c.source,'recorded');assert.equal(c.usage.input,111991);assert.equal(c.usage.output,2664);
 close(c.requestCost,(247*2+111744*.1+2664*10)/1e6);close(c.totalCost,c.requestCost+.1);
 assert.equal(compactionLabel(c),'Partly estimated');assert.equal(p.callCount,1);assert.equal(p.samples.length,1);
 close(p.snapshot({id:'a',title:'a'}).compactionCost,c.totalCost);
 p.consume(compact());p.consume(compact(3));assert.equal(p.compactions.length,1);
});
test('missing IDs, stale usage and malformed categories use clearly marked fallback estimates',()=>{
 for(const r of [compact(2,usage,{compaction_response_id:null}),compact(2,usage,{latest_token_usage_record:{response_id:'previous',usage}}),compact(2,{...usage,cached_input_tokens:999999}),compact(2,{...usage,output_tokens:-1}),compact(2,{...usage,cache_write_input_tokens:undefined})]){
  const p=parser();p.consume(r);const c=p.compactions[0];assert.equal(c.source,'estimated');assert.ok(c.reason);close(c.requestCost,.012+.036);assert.equal(compactionLabel(c),'Estimated');
 }
});
test('zero usage is recorded; unknown pricing keeps tokens and unavailable cost',()=>{
 const p=parser('unknown');p.consume(compact());assert.equal(p.compactions[0].source,'recorded');assert.equal(p.compactions[0].totalCost,undefined);assert.equal(p.compactions[0].usage.output,2664);
 const zero=recordedCompaction(compact(2,Object.fromEntries(Object.keys(usage).map(k=>[k,0]))).payload,time(2),{});assert.equal(zero.usage.output,0);assert.equal(zero.usage.input,0);
});
test('full charge, retained-context adjustment and first-call credit stay consistent through checkpoints',()=>{
 const p=parser();p.consume(compact());const c=p.compactions[0],b=new HistoryBuilder();b.call(p.samples[0]);b.compact(time(2),c.usage,.5);b.retainedContext(20000);
 const saved=JSON.parse(JSON.stringify(b.checkpoint())),restart=new HistoryBuilder();restart.restore(saved);
 const next={...p.samples[0],timestamp:time(3),input:30000,cached:10000,cacheWrite:20000};
 b.call(next);restart.call(next);close(b.data.compactions[0].totalCost,c.requestCost);close(restart.data.compactions[0].totalCost,c.requestCost);
 close(summarize(b.data.buckets).overhead,c.requestCost);close(restart.data.compactions[0].writeCredit,.05);
 b.call({...next,timestamp:time(4)});close(b.data.compactions[0].writeCredit,.05);
 assert.equal(summarize(b.data.buckets).calls,3);
});
test('recorded request pricing respects full input threshold, tier and region',()=>{
 const u={...usage,input_tokens:300000,cached_input_tokens:290000};
 const c=recordedCompaction(compact(2,u).payload,time(2),{model:'gpt-6.1-sol',serviceTier:'standard',regionalProcessing:true}).usage;
 const r=rates(c.model,c.serviceTier,c.input,c.regionalProcessing);close(price(c).total,(10000*r.input+290000*r.cached+2664*r.output)/1e6);
});
