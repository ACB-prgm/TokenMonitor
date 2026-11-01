import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const bundle=await build({entryPoints:[new URL('../ui/src/performance.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',write:false});const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {costAssessment,paybackAssessment,defaultThresholds:t,validThresholds,loadThresholds,saveThresholds,efficiencyInsights}=mod.exports;
const comparison=delta=>({delta,current:1,reference:1,currentCalls:100,baselineCalls:100,coverage:1,provisional:false});
const state=(extra={})=>({contextPercent:20,efficiency:{thread:{evaluable:0,paybackRate:null,netSavings:0},comparisons:{thread:{cost:comparison(0),context:comparison(0),cache:{...comparison(0),current:90,reference:90}}}},...extra});
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
test('validated versioned preferences round-trip, reset and tolerate blocked storage',()=>{
 let saved;const storage={setItem:(k,v)=>saved=v,getItem:()=>saved};assert.equal(saveThresholds({...t,elevated:15},storage),true);assert.equal(loadThresholds(storage).elevated,15);
 assert.equal(saveThresholds(t,storage),true);assert.deepEqual(loadThresholds(storage),t);
 for(const extra of [{efficient:0},{efficient:101},{significant:10},{paybackGood:50},{paybackLow:-1},{minimumEvents:1.5},{minimumEvents:0},{elevated:NaN}]){assert.equal(validThresholds({...t,...extra}),false);assert.equal(saveThresholds({...t,...extra},storage),false);}
 assert.deepEqual(loadThresholds({getItem:()=>'{bad'}),t);assert.deepEqual(loadThresholds({getItem:()=>JSON.stringify({version:9,thresholds:t})}),t);
 assert.deepEqual(loadThresholds({getItem(){throw Error('Denied');}}),t);assert.equal(saveThresholds(t,{setItem(){throw Error('Denied');}}),true);
});
test('insights prioritize supported evidence and return at most two findings',()=>{
 const s=state({contextPercent:95});s.efficiency.thread={evaluable:5,netSavings:-1};s.efficiency.comparisons.thread.context=comparison(40);
 assert.deepEqual(efficiencyInsights(s).map(i=>i.id),['capacity','compaction']);
 s.contextPercent=20;assert.deepEqual(efficiencyInsights(s).map(i=>i.id),['compaction','context']);
 s.efficiency.thread.evaluable=4;assert.equal(efficiencyInsights(s)[0].id,'context');
 s.efficiency.comparisons.thread.context.provisional=true;assert.equal(efficiencyInsights(s)[0].id,'gathering');
});
test('cache insight uses percentage points and provisional observations never invent a problem',()=>{
 const s=state();assert.equal(efficiencyInsights(s)[0].id,'healthy');s.efficiency.comparisons.thread.cache.current=70;
 assert.equal(efficiencyInsights(s)[0].id,'cache');s.efficiency.comparisons.thread.cache.current=70.01;assert.equal(efficiencyInsights(s)[0].id,'healthy');
 assert.equal(efficiencyInsights({})[0].id,'gathering');assert.equal(efficiencyInsights({contextPercent:90})[0].id,'capacity');
});

const forecastState=(epoch=4)=>state({available:true,compactionTurnPayback:{status:'available',turns:4,calls:6,epochCompleted:epoch,threadTurns:5,historyTurns:20,threadMean:4,historyMean:2,bufferedMean:1.5,source:'both',buffer:.75,netSavingsUsd:.1}});
test('compaction guidance appears at equality and above epoch threshold, never earlier',()=>{
 for(const [epoch,expected] of [[3,false],[4,true],[5,true]]){const list=efficiencyInsights(forecastState(epoch));assert.equal(list.some(i=>i.id==='compaction-forecast'),expected);}
 const item=efficiencyInsights(forecastState())[0];assert.match(item.title,/≈4 more turns/);assert.match(item.recommendation,/Continuing work that needs this chat’s context/);assert.match(item.recommendation,/Starting unrelated work/);assert.match(item.details.map(d=>d.value).join(' '),/heuristic, not a statistical confidence bound/);
 for(const extra of [{available:false},{disconnected:true},{compactionTurnPayback:{status:'unavailable',turns:4,epochCompleted:5}},{compactionTurnPayback:undefined}])assert.equal(efficiencyInsights({...forecastState(),...extra}).some(i=>i.id==='compaction-forecast'),false);
});
test('capacity and negative completed compaction economics precede turn guidance, which precedes context findings',()=>{
 const s=forecastState();s.contextPercent=95;s.efficiency.thread={evaluable:5,netSavings:-1};s.efficiency.comparisons.thread.context=comparison(30);
 assert.deepEqual(efficiencyInsights(s).map(i=>i.id),['capacity','compaction']);s.contextPercent=20;assert.deepEqual(efficiencyInsights(s).map(i=>i.id),['compaction','compaction-forecast']);s.efficiency.thread.netSavings=0;assert.deepEqual(efficiencyInsights(s).map(i=>i.id),['compaction-forecast','context']);
});
