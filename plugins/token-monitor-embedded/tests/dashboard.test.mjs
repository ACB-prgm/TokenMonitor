import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const result=await build({stdin:{resolveDir:root,contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MonitorView} from './ui/src/view'; export {percent,money,migrateLayout,composition,threadAllowanceEstimate} from './ui/src/analytics'; export const render=(s,expanded=false,interactive=false,updates)=>renderToStaticMarkup(React.createElement(MonitorView,{s,expanded,scale:1,onAction:interactive?()=>{}:undefined,updates,onUpdate:interactive?()=>{}:undefined}));`},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(path.join(root,'package.json')),mod,mod.exports);
const {percent,money,migrateLayout,composition,threadAllowanceEstimate,render}=mod.exports;
test('small nonzero and near-full percentages never round to false zero or 100',()=>{
 assert.equal(percent(.0001),'<0.1%');assert.equal(percent(99.999),'>99.9%');assert.equal(percent(0),'0%');assert.equal(percent(100),'100%');assert.equal(money(undefined),'—');assert.equal(money(.000001),'<$0.0001');
});
test('new base scale migrates existing visual preferences exactly',()=>{
 assert.equal(migrateLayout({scale:.85}).scale,1);assert.equal(migrateLayout({scale:1}).scale,1/.85);assert.equal(migrateLayout({scale:1.15}).scale,1.15/.85);assert.equal(migrateLayout({}).scale,1);assert.equal(migrateLayout({scale:1,layoutVersion:2}).scale,1);assert.equal(migrateLayout({scale:900}).scale,1);
});
test('mutually exclusive composition includes reasoning inside output',()=>{
 const values=composition(100,60,10,20,8);assert.deepEqual(values,[30,60,10,8,12,0]);assert.equal(values.reduce((a,b)=>a+b,0),120);assert.deepEqual(composition(100,60,10,20),[30,60,10,0,0,20]);
});
test('capacity, allowances, spending and cost chart appear in compact mode without duplicate summaries',()=>{
 const s={panelId:'p',status:'Monitoring',callCount:1,task:{id:'a',title:'Task'},selectedId:'a',contextPercent:50,input:100,contextLimit:200,fiveHour:{used:6},weekly:{used:49},samples:[],usage:{input:100,cached:60,cacheWrite:10,output:20,reasoning:8,cacheComplete:true,outputComplete:true,reasoningComplete:true,pricedCalls:1,unpricedCalls:0,cost:.12,cacheSavings:.05,costCategories:[.04,.01,.01,.02,.04,0],issues:[],models:['gpt-6.1-sol']}};
 const html=render(s);
 assert.ok(html.indexOf('header-controls')<html.indexOf('task-controls'));assert.ok(html.indexOf('Context window')<html.indexOf('Thread usage'));assert.ok(html.indexOf('Thread usage')<html.indexOf('Recent calls'));
 assert.equal((html.match(/Context window<\/h2>/g)??[]).length,1);assert.match(html,/5 Hour/);assert.match(html,/94%/);assert.match(html,/51%/);assert.match(html,/API-equivalent/);assert.match(html,/Token composition/);assert.match(html,/Cost composition/);assert.match(html,/aria-pressed="true">Cost/);assert.match(html,/Transcript reads are incremental/);assert.doesNotMatch(html,/Lock|locked|Unlock/);assert.doesNotMatch(html,/<details[^>]* open/g);
 const expanded=render(s,true);assert.match(expanded,/<details[^>]* open/g);assert.doesNotMatch(expanded,/>Compact<\/button>|>Expand<\/button>/);
});
test('missing pricing and cache data stay visibly unavailable',()=>{
 const html=render({panelId:'p',status:'Waiting',callCount:1,samples:[],usage:{input:100,cached:0,cacheWrite:0,output:0,reasoning:0,cacheComplete:false,outputComplete:false,reasoningComplete:false,pricedCalls:0,unpricedCalls:1,cost:0,cacheSavings:0,costCategories:[0,0,0,0,0,0],issues:['Unknown model'],models:[],cumulativeMismatch:true}});
 assert.match(html,/partial/);assert.match(html,/Unknown model/);assert.match(html,/Breakdown unavailable/);assert.match(html,/missing calls cannot be priced/);assert.doesNotMatch(html,/>\$0.00<\/strong>/);
});

const latestFixture={panelId:'p',status:'Monitoring',input:40000,awaitingPostCompactionCall:true,callCount:1,cacheTemperature:'WARM',compactionValue:{status:'available',score:34,category:'Moderate',currentInput:100000,estimatedInput:40000,breakEvenCalls:6,horizonCalls:20,growthPerCall:2000,typicalOutput:3000,compactionOutput:3600,compactionOverheadUsd:.136,netSavingsUsd:.1,model:'gpt-6.1-sol',assumptions:{pricingAvailable:true,growth:{fallback:true,sampleCount:1},output:{fallback:true,sampleCount:1}}},samples:[{timestamp:'2026-10-19T12:00:00Z',model:'gpt-6.1-sol',input:100000,cached:90000,cacheWrite:0,output:1200,reasoning:800}]};
test('single latest-call bar sits between thread usage and the graph and expands call and compaction details together',()=>{
 const html=render(latestFixture);
 const bar=html.match(/<details class="latest-call"[^>]*>[\s\S]*?<\/details>/)?.[0];
 assert.ok(bar);assert.doesNotMatch(bar,/<details[^>]* open/);
 assert.ok(html.indexOf('class="thread-usage"')<html.indexOf('class="latest-call"'));
 assert.ok(html.indexOf('class="latest-call"')<html.indexOf('class="history"'));
 assert.ok(html.indexOf('class="latest-call"')<html.indexOf('<svg'));
 assert.ok(html.indexOf('class="latest-call"')<html.indexOf('Exact call values'));
 const summary=bar.match(/<summary[\s\S]*?<\/summary>/)[0];
 assert.match(summary,/<b>100.0k<\/b> \(90%\)/);assert.match(summary,/<b>1.2k<\/b>/);
 assert.match(summary,/Cache warmth: WARM/);assert.match(summary,/34\/100/);
 assert.match(bar,/Thinking/);assert.match(bar,/gpt-6.1-sol/);assert.match(bar,/Break-even<\/dt><dd>6 calls/);assert.match(bar,/Moderate/);assert.match(bar,/Default \(insufficient data\)/);assert.doesNotMatch(bar,/heuristic|Model-priced API break-even/);
 assert.equal((html.match(/Compaction Value ·/g)??[]).length,1);
 assert.match(render(latestFixture,true),/<details class="latest-call" open/);
});
test('latest call preserves unknown cache and output while recorded zeros remain zero',()=>{
 const sample=latestFixture.samples[0];
 const summary=s=>render(s).match(/<details class="latest-call"[^>]*><summary[\s\S]*?<\/summary>/)[0];
 const missing=summary({...latestFixture,samples:[{...sample,cachedRecorded:false,outputRecorded:false}]});
 assert.match(missing,/\(—\)/);assert.match(missing,/<b>—<\/b>/);assert.doesNotMatch(missing,/90%/);
 const zero=summary({...latestFixture,samples:[{...sample,cached:0,output:0}]});
 assert.match(zero,/\(0%\)/);assert.match(zero,/<b>0<\/b>/);
 const empty=summary({panelId:'p',status:'Waiting'});assert.match(empty,/Cache warmth: Unavailable/);assert.doesNotMatch(empty,/NaN|undefined/);
});

const allowanceFixture={input:100,cached:60,cacheWrite:0,output:20,reasoning:8,cacheComplete:true,outputComplete:true,reasoningComplete:true,pricedCalls:200,unpricedCalls:0,cost:1,cacheSavings:0,costCategories:[1,0,0,0,0,0],issues:[],models:['gpt-6.1-sol'],cumulativeMismatch:false};
test('thread allowance uses unrounded lifetime cost and fixed points per dollar without capping',()=>{
 assert.deepEqual(threadAllowanceEstimate(allowanceFixture),{fiveHour:12.9,weekly:2.1});
 const large=threadAllowanceEstimate({...allowanceFixture,cost:10});assert.equal(large.fiveHour,129);assert.equal(large.weekly,21);
 assert.deepEqual(threadAllowanceEstimate({...allowanceFixture,cost:0}),{fiveHour:0,weekly:0});
 assert.equal(threadAllowanceEstimate({...allowanceFixture,cost:.004}).fiveHour,.004*12.9);
 for(const cost of [NaN,Infinity,-1])assert.equal(threadAllowanceEstimate({...allowanceFixture,cost}),undefined);
 assert.equal(threadAllowanceEstimate({...allowanceFixture,pricedCalls:0}),undefined);assert.equal(threadAllowanceEstimate(),undefined);
});
test('allowance estimates follow selected thread totals and preserve partial/unknown independently of account telemetry',()=>{
 const renderUsage=usage=>render({panelId:'p',status:'Monitoring',callCount:200,samples:[],fiveHour:{used:6},weekly:{used:49},usage});
 const row=html=>html.match(/<div class="usage-line" aria-label="Estimated thread allowance usage"[\s\S]*?<\/div>/)[0];
 const html=renderUsage(allowanceFixture);assert.match(row(html),/≈12.9%/);assert.match(row(html),/Weekly \(7d\)/);assert.match(row(html),/≈2.1%/);assert.match(html,/94%/);assert.match(html,/51%/);assert.match(html,/across resets/);
 assert.match(row(renderUsage({...allowanceFixture,cost:10})),/≈129%/);
 assert.match(row(renderUsage({...allowanceFixture,cost:2})),/≈25.8%/);
 assert.match(row(renderUsage({...allowanceFixture,unpricedCalls:1})),/partial/);
 assert.match(row(renderUsage({...allowanceFixture,cumulativeMismatch:true})),/partial/);
 const unknown=row(renderUsage({...allowanceFixture,pricedCalls:0}));assert.match(unknown,/>—<\/b>/);assert.doesNotMatch(unknown,/≈0%/);
 assert.match(row(renderUsage({...allowanceFixture,cost:0})),/≈0%/);
 assert.doesNotMatch(row(renderUsage(undefined)),/NaN|undefined|≈0%/);
});

test('interactive refresh and task controls remain enabled and omit the global expand button',()=>{
 const html=render({panelId:'p',status:'Monitoring',selectedId:'a',tasks:[{id:'a',title:'A'}]},false,true);
 const header=html.match(/<header>[\s\S]*?<\/header>/)[0];
 const picker=html.match(/<div class="task-controls">[\s\S]*?<\/select>/)[0];
 assert.match(header,/aria-label="Refresh monitor"/);
 assert.doesNotMatch(header,/disabled|>Expand<|>Compact</);
 assert.doesNotMatch(picker,/select disabled/);
});

 test('update options occupy the version position and reflect available, dismissed and unknown states',()=>{
  const updates={installedVersion:'1.5.0',latestVersion:'1.6.0',status:'available',automatic:true,dismissed:false,checking:false,stale:false,downloadURL:'https://github.com/ACB-prgm/TokenMonitor/releases/download/v1.6.0/package.zip',checksumURL:'https://github.com/ACB-prgm/TokenMonitor/releases/download/v1.6.0/package.zip.sha256',releaseURL:'https://github.com/ACB-prgm/TokenMonitor/releases/tag/v1.6.0'};
  const html=render({panelId:'p',status:'Monitoring'},false,true,updates);
  assert.match(html,/<header>[\s\S]*v1.6.0 available[\s\S]*<\/header>/);
  assert.match(html,/Update and install/);assert.doesNotMatch(html,/Download Update|Download SHA-256/);assert.match(html,/Check at each panel opening/);assert.match(html,/Update package platform and architecture/);
  const dismissed=render({panelId:'p',status:'Monitoring'},false,true,{...updates,dismissed:true});assert.doesNotMatch(dismissed,/has-update/);assert.match(dismissed,/Update dismissed/);
  const unknown=render({panelId:'p',status:'Monitoring'},false,true,{...updates,status:'unknown',error:'Unable to check for updates.'});assert.match(unknown,/Unable to check/);assert.doesNotMatch(unknown,/Up to date/);
  const missing=render({panelId:'p',status:'Monitoring'},false,true,{...updates,downloadURL:undefined});assert.doesNotMatch(missing,/Update and install/);assert.match(missing,/No verified package/);
  const installing=render({panelId:'p',status:'Monitoring'},false,true,{...updates,installation:{phase:'installing',version:'1.6.0'}});assert.match(installing,/Installing update/);assert.match(installing,/disabled="">Updating/);
  const installed=render({panelId:'p',status:'Monitoring'},false,true,{...updates,installation:{phase:'installed',version:'1.6.0'}});assert.match(installed,/Restart Codex to finish/);assert.match(installed,/disabled="">Installed/);
  const failed=render({panelId:'p',status:'Monitoring'},false,true,{...updates,installation:{phase:'failed',version:'1.6.0',error:'Checksum mismatch'}});assert.match(failed,/Checksum mismatch/);
 });
test('automatic update checkbox starts checked and respects an explicit opt-out',()=>{
 const checkbox=updates=>render({panelId:'p',status:'Monitoring'},false,true,updates).match(/<label class="automatic-check">([\s\S]*?)<\/label>/)[1];
 assert.match(checkbox(undefined),/checked=""/);
 assert.match(checkbox({automatic:true,status:'unknown'}),/checked=""/);
 assert.doesNotMatch(checkbox({automatic:false,status:'unknown'}),/checked=""/);
});

test('compaction forecast shows observed estimates, finite-horizon break-even and limitations',()=>{
 const v=latestFixture.compactionValue;
 const observed=render({...latestFixture,compactionValue:{...v,breakEvenCalls:null,assumptions:{...v.assumptions,growth:{observed:1000,effective:1000,sampleCount:20,minimumApplied:false,fallback:false,source:'thread'}}}});
 assert.match(observed,/&gt;20 calls/);assert.match(observed,/Thread average · 20 intervals/);
 const personal=render({...latestFixture,compactionValue:{...v,assumptions:{...v.assumptions,growth:{observed:1000,effective:1750,sampleCount:4,minimumApplied:false,fallback:false,source:'user',userSampleCount:300}}}});
 assert.match(personal,/Your same-model average · 300 intervals · 4\/20 thread intervals/);
 const fallback=render({...latestFixture,compactionValue:{...v,assumptions:{...v.assumptions,growth:{effective:2000,sampleCount:0,minimumApplied:false,fallback:true,source:'default'}}}});
 assert.match(fallback,/Default \(insufficient history\) · 0\/20 thread intervals/);

 const limited=render({...latestFixture,compactionValue:{...v,status:'limited',score:null,category:'Forecast limited',completedCalls:4,limitation:'Un-compacted path exceeds reported context window'}});
 assert.match(limited,/4\/20 calls possible/);assert.match(limited,/Break-even<\/dt><dd>Unavailable/);assert.doesNotMatch(limited,/34\/100/);
 const unknown=render({panelId:'p',status:'Waiting'});assert.match(unknown,/Compaction Value ·/);assert.match(unknown,/Unavailable/);assert.doesNotMatch(unknown,/NaN|undefined/);
});

 test('account allowances disclose live/fallback age and expired resets without inventing remaining usage',()=>{
 const html=render({panelId:'p',status:'Monitoring',fiveHour:{used:25,source:'live',observedAt:'2026-10-28T12:00:00Z',stale:true},weekly:{used:40,source:'catalogue',observedAt:'2026-10-28T11:00:00Z',awaitingRefresh:true}});
 assert.doesNotMatch(html,/allowance-source|Live account|Local fallback|Waiting for allowance/);assert.match(html,/Live Codex account/);assert.match(html,/Stale/);assert.match(html,/may be incomplete/);assert.match(html,/Observed/);assert.match(html,/75%/);assert.match(html,/Awaiting refresh/);assert.doesNotMatch(html,/60% remaining|last observed in selected thread/);
 });

test('historical KPI banner follows Latest call, stays collapsed and explains both scopes',()=>{
 const summary={calls:10,priced:8,inputPriced:9,cost:.8,inputCost:.45,overhead:.08,costPerCall:.11,contextPerCall:.05,paybackRate:null,netSavings:0,evaluable:0,profitable:0,pending:1,excluded:0,inactivity:0};
 const data={activation:'2026-10-30T00:00:00Z',baseline:summary,baselineCalls:10,baselineProvisional:true,thread:summary,rolling:summary,threadRolling:summary,threadWeeks:[],threadModels:[],baselineModels:[],paybacks:[],periods:{7:{summary,models:[],weeks:[]}},progress:{processed:1,total:1,running:false,failed:0},pricingBasis:'fixture'};
 const html=render({...latestFixture,efficiency:data});
 assert.ok(html.indexOf('class="latest-call"')<html.indexOf('class="efficiency"'));
 assert.ok(html.indexOf('class="efficiency"')<html.indexOf('class="history"'));
 assert.match(html,/Thread \$0.11/);assert.match(html,/All chats \$0.11/);assert.match(html,/Compaction payback/);assert.match(html,/N\/A/);assert.match(html,/provisional/);assert.match(html,/not a pre-TokenMonitor claim/);assert.match(html,/seven days without activity/);assert.doesNotMatch(html,/<details class="efficiency" open/);
});
