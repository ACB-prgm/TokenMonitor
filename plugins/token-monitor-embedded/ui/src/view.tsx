import {compactionLabel,type CompactionDetail} from '../../server/src/compaction.js';
import type {TurnStats,TurnPayback} from '../../server/src/turns.js';
import {compareCohorts} from '../../server/src/comparisons.js';
import type {Bucket} from '../../server/src/efficiency.js';
import {EfficiencyInsights} from './insights.js';
import {ThreadPicker,Settings} from './controls.js';
import {ResumeControls,type ResumeView,type ResumeAction} from './resume.js';
import {HistoryStorage,type HistoryDiagnostics} from './history-storage.js';
import {EfficiencyBanner} from './efficiency.js';
import type {Efficiency} from '../../server/src/efficiency.js';
import React, {useEffect,useState,useId} from 'react';
import {InspectionController,type Inspection} from './inspection.js';
import {installedVersion} from '../../shared/version.js';
import {isDev} from '../../shared/identity.js';
import {type UpdateAction} from './updates.js';
import type {CompactionForecast,RollingEstimate,GrowthEstimate} from '../../server/src/metrics.js';
import type {CallActivity} from '../../server/src/activity.js';
import type {Allowance} from '../../server/src/allowances.js';
import type {UpdateStatus} from '../../server/src/updates.js';
import {smoothLine, categories, composition, number, exact, percent, money, threadAllowanceEstimate, type Price, type Usage} from './analytics.js';
export {number} from './analytics.js';
export type Sample = { costPerCall?:number; costPricedCalls?:number; contextPerCall?:number; contextPricedCalls?:number; effort?:string; regionalProcessing?:boolean;  activity?: CallActivity; model?: string; serviceTier?: string; cachedRecorded?: boolean; cacheWriteRecorded?: boolean; price?: Price; ordinal?: number; timestamp: string; input: number; cached: number; output: number; reasoning: number; cacheWrite?: number; outputRecorded?: boolean; reasoningRecorded?: boolean };
export type Task = { id: string; title: string; workspace?: string;archived?:boolean };
export type Monitor = { panelId: string; revision?: string; unchanged?: boolean; task?: Task; selectedId?: string;
  efficiency?:Efficiency;historyError?:string; status: string; selectionSource?: string; followingMode?: string; disconnected?: boolean;
  available?: boolean; input?: number; cached?: number; fresh?: number; contextLimit?: number; contextPercent?: number;
  contextHealth?: number; freshHealth?: number; model?: string; effort?: string; callCount?: number;
  samples?: Sample[]; compactionCost?:number;compactions?: ({timestamp:string;callPosition:number}&Partial<CompactionDetail>)[]; isCompacting?: boolean;
  awaitingPostCompactionCall?: boolean; lastCall?: string; lastEvent?: string; cacheTemperature?: string;
  fiveHour?: Allowance; weekly?: Allowance;
  compactionValue?: CompactionForecast;turnStats?:TurnStats;compactionTurnPayback?:TurnPayback;sessionEnded?:boolean;
  attribution?: {contributors: {name: string; calls: number; tokens: number}[]; skillCount: number; callCount: number; afterCompaction: boolean};
  usage?: Usage; outputTotals?: {total?: number; reasoning?: number; source: string}; catalogueQuery?:string;matchCount?:number;shownCount?:number;discovery?:{targeting?:boolean;state:string;index:string;lastCompleted?:string;readable:number;missing:number;unreadable:number;malformed:number;excluded:number};tasks?: Task[]; completedAt?: string };
const time = (date?: string) => date ? new Date(date).toLocaleString() : '—';
const quota = (a?: Allowance) => a?.awaitingRefresh ? 'Awaiting refresh' : a ? percent(Math.min(100,Math.max(0,100-a.used))) : '—';
const attributionHelp = 'Estimate from recorded tool arguments and result text, about 4 characters per token, bounded by latest input. Covers retained history, not the entire session. Wrapped calls count once. Images, hidden tool schemas and skill catalogs are excluded. Compaction summaries cannot be attributed.';
const cacheHelp = 'Predicted cache availability before the next call: warm under 30 minutes; uncertain through 120 minutes; presumed cold afterward. Actual cache reuse may differ.';
const compactionHelp = 'Compaction Value estimates the percentage of avoidable context-processing cost saved over the next 20 calls, including compaction overhead and long-context pricing.';
function resourceColor(percent?:number){return percent==null?'var(--muted)':percent>=95?'var(--health-red)':percent>=85?'var(--health-amber)':'var(--ink)';}
function health(level = 0) {
  const stops = ['var(--ink)','var(--health-amber)','var(--health-orange)','var(--health-red)'];
  const x = Math.min(3,Math.max(0,level)), i = Math.min(2,Math.floor(x));
  return `color-mix(in srgb, ${stops[i]} ${(1-(x-i))*100}%, ${stops[i+1]})`;
}
function Metric({label, value, level = 0, help}: {label: string; value?: number | null; level?: number; help?: string}) {
  return <div className="metric" title={`${help ?? label}: ${exact(value)} tokens`}><dt>{label}</dt><dd style={{color: health(level)}}>{number(value)}</dd></div>;
}
function Stack({values, cost = false, label}: {values?: number[]; cost?: boolean; label: string}) {
  const total = values?.reduce((a,b)=>a+b,0) ?? 0;
  return <div className="composition"><span>{label}</span>{values && total > 0 ? <div className="stack" role="img" aria-label={values.map((v,i)=>`${categories[i].label}: ${cost?money(v):exact(v)}, ${percent(v/total*100)}`).join('; ')}>{values.map((v,i)=>v>0 && <span key={i} tabIndex={0} style={{width:`${v/total*100}%`,background:categories[i].color}} title={`${categories[i].label}: ${cost?money(v):exact(v)} · ${percent(v/total*100)}`} />)}</div> : <span className="muted">{values?'No usage yet':'Breakdown unavailable'}</span>}</div>;
}
function ContextGauge({s}:{s:Monitor}) {
  const known=s.contextPercent!=null&&Number.isFinite(s.contextPercent), used=known?Math.min(100,Math.max(0,s.contextPercent!)):0;
  const compacting=!!s.isCompacting;
  const help=`${compacting?'Compacting context window · Last recorded context consumed':'Context consumed'}: ${known?s.contextPercent+'%':'Unknown'} · ${exact(s.input)} / ${exact(s.contextLimit)} tokens${s.awaitingPostCompactionCall?' · Estimated after compaction; awaiting next call':''}`;
  return <div className="context-gauge" title={help} tabIndex={0} aria-label={help}>
    <div className={`context-ring${compacting?' is-compacting':''}`} style={{color:resourceColor(known?s.contextPercent:undefined)}}>
      <svg viewBox="0 0 84 84" role="progressbar" aria-label={compacting?'Compacting context window':'Context window consumed'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={!compacting&&known?used:undefined} aria-valuetext={compacting?'Compaction in progress':known?`${s.awaitingPostCompactionCall?'Approximately ':''}${percent(s.contextPercent)} consumed`:'Context utilization unavailable'}>
        <circle className="ring-track" cx="42" cy="42" r="36"/>
        <circle className="ring-fill" cx="42" cy="42" r="36" pathLength="100" strokeDasharray={`${compacting?28:used} 100`} transform="rotate(-90 42 42)"/>
      </svg>
      <strong aria-hidden="true">{compacting?'COM':`${s.awaitingPostCompactionCall&&known?'≈':''}${known?percent(s.contextPercent):'—'}`}</strong>
    </div>
    <div className="context-caption"><span role="status">{compacting?'Compacting…':'Context window'}</span><small>{number(s.input).replace('.0k','k')} / {number(s.contextLimit).replace('.0k','k')}</small></div>
  </div>;
}
function CacheWarmth({s}:{s:Monitor}) {
  const id=useId(),[dismissed,setDismissed]=useState(false);
  const values:Record<string,{label:string;tone:string}>={'WARM':{label:'Warm',tone:'good'},'UNCERTAIN':{label:'Uncertain',tone:'amber'},'PRES. COLD':{label:'Presumed cold',tone:'bad'}};
  const state=values[s.cacheTemperature??'']??{label:'Unknown',tone:'muted'};
  const elapsed=s.lastCall?Date.now()-Date.parse(s.lastCall):NaN;
  const age=Number.isFinite(elapsed)&&elapsed>=0?`${Math.floor(elapsed/60000)} minutes ago`:'unknown';
  return <span className="cache-warmth" tabIndex={0} aria-label={`Estimated cache warmth: ${state.label}`} aria-describedby={id} data-dismissed={dismissed} onFocus={()=>setDismissed(false)} onMouseEnter={()=>setDismissed(false)} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setDismissed(true);}}}><span className={`tone-${state.tone}`}>{state.label}</span><span className="warmth-tooltip" role="tooltip" id={id}>{cacheHelp} Last recorded call: {age}. Cached % measures recorded cache reads, not current availability.</span></span>;
}
function ThreadSummary({s}: {s:Monitor}) {
  const u=s.usage,calls=s.callCount??0,reported=s.outputTotals;
  const partial = !!u && (u.unpricedCalls>0 || u.cumulativeMismatch) || !!s.compactions?.some(c=>c.source&&c.totalCost==null);
  const allowance = threadAllowanceEstimate(u);
  const tokens = u?.cacheComplete && u.outputComplete ? composition(u.input,u.cached,u.cacheWrite,u.output,u.reasoningComplete?u.reasoning:undefined) : undefined;
  return <section className="thread-usage" aria-label="Thread usage">
    <div className="thread-overview"><div className="thread-financial"><div className="thread-heading"><h2>Thread usage</h2><span>{calls} recorded calls</span></div>
      <div className="spend" title="API-equivalent normal-call spending plus attributed compaction charges using current rates. Not a Codex subscription charge."><strong>{(u?.pricedCalls||s.efficiency?.thread.priced||s.compactions?.some(c=>c.totalCost!=null)) ? money((u?.cost??s.efficiency?.thread.cost??0)+(s.compactionCost??s.efficiency?.thread.overhead??0)) : '—'}</strong><span className="cost-description"><span className="cost-long">Estimated API-equivalent cost</span><span className="cost-short">Est. API-equivalent</span>{partial?' · partial':''}</span></div>
    </div><ContextGauge s={s}/></div>
    <div className="thread-metadata"><span className={s.disconnected||s.available===false?'offline':'live'} aria-hidden="true"/><span>{s.available===false?'Saved history · source unavailable':s.followingMode==='host-chat'?'Following this chat':'Following latest hook activity'}{s.selectionSource==='manual'?' · inspecting another thread':''}</span><span className="metadata-model">{s.model??'Model unknown'} · {s.effort??'Effort unknown'}</span></div>
    <div className="thread-allowances" aria-label="Account allowances and estimated thread contribution">{([{label:'5-hour',account:s.fiveHour,estimate:allowance?.fiveHour},{label:'Weekly',account:s.weekly,estimate:allowance?.weekly}]).map(({label,account:q,estimate})=>{
      const critical=!!q&&!q.awaitingRefresh&&q.used>=95;
      const help=`Account-level subscription allowance · ${q?.source==='live'?'Live Codex account':q?.source==='catalogue'?'Local catalogue fallback (may be incomplete)':'Source unavailable'} · Observed ${time(q?.observedAt)}${q?.stale?' · Stale':''} · Resets ${time(q?.reset)}`;
      return <div className="allowance-group" key={label} aria-label={`${label} allowance`}><span className="allowance-label">{label}</span><strong className="thread-contribution" title="Estimated from this thread's full recorded cost × fixed calibration, across resets; not a rolling-window measurement. May exceed 100%.">Est. {estimate==null?'—':`≈${percent(estimate)} used`}{partial?' · partial':''}</strong><div className="account-remaining" title={help} tabIndex={0} style={{color:resourceColor(q?.awaitingRefresh?undefined:q?.used)}}><strong>{quota(q)}</strong>{!q?.awaitingRefresh&&<span> remaining</span>}</div>{critical&&<small className="critical-reset">Low allowance · Resets {time(q.reset)}</small>}</div>;
    })}</div>
    <div className="usage-line"><span title="Sum of recorded per-call inputs, including repeated context reads">Input <b>{number(u?.input)}</b></span><span title="Cumulative recorded output; thinking included">Output <b>{number(u?.outputComplete?u.output:undefined)}</b></span><span title="Recorded input + output; repeated context is counted on every call">Volume <b>{number(u?.outputComplete?u.input+u.output:undefined)}</b></span></div>
    <div className="usage-line muted cache-summary"><span title="Cache-read tokens divided by all recorded input tokens">Cached {u?.cacheComplete && u.input ? percent(u.cached/u.input*100):'—'}</span><CacheWarmth s={s}/><span title="Hypothetical ordinary-input cost minus observed input cost. Includes reported cache-write premiums. Priced calls only.">Cache savings {u?.pricedCalls?money(u.cacheSavings):'—'}{u?.unpricedCalls?' (priced calls)':''}</span></div>
    <Stack label="Token composition" values={tokens}/><Stack label={u?.unpricedCalls?"Cost composition (priced calls)":"Cost composition"} values={u?.pricedCalls?u.costCategories:undefined} cost/>
    <div className="legend">{categories.filter((_,i)=>i!==5 || (tokens?.[5]??u?.costCategories[5]??0)>0).map(c=><span key={c.label}><i style={{background:c.color}}/>{c.label}</span>)}</div>
    <details><summary title="Show exact category totals, rates and coverage">Pricing &amp; accounting details</summary>
      <p>API-equivalent estimate only; your subscription allowances are separate. {u?.coverage ?? 'Waiting for usage records.'} Rates verified {u?.verifiedAt ?? '—'}; current rates are applied to historical calls, not historical invoices.</p>
      <p>Thread allowance estimates use your fixed calibration: 12.9 percentage points per $1 for 5-hour usage (≈$7.75 per 100 points), and 2.1 for weekly (7-day) usage (≈$47.62 per 100 points). They convert this thread’s full recorded API-equivalent cost, across resets, without a rolling-window filter. Account remaining values are observed separately; thread estimates do not subtract from those values. Partial pricing produces partial estimates; unpriced calls are excluded.</p>
      <p>Models: {u?.models.join(', ') || 'Unknown'}. {u?.pricedCalls ?? 0} priced / {calls} recorded calls. {u?.assumedTierCalls ?? 0} calls assume Standard tier because tier was absent or automatic. Region premiums apply only when explicitly recorded. Separately billed tools, search, images and compute are excluded.</p>
      <p>Compaction charges: {money(s.compactionCost??s.efficiency?.thread.overhead)} API equivalent, including recorded request costs where verified and modeled replacement writes. Normal-call composition below excludes these separately attributed charges.</p>
      {u?.cumulativeMismatch && <p className="warning">Reported cumulative counters differ from recorded call sums. Thread totals and cost cover recorded calls only; missing calls cannot be priced retrospectively.</p>}
      {u?.issues.map(issue=><p className="warning" key={issue}>{issue}</p>)}
      {!u?.cacheComplete && <p>Missing or inconsistent cache categories prevent exact input breakdown and pricing of affected calls.</p>}
      {!u?.reasoningComplete && <p>Missing reasoning splits are shown as unsplit output, never invented as zero thinking.</p>}
      <div className="table-scroll"><table><thead><tr><th>Category</th><th>Tokens</th><th>USD (priced calls)</th></tr></thead><tbody>{categories.map((c,i)=><tr key={c.label}><th>{c.label}</th><td>{exact(tokens?.[i])}</td><td>{u?.pricedCalls?money(u.costCategories[i]):'—'}</td></tr>)}</tbody></table></div>
      <p>Reported thread output: {exact(reported?.total)}; thinking: {exact(reported?.reasoning)} (included). {reported?.source === 'reported-cumulative' ? 'Cumulative telemetry counters; may include usage without priceable call records.' : 'Recorded-call counters.'}</p>
      <p><a href={u?.source??'https://developers.openai.com/api/docs/pricing'} target="_blank" rel="noreferrer">Official API pricing</a> · Full-request long-context thresholds and known tier multipliers are applied per call. Reasoning is part of output. Cache reads and writes are subtracted from ordinary input once.</p>
    </details>
  </section>;
}
function sampleTokens(c: Sample) {
  if(c.cachedRecorded===false || c.cacheWriteRecorded===false || c.outputRecorded===false || (c.cacheWrite??0)>c.input-c.cached) return undefined;
  return composition(c.input,c.cached,c.cacheWrite??0,c.output,c.reasoningRecorded===false?undefined:c.reasoning);
}
function LatestCall({s, expanded}: {s: Monitor; expanded: boolean}) {
  const last=s.samples?.at(-1);
  const cached=last?.cachedRecorded===false?undefined:last?.cached;
  const fresh=last&&cached!=null?last.input-cached:undefined;
  const cachedPercent=last?.input&&cached!=null?cached/last.input*100:undefined;
  const freshPercent=last?.input&&fresh!=null?fresh/last.input*100:undefined;
  return <details className="latest-call" open={expanded}>
    <summary title="Expand latest call details"><span className="latest-bar">
      <strong>Latest<span className="latest-title-suffix"> call</span></strong>
      <span title="Latest input tokens"><span className="call-label-full">Input</span><span className="call-label-short" aria-hidden="true">In</span> <b>{number(last?.input)}</b></span>
      <span title="Output includes reasoning"><span className="call-label-full">Output</span><span className="call-label-short" aria-hidden="true">Out</span> <b>{number(last?.outputRecorded===false?undefined:last?.output)}</b></span>
      <span>Cost <b>{money(last?.price?.total)}</b></span>

    </span></summary><div className="latest-body"><p>Cache warmth: {s.cacheTemperature??'Unavailable'}. {cacheHelp} UNCERTAIN means cache availability is unknown; it does not establish a cache miss.</p><h2>Latest call · {money(last?.price?.total)}</h2>{!last&&<p>Waiting for the first recorded call.</p>}<dl className="metrics"><Metric label={`Cached (${percent(cachedPercent)})`} value={cached}/><Metric label={`Fresh (${percent(freshPercent)})`} value={fresh}/><Metric label="Input" value={last?.input}/><Metric label="Output (incl. thinking)" value={last?.outputRecorded===false?undefined:last?.output}/><Metric label="Thinking" value={last?.reasoningRecorded===false?undefined:last?.reasoning}/><Metric label="Cache write" value={last?.cacheWriteRecorded===false?undefined:last?.cacheWrite}/></dl><p title={cacheHelp}>Cache <b className="muted">{s.cacheTemperature??'—'}</b>. {cacheHelp}</p><p>{last?.model??'Model unknown'} · {last?.serviceTier??'Standard assumed'} · {time(last?.timestamp)}</p>{last?.price?.rates&&<p>USD / 1M: input {money(last.price.rates.input)}, read {money(last.price.rates.cached)}, write {money(last.price.rates.write)}, output {money(last.price.rates.output)}.</p>}
    {last?.price?.issue&&<p className="warning">{last.price.issue}</p>}
    <CompactionDetails value={s.compactionValue} turnPayback={s.compactionTurnPayback}/>
    </div></details>;
}
function estimateSource(estimate?:RollingEstimate) {
  if(!estimate)return 'Assumptions unavailable';
  return `${estimate.fallback?'Default (insufficient data)':'Observed'} · ${estimate.sampleCount} samples${estimate.minimumApplied?' · minimum applied':''}${estimate.observed==null?'':` · observed ${exact(estimate.observed)}`}`;
}
function growthSource(estimate?:GrowthEstimate) {
  if(!estimate)return 'Assumptions unavailable';
  const progress=`${estimate.sampleCount}/20 thread intervals`;
  if(estimate.source==='thread')return `Thread average · ${estimate.sampleCount} intervals`;
  if(estimate.source==='user')return `Your same-model average · ${estimate.userSampleCount} intervals · ${progress}`;
  return `Default (insufficient history) · ${progress}`;
}
function CompactionDetails({value:v,turnPayback:t}:{value?:CompactionForecast;turnPayback?:TurnPayback}) {
  const available=v?.status==='available';
  return <div className="latest-compaction"><h2 title={compactionHelp}>Compaction Value · <b style={{color:health(v?.score==null?0:v.score/100*3)}}>{v?.score==null?'—':`${v.score}/100`}</b>{v&&` · ${v.category}`}</h2>
    <p>{compactionHelp}</p>
    {v?.limitation&&<p className="warning">{v.limitation}{v.status==='limited'?` (${v.completedCalls}/${v.horizonCalls} calls possible).`:''}</p>}
    <dl className="details-grid">
      <dt>Context estimate</dt><dd>{number(v?.currentInput)} → {number(v?.estimatedInput)} tokens</dd>
      <dt>Growth / call</dt><dd>{number(v?.growthPerCall)} tokens · {growthSource(v?.assumptions.growth)}</dd>
      <dt>Output / call (incl. thinking)</dt><dd>{number(v?.typicalOutput)} tokens · {estimateSource(v?.assumptions.output)}{v?.assumptions.output&&(v.assumptions.output.activeModelOnly?' · active model':' · thread samples')}</dd>
      <dt>Forecast horizon</dt><dd>{v?.horizonCalls??20} normal calls</dd>
      <dt>Break-even</dt><dd>{available?(v.breakEvenCalls==null?`>${v.horizonCalls} calls`:`${v.breakEvenCalls} calls`):'Unavailable'}</dd>
      <dt>Turn-based payback</dt><dd>{t?.status==='available'?`≈${t.turns} more turns (${t.calls} calls); ${t.epochCompleted} completed turns in this epoch`:t?.reason??'Unavailable: completed-turn history has not been supplied'}</dd>
      {t&&<><dt>Turn conversion</dt><dd>This chat: {t.threadTurns} completed turns, {t.threadMean?.toFixed(2)??'—'} calls/turn; other chats: {t.historyTurns} turns, {t.historyMean?.toFixed(2)??'—'} calls/turn. {t.bufferedMean!=null&&`Using ${t.source}: ${t.bufferedMean.toFixed(2)} calls/turn after a 25% downward buffer, then rounding payback up.`} Heuristic, not a statistical confidence bound.</dd></>}
      <dt>Compaction overhead</dt><dd>{money(v?.compactionOverheadUsd??undefined)} · {number(v?.compactionOutput)} output tokens + replacement cache write</dd>
      <dt>Net estimated savings</dt><dd>{money(v?.netSavingsUsd??undefined)}</dd>
      <dt>Avoidable cost baseline</dt><dd>{money(v?.avoidableCostUsd??undefined)}</dd>
      <dt>Active model</dt><dd>{v?.model??'Unknown'} · {v?.serviceTier??'Standard assumed'}{v?.regionalProcessing?' · regional processing':''}</dd>
      <dt>Assumptions</dt><dd>40K retained context · warm-prefix reuse · {v?.assumptions.pricingAvailable?'verified API rates':'pricing unavailable'}{v?.assumptions.assumedTier?' · Standard tier assumed':''}{v&&!v.assumptions.contextLimitKnown?' · context limit unknown':''}</dd>
    </dl>
    <p>API-equivalent estimates, not subscription charges. Cache temperature is separate; future cache misses may change savings. Financial value does not guarantee context preservation.</p>
  </div>;
}
function CompactionPreview({c}:{c:CompactionDetail}){
 const u=c.usage;
 return <><div className="inspect-header"><strong>Compaction</strong><span>{compactionLabel(c)}</span></div><p>{c.source==='recorded'?'Recorded usage':'Estimated usage'} · {time(c.timestamp)}</p>
 <p>{u?.model??'Unknown model'} · {u?.serviceTier??'Standard assumed'}</p>
 <dl className="inspect-values">{[['Input',u?.input],['Cached',u?.cached],['Cache write',u?.cacheWrite],['Output',u?.output],['Thinking',u?.reasoningRecorded?u.reasoning:undefined]].map(([k,v])=><div key={k as string}><dt>{k}</dt><dd>{exact(v as number|undefined)}</dd></div>)}</dl>
 <dl className="inspect-values">{[['Request',c.requestCost],['Replacement write (estimated)',c.replacementWrite],['Write credit',c.writeCredit],['API equivalent · total',c.totalCost]].map(([k,v])=><div key={k as string}><dt>{k}</dt><dd>{money(v as number|undefined)}</dd></div>)}</dl>
 <p className="inspect-rates">{c.reason&&`${c.reason}. `}{c.source==='estimated'?'Request assumes a warm read of the preceding context and 3,600 output tokens. ':''}Replacement write uses {exact(c.replacementTokens)} retained tokens; 40,000 assumed until reported. Recorded writes on the first following call are credited once. Request model, tier and region use the surrounding recorded metadata; absent tier assumes Standard. Costs are API equivalents.</p>{c.totalCost==null&&<p className="warning">Cost unavailable: missing usage or verified pricing.</p>}</>;
}
function History({s}: {s: Monitor}) {
  const [mode,setMode] = useState<'Cost'|'Tokens'|'Context'|'KPIs'>('Cost');
  const [preview,setPreview]=useState<Inspection>({hovered:null,focused:null,pinned:null,closing:false});
  const [inspection]=useState(()=>new InspectionController(setPreview,()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false));
  useEffect(()=>()=>inspection.dispose(),[inspection]);
  const {hovered,focused,pinned}=preview;
  const samples=s.samples??[], compactions=s.compactions??[];
  const compactionKey=(c:{timestamp:string})=>`compaction:${c.timestamp}`;
  const start=(s.callCount??samples.length)-samples.length;
  const callKey=(c:Sample,i:number)=>`${start+i}:${c.timestamp}`;
  const activeKey=hovered??focused??pinned;
  const inspect=samples.findIndex((c,i)=>callKey(c,i)===activeKey);
  const selected=inspect>=0?samples[inspect]:undefined;
  const selectedCompaction=compactions.find(c=>compactionKey(c)===activeKey);
  const retainedKeys=[...samples.map(callKey),...compactions.map(compactionKey)].join('|');
  useEffect(()=>inspection.retain(new Set(retainedKeys.split('|'))),[inspection,retainedKeys]);
  const clearInspection=()=>inspection.clear();
  const toggleInspection=(key:string)=>inspection.pin(key);
  const slots=[...samples.map((c,i)=>({key:callKey(c,i),position:start+i,timestamp:c.timestamp})),...compactions.map(c=>({key:compactionKey(c),position:c.callPosition,timestamp:c.timestamp}))].sort((a,b)=>a.position-b.position||a.timestamp.localeCompare(b.timestamp));
  const slotX=(key:string)=>45+slots.findIndex(c=>c.key===key)/Math.max(1,slots.length-1)*510;
  const width=Math.min(16,460/Math.max(1,slots.length));
  const bars=mode==='Cost'||mode==='Tokens';
  const compactionValue=(c:typeof compactions[number])=>mode==='Cost'?c.totalCost:c.usage?c.usage.input+c.usage.output:undefined;
  const values=samples.map(c=>mode==='Cost'?c.price?.categories:sampleTokens(c));
  const visibleBuckets:Bucket[]=samples.map(c=>({timestamp:c.timestamp,model:c.model,effort:c.effort,serviceTier:c.serviceTier,regionalProcessing:c.regionalProcessing,rateBand:c.price?.rates?JSON.stringify(c.price.rates):undefined,input:c.input,cached:c.cached,cacheWrite:c.cacheWrite??0,output:c.output,calls:1,priced:c.price?.total!=null?1:0,inputPriced:c.price?.categories?1:0,cost:c.price?.total??0,inputCost:c.price?.categories?.slice(0,3).reduce((a,b)=>a+b,0)??0,overhead:0,cacheInput:c.price?.categories?c.input:0,cacheRead:c.price?.categories?c.cached:0}));
  const referenceData=s.efficiency?.reference;
  const comparison=referenceData?compareCohorts(visibleBuckets,referenceData.buckets.map(b=>({...b,overhead:0})),referenceData.ready).cost:undefined;
  const reference=mode==='Cost'&&comparison&&!comparison.provisional?comparison.reference:null;
  const showKpis=mode==='KPIs';
  const max=Math.max(.000001,reference??0,...(bars?compactions.map(c=>compactionValue(c)??0):[]),...samples.map((c,i)=>mode==='Context'?c.input:showKpis?Math.max(c.contextPerCall??0,c.costPerCall??0):values[i]?.reduce((a,b)=>a+b,0)??0));
  const x=(i:number)=>slotX(callKey(samples[i-start],i-start)), y=(n:number)=>130-n/max*110;
  const describe=(c:Sample,i:number)=>`Call ${start+i+1}${c.ordinal!=null?` · ordinal ${c.ordinal}`:''} · ${c.model??'Unknown model'} · ${time(c.timestamp)}${showKpis?` · Running context / call ${c.contextPerCall==null?'—':`$${c.contextPerCall.toFixed(6)}`} (${c.contextPricedCalls??0} calls with priceable input) · Running cost / call ${c.costPerCall==null?'—':`$${c.costPerCall.toFixed(6)}`} (${c.costPricedCalls??0} priced calls)`:''}\nInput ${exact(c.input)} · Cached ${exact(c.cachedRecorded===false?undefined:c.cached)} · Cache write ${exact(c.cacheWriteRecorded===false?undefined:c.cacheWrite)}\nOutput ${exact(c.outputRecorded===false?undefined:c.output)} · Thinking ${exact(c.reasoningRecorded===false?undefined:c.reasoning)}\nAPI equivalent ${c.price?.total==null?'—':`$${c.price.total.toFixed(6)}`} · ${c.price?.categories?.map((n,j)=>`${categories[j].label} $${n.toFixed(6)}`).join(' · ')??'Composition unavailable'}${c.price?.rates?` · USD/1M input ${c.price.rates.input}, read ${c.price.rates.cached}, write ${c.price.rates.write??'—'}, output ${c.price.rates.output}`:''} · ${c.serviceTier??'Standard assumed'}${c.price?.issue?` · ${c.price.issue}`:''}${compactions.some(m=>Math.abs(m.callPosition-(start+i))<=.5)?' · Near compaction boundary':''}`;
  return <section className="history" aria-label="Recent call history"><div className="section-title"><h2>Recent calls</h2><div className="segmented" role="group" aria-label="History view">{(['Cost','Tokens','Context','KPIs'] as const).map(m=><button key={m} title={`${m} per recorded call`} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m}</button>)}</div></div>
    {!samples.length&&!compactions.length?<p className="muted">Waiting for the first recorded call.</p>:<>
      <svg onPointerDown={()=>inspection.blur()} onMouseEnter={()=>inspection.enter()} onMouseLeave={()=>inspection.leave()} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))inspection.blur();}} viewBox="0 0 580 155" role="group" aria-label={`${mode} for latest ${samples.length} calls; gray bars mark compaction in Cost and Tokens; dotted boundaries in Context and KPIs.`}>
        <text className="chart-unit" x="45" y="10">{showKpis?'USD / call':mode==='Cost'?'USD / event':mode==='Context'?'Input tokens / call':'Tokens / event'}</text><text x="0" y="24">{(mode==='Cost'||showKpis)?money(max):number(max)}</text><text x="22" y="133">0</text><line x1="45" x2="565" y1="130" y2="130" className="axis"/>

        {compactions.map(c=>{const key=compactionKey(c),cx=slotX(key),value=compactionValue(c);return <g key={key} className="history-compaction" tabIndex={0} role="button" aria-label={`Compaction · ${time(c.timestamp)} · ${c.source?compactionLabel(c as CompactionDetail):'Usage unavailable'} · ${mode==='Cost'?'API equivalent USD':'Request tokens'} ${value??'unavailable'}`} aria-pressed={pinned===key} onMouseEnter={()=>inspection.enter(key)} onFocus={e=>{if(e.target.matches(':focus-visible'))inspection.focus(key);}} onClick={()=>toggleInspection(key)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleInspection(key);}else if(e.key==='Escape')clearInspection();}}>
          <title>Compaction · {time(c.timestamp)} · {c.source?compactionLabel(c as CompactionDetail):'Usage unavailable'}</title>
          {activeKey===key&&<rect className="call-highlight" x={cx-width/2-2} width={width+4} y="12" height="118" rx="3"/>}
          <path className="compaction-marker" d={`M${cx-4},12h8l-4,6z`}/>
          {bars&&c.source?(value!=null?<rect className="compaction-bar" x={cx-width/2} width={width} y={y(value)} height={value/max*110}/>:<text className="compaction-unpriced" x={cx} y="127" textAnchor="middle">×</text>):<line x1={cx} x2={cx} y1="12" y2="130" className="compaction-line"/>}
          <rect x={cx-width/2} width={width} y="12" height="118" fill="transparent"/>
        </g>;})}
        {mode==='Context' && (['input','fresh'] as const).map(series=><path key={series} className={`series ${series}`} d={samples.map((c,i)=>{
          if(series==='fresh'&&c.cachedRecorded===false)return '';
          const connected=i>0&&(series==='input'||samples[i-1].cachedRecorded!==false);
          return `${connected?'L':'M'}${x(start+i)},${y(series==='input'?c.input:c.input-c.cached)}`;
        }).join(' ')}/>)}
        {samples.map((c,i)=>{let below=0; const parts=values[i];const key=callKey(c,i);return <g key={key} className="history-call" tabIndex={0} role="button" aria-label={describe(c,i)} aria-pressed={pinned===key} onMouseEnter={()=>inspection.enter(key)} onFocus={e=>{if(e.target.matches(':focus-visible'))inspection.focus(key);}} onClick={()=>toggleInspection(key)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleInspection(key);}else if(e.key==='Escape'){clearInspection();}}}>
          {activeKey===key&&<rect className="call-highlight" x={x(start+i)-width/2-2} width={width+4} y="12" height="118" rx="3"/>}{mode==='Context'?<circle cx={x(start+i)} cy={y(c.input)} r="3" className="point"/>:showKpis?null:parts?parts.map((n,j)=>{const bottom=below;below+=n;return n>0?<rect key={j} x={x(start+i)-width/2} width={width} y={y(below)} height={n/max*110} fill={categories[j].color}/>:null;}):<text x={x(start+i)} y="127" textAnchor="middle">×</text>}<rect x={x(start+i)-width/2} width={width} y="12" height="118" fill="transparent"/></g>;})}
        {showKpis&&(['contextPerCall','costPerCall'] as const).map((metric,j)=><path key={metric} className={`series ${j?'fresh':'input'} kpi-trend`} pointerEvents="none" aria-label={`Running ${j?'Cost':'Context'} / call KPI in USD`} d={smoothLine(samples.map((c,i)=>c[metric]==null?undefined:{x:x(start+i),y:y(c[metric])}))}/>)}
        {reference!=null&&<g className="chart-reference"><line x1="45" x2="565" y1={y(reference)} y2={y(reference)}/><text x="565" y={Math.max(22,y(reference)-5)} textAnchor="end">Comparable {money(reference)}</text></g>}
        <text x="45" y="150">Call {start+1}</text><text x="565" y="150" textAnchor="end">{s.callCount}</text>
      </svg>
      {(selected||selectedCompaction) && <div className={`inspect-shell${preview.closing?' closing':''}`} onMouseEnter={()=>inspection.enter()} onMouseLeave={()=>inspection.leave()} onPointerDown={()=>inspection.blur()} onFocus={e=>{if(e.target.matches(':focus-visible'))inspection.focus(activeKey??undefined);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))inspection.blur();}} onKeyDown={e=>{if(e.key==='Escape')clearInspection();}}><div className="inspect-inner"><div className="chart-inspect" role="status" aria-label={selectedCompaction?'Compaction details':`Call ${start+inspect+1} details`}>
        {selectedCompaction?(<>{selectedCompaction.source?<CompactionPreview c={selectedCompaction as CompactionDetail}/>:<p>Compaction · usage unavailable in this snapshot.</p>}{pinned&&<button className="inspect-clear" onClick={clearInspection}>Clear selection</button>}</>):selected&&<>
        <div className="inspect-header"><div><strong>Call {start+inspect+1}</strong>{selected.ordinal!=null&&<span className="inspect-ordinal">Ordinal {selected.ordinal}</span>}<span className="inspect-state">{activeKey===pinned?'Pinned':'Preview'}</span></div>{pinned&&<button className="inspect-clear" onClick={clearInspection}>Clear selection</button>}</div>
        {showKpis&&<p>Running context / call: <strong>{selected.contextPerCall==null?'—':`$${selected.contextPerCall.toFixed(6)}`}</strong> · {selected.contextPricedCalls??0} calls with priceable input through this call<br/>Running cost / call: <strong>{selected.costPerCall==null?'—':`$${selected.costPerCall.toFixed(6)}`}</strong> · {selected.costPricedCalls??0} priced calls through this call</p>}
        <div className="inspect-meta"><span>{selected.model??'Unknown model'} · {selected.serviceTier??'Standard assumed'}</span><time dateTime={selected.timestamp}>{time(selected.timestamp)}</time></div>
        <dl className="inspect-values">{[
          ['Input',selected.input],['Cached',selected.cachedRecorded===false?undefined:selected.cached],['Cache write',selected.cacheWriteRecorded===false?undefined:selected.cacheWrite],
          ['Output',selected.outputRecorded===false?undefined:selected.output],['Thinking',selected.reasoningRecorded===false?undefined:selected.reasoning]
        ].map(([label,value])=><div key={label as string}><dt>{label}</dt><dd>{exact(value as number|undefined)}</dd></div>)}<div className="inspect-cost"><dt>API equivalent</dt><dd>{selected.price?.total==null?'—':`$${selected.price.total.toFixed(6)}`}</dd></div></dl>
        {selected.price?.categories&&<dl className="inspect-values">{selected.price.categories.map((n,i)=><div key={i}><dt>{categories[i].label}</dt><dd title={String(n)}>{money(n)}</dd></div>)}</dl>}
        {selected.price?.rates&&<p className="inspect-rates">USD / 1M tokens · Input {selected.price.rates.input} · Read {selected.price.rates.cached} · Write {selected.price.rates.write??'—'} · Output {selected.price.rates.output}</p>}
        {selected.price?.issue&&<p className="warning">{selected.price.issue}</p>}
        {compactions.some(m=>Math.abs(m.callPosition-(start+inspect))<=.5)&&<p className="inspect-rates">Near compaction boundary</p>}
        <div className="inspect-activity" aria-label="Call activity"><h3>Activity</h3>
          {selected.activity?.response&&<p className="activity-response">{selected.activity.response}</p>}
          {!!selected.activity?.skills?.length&&<div className="activity-skills"><h4>Skills loaded</h4>{selected.activity.skills.map(skill=><p key={skill}>{skill}</p>)}<p className="inspect-rates">Detected from skill instruction reads for this call.</p></div>}
          {!!selected.activity?.tools.length&&<div className="activity-tools"><h4>Tool calls</h4>{selected.activity.tools.map((tool,i)=><p key={i}><strong>{tool.name}</strong>{tool.detail&&<span>{tool.detail}</span>}</p>)}</div>}
          {!!selected.activity?.files.length&&<div className="activity-files"><h4>File targets</h4>{selected.activity.files.map(file=><code key={file}>{file}</code>)}<p className="inspect-rates">From edit requests; successful changes are not verified here.</p></div>}
          {!selected.activity&&<p className="inspect-rates">No visible response or tool activity recorded for this call.</p>}
        </div>
      </>}</div></div></div>}
      <p className="hint">{showKpis?'Blue: Context / call (input cost ÷ calls with priceable input). Orange: Cost / call ((input + output cost + compaction charges) ÷ priced calls). Running thread averages through each call, including earlier calls outside this chart. ':''}{mode==='Context'?'Blue: input · Orange: fresh. ':''}Gray bars: compaction (recorded or estimated request tokens; full attributed cost). Dotted: compaction boundary in Context and KPIs. {mode==='Cost'?'×: unpriced call. ':''}Hover or focus for details. Click or press Enter to pin; repeat to clear.</p>
    </>}
    {!!slots.length && <details><summary title="Inspect retained call records">Exact call values ({samples.length} calls; {compactions.length} compactions)</summary><div className="table-scroll"><table><thead><tr><th>Call / model</th><th>Input</th><th>Read</th><th>Write</th><th>Output</th><th>Thinking</th><th>USD</th></tr></thead><tbody>{slots.map(slot=>{const i=samples.findIndex((c,j)=>callKey(c,j)===slot.key),c=samples[i];if(c)return <tr key={i} title={describe(c,i)}><th>{start+i+1}<small>{c.model??'—'}</small></th><td>{exact(c.input)}</td><td>{exact(c.cachedRecorded===false?undefined:c.cached)}</td><td>{exact(c.cacheWriteRecorded===false?undefined:c.cacheWrite)}</td><td>{exact(c.outputRecorded===false?undefined:c.output)}</td><td>{exact(c.reasoningRecorded===false?undefined:c.reasoning)}</td><td>{money(c.price?.total)}</td></tr>;const m=compactions.find(c=>compactionKey(c)===slot.key)!;return <tr key={slot.key}><th>Compaction<small>{m.source?compactionLabel(m as CompactionDetail):'Usage unavailable'}</small><small>{time(m.timestamp)}</small></th><td>{exact(m.usage?.input)}</td><td>{exact(m.usage?.cached)}</td><td>{exact(m.usage?.cacheWrite)}</td><td>{exact(m.usage?.output)}</td><td>{exact(m.usage?.reasoningRecorded?m.usage.reasoning:undefined)}</td><td>{money(m.totalCost)}</td></tr>;})}</tbody></table></div></details>}
  </section>;
}
export function MonitorView({s, expanded, scale, error='', onAction, onLayout, storage='host widget state', updates, onUpdate, updateError,onFilter,onStorage,resume,resumeBusy=false,resumeError,onResume}:
 {resume?:ResumeView;resumeBusy?:boolean;resumeError?:string;onResume?:(action:ResumeAction)=>void;onStorage?:()=>Promise<HistoryDiagnostics>;updates?:UpdateStatus;onUpdate?:(action:UpdateAction)=>void;updateError?:string;s:Monitor; expanded:boolean; scale:number; error?:string; onAction?:(action?:'select'|'rescan',taskId?:string)=>void;onFilter?:(query:string,includeArchived:boolean)=>void; onLayout?:(expanded:boolean,scale:number)=>void; storage?:string}) {
  const a=s.attribution, attributed=a?.contributors.reduce((sum,c)=>sum+c.tokens,0)??0;
  return <main className={`monitor ${expanded?'expanded':'compact'}`} style={{fontSize:`${scale*85}%`}}>
    <header className="compact-header"><ThreadPicker s={s} onSelect={onAction?id=>onAction('select',id):undefined} onFilter={onFilter}/><div className="header-controls"><button className="rescan-button" disabled={!onAction||s.discovery?.state==='scanning'} onClick={()=>onAction?.('rescan')} aria-label="Rescan threads" title="Rescan threads: discover restored and newly available local transcripts"><span className="rescan-text">Rescan threads</span><span className="rescan-icon" aria-hidden="true">⟳</span></button><button disabled={!onAction} onClick={()=>onAction?.()} aria-label="Refresh metrics" title="Refresh current telemetry">↻</button><Settings expanded={expanded} scale={scale} onLayout={onLayout} updates={updates} onUpdate={onUpdate} error={updateError}><HistoryStorage load={onStorage}/></Settings></div></header>
    <EfficiencyInsights s={s}/>
    {isDev&&onResume&&<ResumeControls value={resume} threadId={s.selectedId} title={s.task?.title} busy={resumeBusy} error={resumeError} onAction={onResume}/>}
    {s.discovery?.targeting&&<p className="hint" role="status">Looking for the current local thread…</p>}
    {(error||s.disconnected||s.available===false||!s.task)&&<p className="status" role="status">{error||s.status}</p>}
    <ThreadSummary s={s}/>{s.historyError&&<p role="status" className="warning">{s.historyError}</p>}<EfficiencyBanner data={s.efficiency}/><LatestCall s={s} expanded={expanded}/><History key={s.selectedId??s.task?.id??s.panelId} s={s}/>
    <details className="attribution" open={expanded}><summary title={attributionHelp}>Skills &amp; tools · {a?.skillCount??0} skills · {a?.callCount??0} calls · ≈{number(a?attributed:undefined)} ({s.input&&a?percent(attributed/s.input*100):'—'} of context)</summary><p>{attributionHelp}</p><ul>{a?.contributors.map(c=><li key={c.name}><span title={c.name}>{c.name}</span><span>{c.calls} calls · ≈{number(c.tokens)} · {s.input?percent(c.tokens/s.input*100):'—'}</span></li>)}</ul><p>{a?.afterCompaction?'Since compaction; summary attribution unavailable.':'Estimated contribution; actual retained context may differ.'}</p></details>
    <details><summary title="Selected local task metadata">Task details</summary><dl className="details-grid"><dt>Session</dt><dd>{s.task?.id??'—'}</dd><dt>Workspace</dt><dd>{s.task?.workspace??'—'}</dd><dt>Last call</dt><dd>{time(s.lastCall)}</dd><dt>Last event</dt><dd>{time(s.lastEvent)}</dd><dt>Status</dt><dd>{s.status}</dd></dl></details>
    <footer><span>{s.isCompacting?'Compacting…':s.awaitingPostCompactionCall?'Compacted · waiting for next call':`Call ${s.callCount??0}`}</span><time title={time(s.lastCall)}>{s.lastCall?new Date(s.lastCall).toLocaleTimeString():'No call yet'}</time></footer>
    <details className="help"><summary title="Monitor operation, assumptions and connection diagnostics">Help &amp; diagnostics</summary><p>Checks for changes every two seconds while visible without model turns. Transcript reads are incremental; unchanged revisions retain the current view. Context is the selected thread's latest reported input, or reduced context after compaction. Allowances refresh from the signed-in Codex account, with local catalogue telemetry as fallback; readings can lag account activity.</p><p>Choosing a thread inspects its usage until the next relevant automatic selection event. Closing leaves metadata hooks available. Unknown values are —. Expand individual sections to inspect details. No thread-compaction action is exposed by this plugin.</p><p>Full paths and transcript text stay in the collector. No remote monitoring or tool/compute charge estimates.</p><dl className="details-grid"><dt>Thread discovery</dt><dd>{s.discovery?.state??'—'} · index {s.discovery?.index??'—'}</dd><dt>Local history</dt><dd>{s.discovery?.readable??0} readable · {s.discovery?.missing??0} missing · {s.discovery?.unreadable??0} unreadable · {s.discovery?.malformed??0} malformed · {s.discovery?.excluded??0} excluded</dd><dt>Last completed discovery</dt><dd>{time(s.discovery?.lastCompleted)}</dd><dt>History availability</dt><dd>Counts reflect the latest check. Imported numeric summaries remain available when source files disappear. Recent numeric detail is kept for 90 days. Unimported history requires a readable transcript; rescan to discover restored files.</dd><dt>Selection</dt><dd>{s.selectionSource??'waiting'}</dd><dt>Following</dt><dd>{s.followingMode??'latest-hook'}</dd><dt>Connection</dt><dd>{s.disconnected?'Disconnected; retaining snapshot':'Connected'}</dd><dt>Layout storage</dt><dd>{storage}</dd><dt>Version</dt><dd>{installedVersion}</dd></dl></details>
  </main>;
}
