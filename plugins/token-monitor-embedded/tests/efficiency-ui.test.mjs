import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),contents:"export {EfficiencyBanner} from './ui/src/efficiency';export {summarize,callBucket} from './server/src/efficiency';"},bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
function banner(data){
 let period='7';
 const mock={...React,useState:()=>[period,value=>{period=value;}]};
 const mod={exports:{}};
 new Function('require','module','exports',bundle.outputFiles[0].text)(name=>name==='react'?mock:require(name),mod,mod.exports);
 const tree=()=>mod.exports.EfficiencyBanner({data:data?{comparisonReady:true,...data}:data});
 return {render:()=>renderToStaticMarkup(tree()),select:value=>tree().props.children[0].props.children[1].props.onChange({target:{value}})};
}
const summary=(calls,costPerCall,contextPerCall,profitable,evaluable)=>({calls,priced:calls,inputPriced:calls,cost:calls*costPerCall,inputCost:calls*contextPerCall,overhead:0,costPerCall,contextPerCall,paybackRate:profitable/evaluable*100,netSavings:profitable,pending:1,excluded:0,inactivity:0,profitable,evaluable});
test('changing comparison period updates Comp values, deltas and every expanded calculation',()=>{
 const seven=summary(40,.02,.01,1,2),thirty=summary(80,.04,.02,3,4),all=summary(120,.08,.04,1,4);
 const ui=banner({thread:summary(40,.08,.04,1,2),periods:{7:{summary:seven,previousSummary:thirty},30:{summary:thirty,previousSummary:all},all:{summary:all}},progress:{running:false,failed:0}});
 for(const [period,label,s,delta] of [['7','Last 7 days',seven,'300.0%'],['30','Last 30 days',thirty,'100.0%'],['all','All history',all,'0.0%']]){
  ui.select(period);const html=ui.render();
  const collapsed=html.match(/<summary[\s\S]*?<\/summary>/)[0];
  assert.match(collapsed,new RegExp(delta.replace('.','\\.')));
  assert.ok(collapsed.includes(`${s.profitable}/${s.evaluable}`));
  assert.ok(collapsed.includes(`>$${s.costPerCall.toFixed(4)}<`));
  assert.ok(collapsed.includes(`>$${s.contextPerCall.toFixed(4)}<`));
  assert.equal((html.match(new RegExp(`Comp \\(${label}\\):`,'g'))??[]).length,4);
  assert.ok(html.includes(`Comp (${label}): $${s.inputCost.toFixed(2)} / ${s.calls}`));
  assert.ok(html.includes(`Comp (${label}): $${s.cost.toFixed(2)} / ${s.calls}`));
  assert.ok(html.includes(`Comp (${label}): ${s.profitable} / ${s.evaluable}`));
  assert.ok(html.includes(`Pending compactions: Thread 1 · Comp (${label}) 1`));
  assert.ok(html.includes(`Final net savings: Thread $1.00 · Comp (${label}) $${s.netSavings.toFixed(2)}`));
  assert.ok(html.includes(`${s.calls} recorded calls`));
  assert.doesNotMatch(html,/All chats:|· All chats|This period includes all available history/);
  if(period==='all')assert.match(html,/Comp row has no arrow/);
 }
 ui.select('7');assert.match(ui.render(),/Comp \(Last 7 days\):/);
});
test('identical available history is explained only for populated matching periods',()=>{
 const s=summary(40,.02,.01,1,2),ui=banner({thread:s,periods:{7:{summary:s},30:{summary:s},all:{summary:s}}});
 for(const period of ['7','30']){ui.select(period);assert.match(ui.render(),/This period includes all available history, so Comp matches All history/);}
 ui.select('all');assert.doesNotMatch(ui.render(),/This period includes/);
 assert.doesNotMatch(banner(undefined).render(),/This period includes|NaN|undefined/);
});

test('KPIs color spending changes and payback while incomplete comparisons stay neutral',()=>{
 const reference=summary(40,1,1,8,10);
 for(const [ratio,tone] of [[.8,'good'],[1.05,'neutral'],[1.2,'amber'],[1.4,'bad']]){
  const thread=summary(40,ratio,ratio,8,10);
  const html=banner({thread,periods:{7:{summary:reference}}}).render();
  const row=html.match(/<span class="kpi-row-label">Thread<\/span>([\s\S]*?)<span class="kpi-row-label">Comp/)[1];
  assert.equal((row.match(new RegExp(`kpi-value primary tone-${tone}`, 'g'))??[]).length,tone==='good'?3:2);
  assert.equal((row.match(new RegExp(`kpi-badge tone-${tone}`, 'g'))??[]).length,2);
  assert.match(row,/kpi-value primary tone-good" title="Positive savings"/);
  assert.doesNotMatch(row,/sr-only/);
 }
 const html=banner({thread:summary(10,2,2,1,2),periods:{7:{summary:reference}}}).render();
 assert.match(html,/kpi-value primary tone-neutral" title="Provisional"/);
 assert.doesNotMatch(html,/kpi-badge tone-bad/);
 for(const [profitable,tone,label] of [[4,'bad','Not recovering costs'],[6,'amber','Mixed recovery'],[8,'good','Positive savings']]){
  const html=banner({thread:summary(40,1,1,profitable,10),periods:{7:{summary:reference}}}).render();
  assert.match(html,new RegExp(`kpi-value primary tone-${tone}" title="${label}"`));
 }
});

test('KPI comparison coverage gates remain neutral and unavailable references omit arrows',()=>{
 const reference=summary(40,1,1,8,10),thread=summary(40,2,2,8,10);
 const row=data=>banner({thread,periods:{7:{summary:reference}},...data}).render().match(/<span class="kpi-row-label">Thread<\/span>([\s\S]*?)<span class="kpi-row-label">Comp/)[1];
 for(const patch of [{comparisonReady:false},{comparisonReady:undefined},{progress:{running:true,failed:0}},{progress:{running:false,failed:1}},{thread:{...thread,calls:41}},{periods:{7:{summary:{...reference,calls:41}}}},{thread:summary(19,2,2,8,10)},{periods:{7:{summary:summary(19,1,1,8,10)}}}]){
  const html=row(patch);assert.match(html,/title="Provisional"/);assert.doesNotMatch(html,/kpi-badge tone-(?:good|amber|bad)/);
 }
 for(const ref of [undefined,summary(40,0,0,8,10),{...reference,costPerCall:null,contextPerCall:null}]){
  const html=row({periods:{7:{summary:ref}}});assert.doesNotMatch(html,/kpi-badge/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
 }
});

test('Comp arrows use previous aggregates and All history omits them',()=>{
 const ui=banner({thread:summary(40,2,2,8,10),periods:{7:{summary:summary(40,1,1,8,10),previousSummary:summary(40,2,2,8,10)},all:{summary:summary(80,1.5,1.5,8,10)}}});
 const comp=()=>ui.render().match(/<span class="kpi-row-label">Comp<\/span>([\s\S]*?)<\/summary>/)[1];
 assert.equal((comp().match(/↓ 50.0%/g)??[]).length,2);
 ui.select('all');assert.doesNotMatch(comp(),/kpi-badge/);
});

test('mixed models and efforts use aggregate pricing including compaction charges',()=>{
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);
 const {callBucket,summarize}=mod.exports;
 const call={timestamp:'2026-11-09',model:'gpt-6.1-sol',effort:'high',input:100000,cached:90000,cacheWrite:0,output:1000,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true};
 const buckets=Array.from({length:40},(_,i)=>callBucket({...call,model:i%2?'gpt-6-astra':call.model,effort:i%2?undefined:'high'}));
 const reference=summarize(buckets),thread=summarize([...buckets,{...buckets[0],calls:0,priced:0,inputPriced:0,inputCost:0,cost:0,overhead:reference.cost}]);
 const html=banner({thread,periods:{7:{summary:reference}}}).render();
 const row=html.match(/<span class="kpi-row-label">Thread<\/span>([\s\S]*?)<span class="kpi-row-label">Comp/)[1];
 assert.match(row,/↑ 100.0%/);assert.match(row,/→ 0.0%/);assert.match(row,/tone-bad/);
 assert.ok(html.includes(`Exact numerator: ${thread.cost+thread.overhead} USD`));
});
