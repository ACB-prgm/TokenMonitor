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
 assert.equal(p.samples[1].price.total,undefined);assert.equal(p.samples[1].costPerCall,undefined);
 p.consume({type:'turn_context',payload:{model:'unknown'}});p.consume(call(2));
 near(p.samples[2].contextPerCall,.091);assert.equal(p.samples[2].contextPricedCalls,1);
 p.consume({type:'turn_context',payload:{model:'gpt-6.1-sol',service_tier:'priority'}});p.consume(call(3,300000));
 const last=p.samples.at(-1);near(last.contextPerCall,(.091+inputCost(last))/2);assert.equal(last.contextPricedCalls,2);
});
const bundle=await build({entryPoints:[fileURLToPath(new URL('../ui/src/view.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
function render(s,mode='Cost',selection){
 const mock={...React,useState:init=>[typeof init==='function'?init():init==='Cost'?mode:selection&&init&&typeof init==='object'&&'hovered' in init?selection:init,()=>{}]};
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(name=>name==='react'?mock:require(name),mod,mod.exports);
 return renderToStaticMarkup(React.createElement(mod.exports.MonitorView,{s,expanded:true,scale:1}));
}
test('KPIs tab has two smooth USD trends without dots or cost bars',()=>{
 const p=parser();p.consume(call(0));p.consume(call(1,200000));p.consume(call(2,150000));
 const s={...p.snapshot({id:'test',title:'Test'}),panelId:'test',status:'Monitoring'};
 const html=render(s,'KPIs'),chart=html.match(/<section class="history"[\s\S]*?<\/svg>/)[0];
 assert.match(chart,/USD \/ call/);assert.match(chart,/Running context \/ call \$0\.191000 \(2 calls with priceable input\)/);
 assert.match(chart,/Running cost \/ call \$0\.241000 \(2 priced calls\)/);
 assert.equal((chart.match(/class="series (?:input|fresh) kpi-trend"/g)??[]).length,2);
 assert.match(chart,/aria-label="Running Context \/ call KPI in USD" d="M45,[^"]*C/);
 assert.match(chart,/aria-label="Running Cost \/ call KPI in USD" d="M45,[^"]*C/);
 assert.doesNotMatch(chart,/<circle|fill="var\(--ordinary\)"/);
 assert.match(html,/including earlier calls outside this chart/);
 assert.match(html,/aria-pressed="true">KPIs/);
 for(const mode of ['Cost','Tokens','Context']){const h=render(s,mode);assert.doesNotMatch(h,/kpi-trend/);assert.match(h,new RegExp(`aria-pressed="true">${mode}`));}
 assert.match(render(s),/<rect[^>]*fill="var\(--ordinary\)"/);
 const missing=render({...s,samples:s.samples.map(c=>({...c,contextPerCall:undefined,costPerCall:undefined}))},'KPIs');assert.doesNotMatch(missing,/NaN|Infinity/);
 const high=render({...s,samples:s.samples.map(c=>({...c,costPerCall:10}))},'KPIs');
 assert.match(high,/>\$10\.00<\/text>/);
});
test('cost trend matches the KPI accounting through compaction and retained context adjustments',async()=>{
 const built=await build({entryPoints:[fileURLToPath(new URL('../server/src/history-builder.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false});
 const mod={exports:{}};new Function('module','exports',built.outputFiles[0].text)(mod,mod.exports);
 const {HistoryBuilder,summarize}=mod.exports;
 const history=new HistoryBuilder();
 const p=new TelemetryParser(e=>{if(e.kind==='call')history.call(e.sample,e.contextLimit);if(e.kind==='compaction')history.compact(e.timestamp);if(e.kind==='retained')history.retainedContext(e.tokens);});
 p.consume({type:'turn_context',payload:{model:'gpt-6.1-sol'}});
 for(let i=0;i<125;i++){
  if(i===100){
   p.consume({type:'compacted',timestamp:new Date(Date.UTC(2026,10,4,0,0,i)-2).toISOString(),payload:{}});
   p.consume(call(i-.001,0,{cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:0,total_tokens:30000}));
  }
  const r=call(i,100000+i*1000);p.consume(r);p.consume(r);
  const expected=summarize(history.data.buckets),actual=p.samples.at(-1);
  near(actual.costPerCall,expected.costPerCall);assert.equal(actual.costPricedCalls,expected.priced);
 }
 const replay=parser();for(let i=0;i<3;i++)replay.consume(call(i));
 near(replay.samples.at(-1).costPerCall,.141);
});
const lineBundle=await build({entryPoints:[fileURLToPath(new URL('../ui/src/analytics.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false});
const lineModule={exports:{}};new Function('module','exports',lineBundle.outputFiles[0].text)(lineModule,lineModule.exports);
test('smooth trend stays within adjacent values and breaks at unavailable calls',()=>{
 const {smoothLine}=lineModule.exports;
 assert.equal(smoothLine([]),'');
 assert.equal(smoothLine([{x:0,y:20},{x:10,y:5},{x:20,y:30}]),'M0,20 C5,20 5,5 10,5 C15,5 15,30 20,30');
 assert.equal(smoothLine([{x:0,y:20},undefined,{x:20,y:30}]),'M0,20  M20,30');
});

test('compactions occupy separate gray slots in Cost and Tokens, with inspectable provenance',()=>{
 const p=parser();p.consume(call(0));
 const recorded={type:'compacted',timestamp:new Date(Date.UTC(2026,10,4,0,0,1)).toISOString(),payload:{compaction_response_id:'c1',latest_token_usage_record:{response_id:'c1',usage:{input_tokens:100000,cached_input_tokens:90000,cache_write_input_tokens:0,output_tokens:2000,reasoning_output_tokens:100}}}};
 p.consume(recorded);p.consume({...recorded,timestamp:new Date(Date.UTC(2026,10,4,0,0,2)).toISOString(),payload:{}});
 const s={...p.snapshot({id:'test',title:'Test'}),panelId:'test',status:'Monitoring'};
 for(const mode of ['Cost','Tokens']){
  const html=render(s,mode),chart=html.match(/<section class="history"[\s\S]*?<\/svg>/)[0];
  assert.equal((chart.match(/class="compaction-bar"/g)??[]).length,2);assert.doesNotMatch(chart,/class="compaction-line"/);
  const xs=[...chart.matchAll(/class="compaction-bar" x="([^"]+)"/g)].map(m=>m[1]);assert.notEqual(xs[0],xs[1]);
  assert.match(html,/Partly estimated/);assert.match(html,/Estimated/);assert.match(html,/1 calls; 2 compactions/);assert.doesNotMatch(html,/NaN|Infinity/);
  const selected=render(s,mode,{hovered:`compaction:${recorded.timestamp}`,focused:null,pinned:null,closing:false});
  assert.match(selected,/Compaction details/);assert.match(selected,/Recorded usage/);assert.match(selected,/Replacement write \(estimated\)/);assert.match(selected,/API equivalent · total/);
 }
 for(const mode of ['Context','KPIs']){const html=render(s,mode);assert.match(html,/class="compaction-line"/);assert.doesNotMatch(html,/class="compaction-bar"/);}
 const unknown=render({...s,compactions:s.compactions.map(c=>({...c,totalCost:undefined}))});assert.match(unknown,/compaction-unpriced/);assert.doesNotMatch(unknown,/NaN|Infinity/);
 const only=render({...s,samples:[],callCount:0,compactions:[s.compactions[0]]});assert.match(only,/compaction-bar/);
});
