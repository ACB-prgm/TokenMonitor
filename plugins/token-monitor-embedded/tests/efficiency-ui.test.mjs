import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const bundle=await build({entryPoints:[new URL('../ui/src/efficiency.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
function banner(data){
 let period='7';
 const mock={...React,useState:()=>[period,value=>{period=value;}]};
 const mod={exports:{}};
 new Function('require','module','exports',bundle.outputFiles[0].text)(name=>name==='react'?mock:require(name),mod,mod.exports);
 const tree=()=>mod.exports.EfficiencyBanner({data});
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
