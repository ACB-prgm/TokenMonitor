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
 assert.equal(percent(.0001),'<0.1%');assert.equal(percent(99.999),'>99.9%');assert.equal(percent(0),'0%');assert.equal(percent(100),'100%');assert.equal(money(undefined),'—');assert.equal(money(.000001),'$0.000001');
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
 assert.ok(html.indexOf('header-controls')<html.indexOf('thread-selector'));assert.ok(html.indexOf('Thread usage')<html.indexOf('Context window'));assert.ok(html.indexOf('Thread usage')<html.indexOf('Recent calls'));
 assert.match(html,/Context window consumed/);assert.doesNotMatch(html,/<progress|class="capacity"/);assert.match(html,/5-hour allowance/);assert.match(html,/94%/);assert.match(html,/51%/);assert.match(html,/API-equivalent/);assert.match(html,/Token composition/);assert.match(html,/Cost composition/);assert.match(html,/aria-pressed="true">Cost/);assert.match(html,/Transcript reads are incremental/);assert.doesNotMatch(html,/Lock|locked|Unlock/);assert.doesNotMatch(html,/<details[^>]* open/g);
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
 assert.ok(html.indexOf('class="latest-call"')<html.indexOf('<svg',html.indexOf('class="history"')));
 assert.ok(html.indexOf('class="latest-call"')<html.indexOf('Exact call values'));
 const summary=bar.match(/<summary[\s\S]*?<\/summary>/)[0];
 assert.match(summary,/<b>100.0k<\/b>/);assert.match(summary,/<b>1.2k<\/b>/);
 assert.doesNotMatch(summary,/WARM|UNCERTAIN/);assert.match(bar,/Cache warmth: WARM/);assert.match(summary,/34\/100/);
 assert.match(bar,/Thinking/);assert.match(bar,/gpt-6.1-sol/);assert.match(bar,/Break-even<\/dt><dd>6 calls/);assert.match(bar,/Moderate/);assert.match(bar,/Default \(insufficient data\)/);assert.doesNotMatch(bar,/heuristic|Model-priced API break-even/);
 assert.equal((html.match(/Compaction Value ·/g)??[]).length,1);
 assert.match(render(latestFixture,true),/<details class="latest-call" open/);
});
test('latest call preserves unknown cache and output while recorded zeros remain zero',()=>{
 const sample=latestFixture.samples[0];
 const summary=s=>render(s).match(/<details class="latest-call"[^>]*><summary[\s\S]*?<\/summary>/)[0];
 const missing=summary({...latestFixture,samples:[{...sample,cachedRecorded:false,outputRecorded:false}]});
 assert.doesNotMatch(missing,/90%/);assert.match(missing,/<b>—<\/b>/);assert.doesNotMatch(missing,/90%/);
 const zero=summary({...latestFixture,samples:[{...sample,cached:0,output:0}]});
 assert.doesNotMatch(zero,/NaN/);assert.match(zero,/<b>0<\/b>/);
 const empty=summary({panelId:'p',status:'Waiting'});assert.match(empty,/Cost/);assert.doesNotMatch(empty,/NaN|undefined/);
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
 const row=html=>html.match(/<div class="thread-allowances"[\s\S]*?(?=<div class="usage-line")/)[0];
 const html=renderUsage(allowanceFixture);assert.match(row(html),/≈12.9%/);assert.match(row(html),/Weekly allowance/);assert.match(row(html),/≈2.1%/);assert.match(html,/94%/);assert.match(html,/51%/);assert.match(html,/across resets/);
 assert.match(row(renderUsage({...allowanceFixture,cost:10})),/≈129%/);
 assert.match(row(renderUsage({...allowanceFixture,cost:2})),/≈25.8%/);
 assert.match(row(renderUsage({...allowanceFixture,unpricedCalls:1})),/partial/);
 assert.match(row(renderUsage({...allowanceFixture,cumulativeMismatch:true})),/partial/);
 const unknown=row(renderUsage({...allowanceFixture,pricedCalls:0}));assert.match(unknown,/Est. —/);assert.doesNotMatch(unknown,/≈0%/);
 assert.match(row(renderUsage({...allowanceFixture,cost:0})),/≈0%/);
 assert.doesNotMatch(row(renderUsage(undefined)),/NaN|undefined|≈0%/);
});

test('interactive refresh and task controls remain enabled and omit the global expand button',()=>{
 const html=render({panelId:'p',status:'Monitoring',selectedId:'a',tasks:[{id:'a',title:'A'}]},false,true);
 const header=html.match(/<header>[\s\S]*?<\/header>/)[0];
 const picker=html.match(/<div class="thread-selector">[\s\S]*?<\/button>/)[0];
 assert.match(header,/aria-label="Refresh metrics"/);
 assert.doesNotMatch(header,/disabled|>Expand<|>Compact</);
 assert.doesNotMatch(picker,/thread-trigger" disabled/);
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

test('historical KPI banner precedes Latest call, stays collapsed and explains both scopes',()=>{
 const summary={calls:10,priced:8,inputPriced:9,cost:.8,inputCost:.45,overhead:.08,costPerCall:.11,contextPerCall:.05,paybackRate:null,netSavings:0,evaluable:0,profitable:0,pending:1,excluded:0,inactivity:0};
 const data={activation:'2026-10-30T00:00:00Z',baseline:summary,baselineCalls:10,baselineProvisional:true,thread:summary,rolling:summary,threadRolling:summary,threadWeeks:[],threadModels:[],baselineModels:[],paybacks:[],periods:{7:{summary,models:[],weeks:[]}},progress:{processed:1,total:1,running:false,failed:0},pricingBasis:'fixture'};
 const html=render({...latestFixture,efficiency:data});
 assert.ok(html.indexOf('class="efficiency"')<html.indexOf('class="latest-call"'));
 assert.ok(html.indexOf('class="efficiency"')<html.indexOf('class="history"'));
 assert.match(html,/kpi-row-label">Thread/);assert.match(html,/kpi-row-label">Comp/);assert.match(html,/\$0.11/);assert.match(html,/Compaction payback/);assert.doesNotMatch(html,/N\/A/);assert.match(html,/Provisional/);assert.match(html,/Total input cost ÷ calls with priceable input/);assert.match(html,/Share of completed, evaluable compactions/);assert.doesNotMatch(html,/<details class="efficiency" open/);
});

test('collapsed KPI summary has shared labels, three headers and no definitions',()=>{
 const html=render({panelId:'p',status:'Waiting'});const summary=html.match(/<details class="efficiency"><summary[\s\S]*?<\/summary>/)[0];
 for(const label of ['Thread','Comp','Cost / call','Context / call','Compaction payback'])assert.equal(summary.split('>'+label+'<').length-1,1,label);
 assert.doesNotMatch(summary,/formula|baseline|input cost|<p>/i);assert.doesNotMatch(html,/Still gathering comparable history|class="efficiency-insights"/);
 assert.doesNotMatch(html,/Search local threads|Include archived|\b\d+ of \d+ matches/);
 assert.doesNotMatch(html,/class="efficiency-insights"/);
});
test('decimal formatting preserves small positive and negative dollar differences',()=>{
 assert.equal(money(.000001),'$0.000001');assert.equal(money(.000002),'$0.000002');assert.equal(money(-.000001),'−$0.000001');assert.equal(money(.0000001),'<$0.000001');assert.equal(money(.0234),'$0.0234');assert.equal(money(0),'$0.00');assert.equal(money(NaN),'—');
});

test('context ring reports consumed percentage, exact values, unknowns and post-compaction estimates',()=>{
 const html=render({panelId:'p',status:'Monitoring',input:183300,contextLimit:475000,contextPercent:38.5894736842});
 assert.match(html,/aria-valuenow="38.5894736842"/);assert.match(html,/183,300 \/ 475,000 tokens/);assert.match(html,/stroke-dasharray="38.5894736842 100"/);assert.match(html,/183.3k \/ 475k/);
 const unknown=render({panelId:'p',status:'Waiting'});assert.match(unknown,/Context utilization unavailable/);assert.doesNotMatch(unknown,/aria-valuenow|NaN/);
 const compacted=render({panelId:'p',status:'Monitoring',contextPercent:10,awaitingPostCompactionCall:true});assert.match(compacted,/Approximately 10% consumed/);assert.match(compacted,/Estimated after compaction/);
 const full=render({panelId:'p',status:'Monitoring',contextPercent:110});assert.match(full,/aria-valuenow="100"/);assert.match(full,/stroke-dasharray="100 100"/);
});
test('account allowances remain distinct from thread estimates and only critical resets are visible',()=>{
 const state={panelId:'p',status:'Monitoring',usage:allowanceFixture,fiveHour:{used:96,reset:'2026-11-01T01:00:00Z',source:'live'},weekly:{used:20,reset:'2026-11-02T01:00:00Z',source:'catalogue',stale:true}};
 const html=render(state);assert.match(html,/>4%<\/strong>/);assert.match(html,/>80%<\/strong>/);assert.match(html,/Est. ≈12.9% used/);assert.match(html,/Est. ≈2.1% used/);assert.equal((html.match(/class="critical-reset"/g)??[]).length,1);assert.match(html,/Account-level subscription allowance/);assert.doesNotMatch(html,/Account observation/);
 const awaiting=render({...state,fiveHour:{...state.fiveHour,awaitingRefresh:true},weekly:undefined});assert.doesNotMatch(awaiting,/class="critical-reset"/);assert.match(awaiting,/Awaiting refresh/);assert.doesNotMatch(awaiting,/>4%<\/strong>/);
});
test('insights use one collapsed disclosure and retain finding, impact and recommendations inside',()=>{
 const html=render({panelId:'p',status:'Monitoring',contextPercent:96});const insight=html.match(/<details class="efficiency-insights"[\s\S]*?<\/details>/)[0];const summary=insight.match(/<summary[\s\S]*?<\/summary>/)[0];assert.match(summary,/Efficiency insights: /);assert.match(summary,/Context approaching capacity/);assert.match(summary,/insight-chevron/);assert.doesNotMatch(summary,/<p>|Consider a new thread|96.0/);assert.doesNotMatch(insight,/<details[^>]* open/);assert.match(insight,/Review retained context/);
});

test('compaction value restores the original increasing health color scale in summary and details',()=>{
 let previous;
 for(const score of [0,34,80,100]){
  const html=render({...latestFixture,compactionValue:{...latestFixture.compactionValue,score}});const bar=html.match(/<details class="latest-call"[\s\S]*?<\/details>/)[0];const summary=bar.match(/<summary[\s\S]*?<\/summary>/)[0];
  const summaryColor=summary.match(/compaction-score[\s\S]*?<b style="([^"]+)"/)[1];const detailColor=bar.match(/Compaction Value · <b style="([^"]+)"/)[1];
  assert.match(summaryColor,/color-mix/);assert.equal(summaryColor,detailColor);assert.notEqual(summaryColor,previous);previous=summaryColor;
  if(score===100)assert.match(summaryColor,/var\(--health-red\)/);
 }
});

test('actionable insights precede thread usage while empty and healthy placeholders are hidden',()=>{
 const html=render({panelId:'p',status:'Monitoring',contextPercent:95});assert.ok(html.indexOf('</header>')<html.indexOf('class="efficiency-insights"'));assert.ok(html.indexOf('class="efficiency-insights"')<html.indexOf('class="thread-usage"'));
 assert.doesNotMatch(render({panelId:'p',status:'Waiting'}),/class="efficiency-insights"/);
});
test('thread allowance estimate leads account remaining in each group',()=>{
 const html=render({panelId:'p',status:'Monitoring',usage:allowanceFixture,fiveHour:{used:7},weekly:{used:20}});const group=html.match(/<div class="allowance-group"[\s\S]*?(?=<div class="allowance-group")/)[0];assert.ok(group.indexOf('Est. ≈12.9% used')<group.indexOf('93%'));assert.match(group,/class="thread-contribution"/);
});

 test('provisional KPIs use asterisks with a disclosure explanation and badges in both scopes',()=>{
 const summary={calls:10,priced:10,inputPriced:10,cost:.274,inputCost:.218,overhead:0,costPerCall:.0274,contextPerCall:.0218,paybackRate:100,netSavings:.1,evaluable:2,profitable:2,pending:0,excluded:0,inactivity:0};
 const c={current:.0274,reference:.02,delta:37,currentCalls:10,baselineCalls:100,coverage:1,provisional:true,reason:'Fewer than 20 current calls'};
 const comparisons={cost:{...c,cohorts:[{model:'gpt-6.1-sol',effort:'high',currentCalls:10,referenceCalls:100}]},context:c,cache:c,referenceLabel:'All available calls from other chats; excludes the selected chat.'};
 const data={activation:'2026-10-30',baseline:summary,baselineCalls:100,baselineProvisional:false,thread:summary,rolling:summary,threadRolling:summary,threadWeeks:[],threadModels:[],baselineModels:[],paybacks:[],comparisons:{thread:comparisons,periods:{7:comparisons}},periods:{7:{summary,previousSummary:{...summary,costPerCall:.02,contextPerCall:.015,priced:100,inputPriced:100,calls:100},models:[],weeks:[]}},progress:{processed:1,total:1,running:false,failed:0},pricingBasis:'fixture'};
 const html=render({...latestFixture,efficiency:data});const collapsed=html.match(/<details class="efficiency"><summary[\s\S]*?<\/summary>/)[0];
 assert.equal((collapsed.match(/class="provisional-mark"/g)??[]).length,6);
 assert.equal((collapsed.match(/class="kpi-badge tone-neutral"/g)??[]).length,4);
 assert.doesNotMatch(collapsed.replace(/<span class="sr-only">[^<]*<\/span>/g,''),/>Provisional</);assert.match(html,/\* Provisional:<\/strong>/);assert.match(html,/20 current and 20 reference/);assert.match(html,/5 completed, evaluable events/);assert.match(html,/10 current \/ 10 reference calls/);assert.match(html,/Thread compares directly with the Comp row/);assert.match(html,/preceding equal-length period/);assert.doesNotMatch(html,/Fixed reference|Cost \/ context change/);
 });

test('expanded KPI guide has only three definitions, formulas and numeric substitutions',()=>{
 const summary={calls:10,priced:10,inputPriced:10,cost:.274,inputCost:.218,overhead:.01,costPerCall:.0284,contextPerCall:.0218,paybackRate:50,netSavings:-.001234,evaluable:6,profitable:3};
 const html=render({panelId:'p',status:'Monitoring',efficiency:{thread:summary,periods:{7:{summary}}}});
 const guide=html.match(/<div class="efficiency-details kpi-guide">[\s\S]*?<\/dl>/)[0];
 assert.equal((guide.match(/<dt>/g)??[]).length,3);assert.match(guide,/Context \/ call <span>\(USD\)/);
 assert.match(guide,/fresh, cached and cache-write input/);assert.match(guide,/output and reasoning tokens are excluded/);
 assert.match(guide,/Thread: \$0.284 \/ 10 = \$0.0284/);assert.match(guide,/Thread: \$0.218 \/ 10 = \$0.0218/);assert.match(guide,/3 \/ 6 × 100 = 50%/);
 assert.match(guide,/Final net savings: Thread −\$0.001234/);assert.match(guide,/Exact numerator: 0.218 USD/);
 assert.doesNotMatch(guide,/<table|<details|Model breakdown|Weekly historical trend|Thread compaction results|historical reference/);
 assert.match(html,/Comparison period/);
 const loading=render({panelId:'p',status:'Waiting'});assert.match(loading,/Historical analytics are loading/);assert.doesNotMatch(loading,/NaN|undefined/);
});


test('KPI deltas equal the visible Thread and Comp values without cohort weighting',()=>{
 const base={calls:40,priced:40,inputPriced:40,cost:1.2,inputCost:.8,overhead:0,costPerCall:.03,contextPerCall:.02,paybackRate:50,netSavings:.1,evaluable:2,profitable:1,pending:1};
 const html=render({panelId:'p',status:'Monitoring',efficiency:{thread:{...base,costPerCall:.06,contextPerCall:.03},periods:{7:{summary:base,previousSummary:{...base,costPerCall:.02,contextPerCall:.01}}},progress:{running:false,failed:0},baselineProvisional:false}});
 const summary=html.match(/<details class="efficiency"><summary[\s\S]*?<\/summary>/)[0];
 assert.ok(summary.indexOf('Context / call')<summary.indexOf('Cost / call'));
 assert.match(summary,/↑ 50.0/);assert.match(summary,/100.0/);
 assert.match(summary,/1\/2 \(50%\)/);assert.match(summary,/1 pending/);
 assert.doesNotMatch(summary,/tone-bad|tone-amber/);
 const missing=render({panelId:'p',status:'Waiting'});assert.doesNotMatch(missing,/N\/A|NaN/);
});
