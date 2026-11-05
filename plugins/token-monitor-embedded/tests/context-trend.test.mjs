import test from 'node:test';
import assert from 'node:assert/strict';
import {TelemetryParser} from '../server/dist/parser.mjs';
import {inputCost} from '../server/dist/metrics.mjs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const call=(i,input=100000,extra={})=>({type:'event_msg',timestamp:new Date(Date.UTC(2026,10,4,0,0,i)).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,cached_input_tokens:60000,cache_write_input_tokens:10000,output_tokens:5000,...extra}}}});
const parser=()=>{const p=new TelemetryParser();p.consume({type:'turn_context',payload:{model:'gpt-6.1-sol'}});return p;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('running context cost includes evicted calls and survives compaction, with duplicate calls excluded',()=>{
 const p=parser();let cost=0;
 for(let i=0;i<125;i++){
  if(i===100)p.consume({type:'compacted',timestamp:new Date(Date.UTC(2026,10,4,0,0,i)-1).toISOString(),payload:{}});
  const r=call(i,100000+i*1000);p.consume(r);p.consume(r);
  const sample=p.samples.at(-1);cost+=inputCost(sample);
  near(sample.contextPerCall,cost/(i+1));assert.equal(sample.contextPricedCalls,i+1);
 }
 assert.equal(p.samples.length,120);assert.equal(p.callCount,125);
 near(p.samples[0].contextPerCall,Array.from({length:6},(_,i)=>.091+i*.002).reduce((a,b)=>a+b)/6);
 const replay=parser();for(let i=0;i<125;i++)replay.consume(call(i,100000+i*1000));
 near(replay.samples.at(-1).contextPerCall,p.samples.at(-1).contextPerCall);
});
test('missing input prices are excluded; valid input counts even without output accounting',()=>{
 const p=parser();p.consume(call(0,100000,{cache_write_input_tokens:undefined}));
 assert.equal(p.samples[0].contextPerCall,undefined);
 p.consume(call(1,100000,{output_tokens:undefined}));near(p.samples[1].contextPerCall,.091);
 assert.equal(p.samples[1].price.total,undefined);
 p.consume({type:'turn_context',payload:{model:'unknown'}});p.consume(call(2));
 near(p.samples[2].contextPerCall,.091);assert.equal(p.samples[2].contextPricedCalls,1);
 p.consume({type:'turn_context',payload:{model:'gpt-6.1-sol',service_tier:'priority'}});p.consume(call(3,300000));
 const last=p.samples.at(-1);near(last.contextPerCall,(.091+inputCost(last))/2);assert.equal(last.contextPricedCalls,2);
});
const bundle=await build({entryPoints:[fileURLToPath(new URL('../ui/src/view.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
function render(s,mode='Context / call'){
 const mock={...React,useState:init=>[typeof init==='function'?init():init==='Cost'?mode:init,()=>{}]};
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(name=>name==='react'?mock:require(name),mod,mod.exports);
 return renderToStaticMarkup(React.createElement(mod.exports.MonitorView,{s,expanded:true,scale:1}));
}
test('USD trend renders running-average points and accessible per-call values; existing modes remain available',()=>{
 const p=parser();p.consume(call(0));p.consume(call(1,200000));
 const s={...p.snapshot({id:'test',title:'Test'}),panelId:'test',status:'Monitoring'};
 const html=render(s);assert.match(html,/Running context USD \/ call/);assert.match(html,/Running context \/ call \$0\.191000 \(2 calls with priceable input\)/);
 assert.match(html,/including earlier calls outside this chart/);assert.match(html,/class="series input" d="M45,/);
 assert.match(html,/aria-pressed="true">Context \/ call/);
 for(const mode of ['Cost','Tokens','Context']){const h=render(s,mode);assert.doesNotMatch(h,/Running context USD \/ call/);assert.match(h,new RegExp(`aria-pressed="true">${mode}`));}
 const empty=render({...s,samples:[{...p.samples[0],contextPerCall:undefined,contextPricedCalls:undefined}]});assert.doesNotMatch(empty,/NaN|Infinity/);assert.match(empty,/>×</);
});
