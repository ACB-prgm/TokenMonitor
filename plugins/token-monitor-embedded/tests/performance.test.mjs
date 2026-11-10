import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../ui/src/performance.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false});const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {costAssessment,paybackAssessment,defaultThresholds:t,efficiencyInsights}=mod.exports;
const comparison=delta=>({delta,current:1,reference:1,currentCalls:100,referenceCalls:100,provisional:false});
const state=(extra={})=>({contextPercent:20,efficiency:{thread:{evaluable:0,paybackRate:null,netSavings:0}},...extra});
test('cost thresholds preserve exact inclusive and exclusive boundaries',()=>{
 for(const [delta,tone] of [[-10.001,'good'],[-10,'good'],[-9.999,'neutral'],[10,'neutral'],[10.001,'amber'],[30,'amber'],[30.001,'bad']])assert.equal(costAssessment(comparison(delta)).tone,tone);
 assert.equal(costAssessment({...comparison(90),provisional:true}).tone,'neutral');assert.equal(costAssessment().tone,'neutral');
 assert.equal(costAssessment(comparison(15),{...t,elevated:20}).tone,'neutral');
});
test('payback considers final net savings, zero events and sample counts',()=>{
 const s={evaluable:5,paybackRate:100,netSavings:0};assert.equal(paybackAssessment(s).tone,'neutral');
 assert.equal(paybackAssessment({...s,netSavings:-1}).tone,'bad');assert.equal(paybackAssessment({...s,netSavings:1}).tone,'good');
 assert.equal(paybackAssessment({...s,netSavings:-1,evaluable:4}).tone,'neutral');assert.equal(paybackAssessment({...s,paybackRate:null,evaluable:0}).tone,'neutral');
 for(const [rate,tone] of [[49.99,'bad'],[50,'amber'],[79.99,'amber'],[80,'good']])assert.equal(paybackAssessment({...s,paybackRate:rate,netSavings:1}).tone,tone);
});
test('only capacity pressure produces guidance without an eligible forecast',()=>{
 assert.deepEqual(efficiencyInsights({}),[]);
 const s=state();s.efficiency.thread={evaluable:10,netSavings:-100,costPerCall:100,contextPerCall:90};
 assert.deepEqual(efficiencyInsights(s),[]);
 for(const [percent,tone] of [[84.99,null],[85,'amber'],[94.99,'amber'],[95,'bad']]){
  const items=efficiencyInsights({...s,contextPercent:percent});
  assert.equal(items.length,tone?1:0);if(tone){assert.equal(items[0].id,'capacity');assert.equal(items[0].tone,tone);}
 }
});

const forecastState=(epoch=4)=>state({available:true,compactionTurnPayback:{status:'available',turns:4,calls:6,epochCompleted:epoch,threadTurns:5,historyTurns:20,threadMean:4,historyMean:2,bufferedMean:1.5,source:'thread',buffer:.75,netSavingsUsd:.1}});
test('compaction guidance appears at equality and above epoch threshold, never earlier',()=>{
 for(const [epoch,expected] of [[3,false],[4,true],[5,true]]){const list=efficiencyInsights(forecastState(epoch));assert.equal(list.some(i=>i.id==='compaction-forecast'),expected);}
 const item=efficiencyInsights(forecastState())[0];assert.match(item.title,/≈4 more turns/);assert.match(item.recommendation,/Continuing work that needs this chat’s context/);assert.match(item.recommendation,/Starting unrelated work/);assert.match(item.details.map(d=>d.value).join(' '),/heuristic, not a statistical confidence bound/);
 for(const extra of [{available:false},{disconnected:true},{compactionTurnPayback:{status:'unavailable',turns:4,epochCompleted:5}},{compactionTurnPayback:undefined}])assert.equal(efficiencyInsights({...forecastState(),...extra}).some(i=>i.id==='compaction-forecast'),false);
});
test('capacity precedes forecast and historical losses do not add an insight',()=>{
 const s=forecastState();s.contextPercent=95;s.efficiency.thread={evaluable:5,netSavings:-1};
 assert.deepEqual(efficiencyInsights(s).map(i=>i.id),['capacity','compaction-forecast']);
 s.contextPercent=20;assert.deepEqual(efficiencyInsights(s).map(i=>i.id),['compaction-forecast']);
});
