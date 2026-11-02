import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateCompactionValue as estimate,rollingContextGrowth as growth,rollingTypicalOutput as output,rates,compactionCategory} from '../server/dist/metrics.mjs';
import {TelemetryParser} from '../server/dist/parser.mjs';
const base={currentInput:168000,model:'gpt-6.1-sol',growthPerCall:2000,typicalOutput:3000};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const samples=(inputs,outputs=inputs.map(()=>3000))=>inputs.map((input,i)=>({timestamp:new Date(Date.UTC(2026,9,20,0,0,i)).toISOString(),input,output:outputs[i],outputRecorded:true,model:base.model}));
test('growth uses personal history until 20 intervals, then the unclamped latest-20 mean',()=>{
 const personal={observed:1750,sampleCount:500};
 const zero=samples(Array(21).fill(10000));
 assert.equal(growth(zero.slice(0,20),personal).effective,1750);
 assert.equal(growth(zero.slice(0,20),personal).source,'user');
 assert.equal(growth(zero,personal).effective,0);
 assert.equal(growth(zero).source,'thread');
 assert.equal(growth(zero).minimumApplied,false);
 assert.equal(growth(zero.slice(0,20)).effective,2000);
 assert.equal(growth(zero.slice(0,20)).fallback,true);
 assert.equal(growth(zero.slice(0,20),{observed:0,sampleCount:20}).effective,0);
 for(const invalid of [{observed:900,sampleCount:19},{observed:NaN,sampleCount:30},{observed:-1,sampleCount:30}])assert.equal(growth(zero.slice(0,20),invalid).source,'default');
 const large=samples(Array.from({length:21},(_,i)=>10000+i*30000));
 assert.equal(growth(large).effective,30000);
 const window=samples(Array.from({length:24},(_,i)=>i===0?0:100000+i*3000));
 assert.equal(growth(window).observed,3000);assert.equal(growth(window).sampleCount,20);
 assert.equal(growth(window).effective,3000);
});
test('growth resets across negatives, model switches, compaction and invalid inputs; duplicates do not add intervals',()=>{
 const s=samples([10000,20000,30000,40000]);
 assert.equal(growth([...s,s[3]]).sampleCount,3);
 assert.equal(growth([...s,...samples([1000,5000])]).sampleCount,1);
 assert.equal(growth(s.map((v,i)=>({...v,segment:i===3?1:0}))).sampleCount,0);
 assert.equal(growth(s.map((v,i)=>({...v,model:i===3?'gpt-6-sol':v.model}))).sampleCount,0);
 assert.equal(growth(s.map((v,i)=>({...v,input:i===2?NaN:v.input}))).sampleCount,0);
});
test('output median preserves actual zeros, includes billed reasoning, ignores missing records and outliers',()=>{
 const s=samples([1,2,3,4],[0,2000,4000,1000000]);
 assert.equal(output(s).observed,3000);assert.equal(output(s.slice(0,3)).observed,2000);
 assert.equal(output(s.map(v=>({...v,output:0}))).effective,1000);
 assert.equal(output(s.map(v=>({...v,output:0}))).minimumApplied,true);
 assert.equal(output(s.map(v=>({...v,outputRecorded:false}))).effective,3000);
 assert.equal(output(s.slice(0,2)).fallback,true);
 assert.equal(output(samples(Array.from({length:24},(_,i)=>i),[0,0,0,0,...Array(20).fill(6000)])).observed,6000);
 const mixed=[...s,...samples([5,6,7],[8000,9000,10000]).map(v=>({...v,model:'other'}))];
 assert.equal(output(mixed,'other').observed,9000);assert.equal(output(mixed,'other').activeModelOnly,true);
});
test('independent short-context dollar fixture includes one compaction read and one replacement write',()=>{
 const r=estimate(base);
 // A: 20 reads, 168K through 206K => 3.74M * .10/M, plus .6 output.
 // B before overhead: .0168 compaction read + 19 reads (42K..78K) * .10/M + .6 output.
 near(r.projectedBaselineCostUsd,.974);near(r.projectedCompactedCostBeforeOverheadUsd,.7308);
 near(r.compactionOverheadUsd,.136);near(r.grossSavingsUsd,.2432);near(r.netSavingsUsd,.1072);
 near(r.avoidableCostUsd,.3572);assert.equal(r.score,30);assert.equal(r.breakEvenCalls,12);
});
test('strict threshold and independently calculated crossing fixture',()=>{
 assert.deepEqual(rates(base.model,'standard',272000),{input:2,cached:.1,write:2.5,output:10});
 assert.deepEqual(rates(base.model,'standard',272001),{input:4,cached:.2,write:5,output:15});
 const r=estimate({...base,currentInput:260000});
 // 7 short reads (260..272K) and 13 long reads (274..298K).
 near(r.projectedBaselineCostUsd,.1862+.7436+.795);
 near(r.projectedCompactedCostBeforeOverheadUsd,.026+.114+.6);
 near(r.compactionOverheadUsd,.136);near(r.avoidableCostUsd,.9038+.195);
 near(r.netSavingsUsd,.8488);assert.equal(r.score,77);assert.equal(r.breakEvenCalls,8);
 assert.ok(r.score>estimate({...base,currentInput:260000,growthPerCall:0}).score);
 assert.ok(estimate({...base,currentInput:271000}).score>estimate({...base,currentInput:230000}).score);
 near(estimate({...base,currentInput:272001}).compactionOverheadUsd,.154);
});
test('valid unprofitable cases, labels, supported tiers and unknown pricing',()=>{
 for(const currentInput of [0,40000,41000]){const r=estimate({...base,currentInput});assert.equal(r.score,0);assert.equal(r.breakEvenCalls,null);assert.ok(r.netSavingsUsd<0);}
 for(const model of ['unknown','gpt-5.4'])assert.equal(estimate({...base,model}).status,'unavailable');
 assert.equal(estimate({...base,serviceTier:'unknown'}).status,'unavailable');
 for(const serviceTier of ['priority','fast','flex','batch','ultrafast']) {
  const r=estimate({...base,serviceTier});assert.equal(r.score,30);assert.equal(r.breakEvenCalls,12);
 }
 near(estimate({...base,regionalProcessing:true}).netSavingsUsd,.1072*1.1);
 for(const [n,label] of [[0,'No projected economic benefit'],[1,'Low'],[21,'Moderate'],[41,'High'],[61,'Very high'],[81,'Exceptional']])assert.equal(compactionCategory(n),label);
});
test('capacity stops simulation and numerical failures stay unavailable',()=>{
 const r=estimate({...base,contextLimit:180000});assert.equal(r.status,'limited');assert.equal(r.score,null);assert.equal(r.completedCalls,7);assert.match(r.limitation,/call 8/);
 assert.equal(estimate({...base,contextLimit:206000}).status,'available');
 for(const key of ['currentInput','growthPerCall','typicalOutput','contextLimit'])for(const value of [-1,NaN,Infinity])assert.equal(estimate({...base,[key]:value}).status,'unavailable');
 assert.equal(estimate({...base,currentInput:undefined}).status,'unavailable');
 assert.equal(estimate({...base,growthPerCall:Number.MAX_VALUE}).status,'unavailable');
 for(let currentInput=0;currentInput<1000000;currentInput+=7919){const r=estimate({...base,currentInput});assert.ok(Number.isInteger(r.score)&&r.score>=0&&r.score<=100);}
});
const call=(i,input,extra={})=>({type:'event_msg',timestamp:new Date(Date.UTC(2026,9,20,0,0,i)).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,cached_input_tokens:0,output_tokens:6000,reasoning_output_tokens:5000,...extra}}}});
const snapshot=p=>p.snapshot({id:'a',title:'A'});
test('parser forecasts unique per-thread calls including reasoning; cache age does not change CV',()=>{
 const p=new TelemetryParser();p.consume({type:'turn_context',payload:{model:base.model,service_tier:'priority',regional_processing:true}});
 for(let i=0;i<4;i++){p.consume(call(i,100000+i*4000));p.consume(call(i,100000+i*4000));}
 const r=snapshot(p).compactionValue;assert.equal(r.observedGrowthPerCall,4000);assert.equal(r.typicalOutput,6000);assert.equal(r.assumptions.growth.sampleCount,3);assert.equal(r.serviceTier,'priority');assert.equal(r.regionalProcessing,true);
 assert.deepEqual(p.snapshot({}, {},{},true,0).compactionValue,p.snapshot({}, {},{},true,Date.now()+1e9).compactionValue);
 assert.equal(snapshot(new TelemetryParser()).compactionValue.status,'unavailable');
});
test('parser resets growth after compaction and model changes, suppresses stale forecasts',()=>{
 const p=new TelemetryParser();p.consume({type:'turn_context',payload:{model:base.model}});
 for(let i=0;i<4;i++)p.consume(call(i,100000+i*10000));
 const pre=p.snapshot({}, {hook_event_name:'PreCompact',updated_at:'2026-10-20T00:00:04Z'});assert.equal(pre.compactionValue.status,'unavailable');
 p.consume({type:'compacted',timestamp:'2026-10-20T00:00:05Z',payload:{}});assert.equal(snapshot(p).compactionValue.status,'unavailable');
 p.consume(call(6,40000));assert.equal(snapshot(p).compactionValue.assumptions.growth.sampleCount,0);
 for(let i=7;i<10;i++)p.consume(call(i,40000+(i-6)*3000));
 assert.equal(snapshot(p).compactionValue.growthPerCall,2000);
 assert.equal(p.snapshot({}, {},{},true,Date.now(),{observed:1700,sampleCount:100}).compactionValue.growthPerCall,1700);
 for(let i=10;i<27;i++)p.consume(call(i,40000+(i-6)*3000));
 assert.equal(snapshot(p).compactionValue.growthPerCall,3000);
 p.consume({type:'turn_context',payload:{model:'gpt-6-sol'}});p.consume(call(27,105000));assert.equal(snapshot(p).compactionValue.assumptions.growth.sampleCount,0);
});

test('invalid call telemetry cannot bridge growth; model changes cannot retain stale capacity',()=>{
 const p=new TelemetryParser();p.consume({type:'turn_context',payload:{model:base.model}});
 const first=call(0,100000);first.payload.info.model_context_window=180000;p.consume(first);
 p.consume(call(1,110000));p.consume(call(2,-100));p.consume(call(3,130000));
 assert.equal(snapshot(p).compactionValue.assumptions.growth.sampleCount,0);
 p.consume({type:'turn_context',payload:{model:'gpt-6-sol'}});p.consume(call(4,140000));
 assert.equal(snapshot(p).contextLimit,undefined);assert.equal(snapshot(p).compactionValue.assumptions.contextLimitKnown,false);
});

test('personal growth intervals span segments without bridging invalid calls, models or compaction',()=>{
 const p=new TelemetryParser();p.consume({type:'turn_context',payload:{model:base.model}});
 p.consume(call(0,10000));p.consume(call(1,10000));p.consume(call(1,10000));
 p.consume(call(2,-1));p.consume(call(3,40000));p.consume(call(4,45000));
 p.consume({type:'compacted',timestamp:'2026-10-20T00:00:05Z',payload:{}});
 p.consume(call(6,10000));p.consume(call(7,11000));
 p.consume({type:'turn_context',payload:{model:'other'}});p.consume(call(8,20000));p.consume(call(9,20010));
 assert.deepEqual(p.growthIntervals.map(x=>x.value),[0,5000,1000,10]);
 assert.equal(p.growthIntervals.at(-1).model,'other');
 for(let i=10;i<520;i++)p.consume(call(i,20010+(i-9)*10));
 assert.equal(p.growthIntervals.length,500);
});
