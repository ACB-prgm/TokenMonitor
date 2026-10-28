import React, {useEffect,useState} from 'react';
import {InspectionController,type Inspection} from './inspection.js';
import {installedVersion} from '../../shared/version.js';
import {displayName,isDev} from '../../shared/identity.js';
import {UpdateMenu,type UpdateAction} from './updates.js';
import type {CompactionForecast,RollingEstimate} from '../../server/src/metrics.js';
import type {CallActivity} from '../../server/src/activity.js';
import type {Allowance} from '../../server/src/allowances.js';
import type {UpdateStatus} from '../../server/src/updates.js';
import {categories, composition, number, exact, percent, money, threadAllowanceEstimate, type Price, type Usage} from './analytics.js';
export {number} from './analytics.js';
export type Sample = { activity?: CallActivity; model?: string; serviceTier?: string; cachedRecorded?: boolean; cacheWriteRecorded?: boolean; price?: Price; ordinal?: number; timestamp: string; input: number; cached: number; output: number; reasoning: number; cacheWrite?: number; outputRecorded?: boolean; reasoningRecorded?: boolean };
export type Task = { id: string; title: string; workspace?: string };
export type Monitor = { panelId: string; revision?: string; unchanged?: boolean; task?: Task; selectedId?: string;
  status: string; selectionSource?: string; followingMode?: string; disconnected?: boolean;
  available?: boolean; input?: number; cached?: number; fresh?: number; contextLimit?: number; contextPercent?: number;
  contextHealth?: number; freshHealth?: number; model?: string; effort?: string; callCount?: number;
  samples?: Sample[]; compactions?: {timestamp: string; callPosition: number}[]; isCompacting?: boolean;
  awaitingPostCompactionCall?: boolean; lastCall?: string; lastEvent?: string; cacheTemperature?: string;
  fiveHour?: Allowance; weekly?: Allowance;
  compactionValue?: CompactionForecast;
  attribution?: {contributors: {name: string; calls: number; tokens: number}[]; skillCount: number; callCount: number; afterCompaction: boolean};
  usage?: Usage; outputTotals?: {total?: number; reasoning?: number; source: string}; tasks?: Task[]; completedAt?: string };
const time = (date?: string) => date ? new Date(date).toLocaleString() : '—';
const quota = (a?: Allowance) => a?.awaitingRefresh ? 'Awaiting refresh' : a ? percent(Math.min(100,Math.max(0,100-a.used))) : '—';
const attributionHelp = 'Estimate from recorded tool arguments and result text, about 4 characters per token, bounded by latest input. Covers retained history, not the entire session. Wrapped calls count once. Images, hidden tool schemas and skill catalogs are excluded. Compaction summaries cannot be attributed.';
const cacheHelp = 'Predicted cache availability before the next call: warm under 30 minutes; uncertain through 120 minutes; presumed cold afterward. Actual cache reuse may differ.';
const compactionHelp = 'Compaction Value estimates the percentage of avoidable context-processing cost saved over the next 20 calls, including compaction overhead and long-context pricing.';
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
function ThreadSummary({u, calls, reported}: {u?: Usage; calls: number; reported?: Monitor['outputTotals']}) {
  const partial = !!u && (u.unpricedCalls>0 || u.cumulativeMismatch);
  const allowance = threadAllowanceEstimate(u);
  const tokens = u?.cacheComplete && u.outputComplete ? composition(u.input,u.cached,u.cacheWrite,u.output,u.reasoningComplete?u.reasoning:undefined) : undefined;
  return <section className="thread-usage" aria-label="Thread usage">
    <div className="section-title"><h2>Thread usage</h2><span>{calls} recorded calls</span></div>
    <div className="spend" title="Theoretical token cost using verified current API rates per recorded call. Not a Codex subscription charge."><strong>{u?.pricedCalls ? money(u.cost) : '—'}</strong><span>Estimated API-equivalent cost for this thread{partial?' · partial':''}</span></div>
    <div className="usage-line" aria-label="Estimated thread allowance usage" title="Full recorded thread cost × your fixed multipliers, in percentage points. Not limited to calls within the current allowance windows; values may exceed 100%."><span>Est. allowance used{partial?' · partial':''}</span><span>5-hour <b>{allowance?`≈${percent(allowance.fiveHour)}`:'—'}</b></span><span>Weekly (7d) <b>{allowance?`≈${percent(allowance.weekly)}`:'—'}</b></span></div>
    <div className="usage-line"><span title="Sum of recorded per-call inputs, including repeated context reads">Input <b>{number(u?.input)}</b></span><span title="Cumulative recorded output; thinking included">Output <b>{number(u?.outputComplete?u.output:undefined)}</b></span><span title="Recorded input + output; repeated context is counted on every call">Volume <b>{number(u?.outputComplete?u.input+u.output:undefined)}</b></span></div>
    <div className="usage-line muted"><span title="Cache-read tokens divided by all recorded input tokens">Cached {u?.cacheComplete && u.input ? percent(u.cached/u.input*100):'—'}</span><span title="Hypothetical ordinary-input cost minus observed input cost. Includes reported cache-write premiums. Priced calls only.">Cache savings {u?.pricedCalls?money(u.cacheSavings):'—'}{u?.unpricedCalls?' (priced calls)':''}</span></div>
    <Stack label="Token composition" values={tokens}/><Stack label={u?.unpricedCalls?"Cost composition (priced calls)":"Cost composition"} values={u?.pricedCalls?u.costCategories:undefined} cost/>
    <div className="legend">{categories.filter((_,i)=>i!==5 || (tokens?.[5]??u?.costCategories[5]??0)>0).map(c=><span key={c.label}><i style={{background:c.color}}/>{c.label}</span>)}</div>
    <details><summary title="Show exact category totals, rates and coverage">Pricing &amp; accounting details</summary>
      <p>API-equivalent estimate only; your subscription allowances are separate. {u?.coverage ?? 'Waiting for usage records.'} Rates verified {u?.verifiedAt ?? '—'}; current rates are applied to historical calls, not historical invoices.</p>
      <p>Thread allowance estimates use your fixed calibration: 12.9 percentage points per $1 for 5-hour usage (≈$7.75 per 100 points), and 2.1 for weekly (7-day) usage (≈$47.62 per 100 points). They convert this thread’s full recorded API-equivalent cost, across resets, without a rolling-window filter. Actual account allowances appear above. Partial pricing produces partial estimates; unpriced calls are excluded.</p>
      <p>Models: {u?.models.join(', ') || 'Unknown'}. {u?.pricedCalls ?? 0} priced / {calls} recorded calls. {u?.assumedTierCalls ?? 0} calls assume Standard tier because tier was absent or automatic. Region premiums apply only when explicitly recorded. Separately billed tools, search, images and compute are excluded.</p>
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
  const last=s.samples?.at(-1), value=s.compactionValue;
  const cached=last?.cachedRecorded===false?undefined:last?.cached;
  const fresh=last&&cached!=null?last.input-cached:undefined;
  const cachedPercent=last?.input&&cached!=null?cached/last.input*100:undefined;
  const freshPercent=last?.input&&fresh!=null?fresh/last.input*100:undefined;
  const warmthColor=s.cacheTemperature==='WARM'?'var(--green)':s.cacheTemperature==='UNCERTAIN'?health(1):s.cacheTemperature?health(2.5):'var(--muted)';
  return <details className="latest-call" open={expanded}>
    <summary title="Expand latest call details and compaction value"><span className="latest-bar">
      <strong>Latest<span className="wide-label"> call</span></strong>
      <span title={`Latest call input: ${exact(last?.input)} tokens; ${percent(cachedPercent)} cached`}><span className="wide-label">Input</span><span className="narrow-label">In</span> <b>{number(last?.input)}</b> ({percent(cachedPercent)})</span>
      <span className="bar-divider" aria-hidden="true">|</span>
      <span title="Latest call output, including thinking"><span className="wide-label">Output</span><span className="narrow-label">Out</span> <b>{number(last?.outputRecorded===false?undefined:last?.output)}</b></span>
      <span className="bar-divider" aria-hidden="true">|</span>
      <span title={cacheHelp} aria-label={`Cache warmth: ${s.cacheTemperature??'Unavailable'}`} style={{color:warmthColor}}><i className="warmth-dot" aria-hidden="true"/>{s.cacheTemperature??'—'}</span>
      <span className="bar-divider" aria-hidden="true">|</span>
      <span title={compactionHelp} aria-label={`Compaction value: ${value?.category??'Unavailable'}`}><span>CV</span> <b style={{color:health(value?.score==null?0:value.score/100*3)}}>{value?.score==null?'—':`${value.score}/100`}</b></span>
    </span></summary><div className="latest-body"><h2>Latest call · {money(last?.price?.total)}</h2>{!last&&<p>Waiting for the first recorded call.</p>}<dl className="metrics"><Metric label={`Cached (${percent(cachedPercent)})`} value={cached}/><Metric label={`Fresh (${percent(freshPercent)})`} value={fresh}/><Metric label="Input" value={last?.input}/><Metric label="Output (incl. thinking)" value={last?.outputRecorded===false?undefined:last?.output}/><Metric label="Thinking" value={last?.reasoningRecorded===false?undefined:last?.reasoning}/><Metric label="Cache write" value={last?.cacheWriteRecorded===false?undefined:last?.cacheWrite}/></dl><p title={cacheHelp}>Cache <b style={{color:warmthColor}}>{s.cacheTemperature??'—'}</b>. {cacheHelp}</p><p>{last?.model??'Model unknown'} · {last?.serviceTier??'Standard assumed'} · {time(last?.timestamp)}</p>{last?.price?.rates&&<p>USD / 1M: input {money(last.price.rates.input)}, read {money(last.price.rates.cached)}, write {money(last.price.rates.write)}, output {money(last.price.rates.output)}.</p>}
    {last?.price?.issue&&<p className="warning">{last.price.issue}</p>}
    <CompactionDetails value={value}/>
    </div></details>;
}
function estimateSource(estimate?:RollingEstimate) {
  if(!estimate)return 'Assumptions unavailable';
  return `${estimate.fallback?'Default (insufficient data)':'Observed'} · ${estimate.sampleCount} samples${estimate.minimumApplied?' · minimum applied':''}${estimate.observed==null?'':` · observed ${exact(estimate.observed)}`}`;
}
function CompactionDetails({value:v}:{value?:CompactionForecast}) {
  const available=v?.status==='available';
  return <div className="latest-compaction"><h2 title={compactionHelp}>Compaction Value · <b style={{color:health(v?.score==null?0:v.score/100*3)}}>{v?.score==null?'—':`${v.score}/100`}</b>{v&&` · ${v.category}`}</h2>
    <p>{compactionHelp}</p>
    {v?.limitation&&<p className="warning">{v.limitation}{v.status==='limited'?` (${v.completedCalls}/${v.horizonCalls} calls possible).`:''}</p>}
    <dl className="details-grid">
      <dt>Context estimate</dt><dd>{number(v?.currentInput)} → {number(v?.estimatedInput)} tokens</dd>
      <dt>Growth / call</dt><dd>{number(v?.growthPerCall)} tokens · {estimateSource(v?.assumptions.growth)}</dd>
      <dt>Output / call (incl. thinking)</dt><dd>{number(v?.typicalOutput)} tokens · {estimateSource(v?.assumptions.output)}{v?.assumptions.output&&(v.assumptions.output.activeModelOnly?' · active model':' · thread samples')}</dd>
      <dt>Forecast horizon</dt><dd>{v?.horizonCalls??20} normal calls</dd>
      <dt>Break-even</dt><dd>{available?(v.breakEvenCalls==null?`>${v.horizonCalls} calls`:`${v.breakEvenCalls} calls`):'Unavailable'}</dd>
      <dt>Compaction overhead</dt><dd>{money(v?.compactionOverheadUsd??undefined)} · {number(v?.compactionOutput)} output tokens + replacement cache write</dd>
      <dt>Net estimated savings</dt><dd>{money(v?.netSavingsUsd??undefined)}</dd>
      <dt>Avoidable cost baseline</dt><dd>{money(v?.avoidableCostUsd??undefined)}</dd>
      <dt>Active model</dt><dd>{v?.model??'Unknown'} · {v?.serviceTier??'Standard assumed'}{v?.regionalProcessing?' · regional processing':''}</dd>
      <dt>Assumptions</dt><dd>40K retained context · warm-prefix reuse · {v?.assumptions.pricingAvailable?'verified API rates':'pricing unavailable'}{v?.assumptions.assumedTier?' · Standard tier assumed':''}{v&&!v.assumptions.contextLimitKnown?' · context limit unknown':''}</dd>
    </dl>
    <p>API-equivalent estimates, not subscription charges. Cache temperature is separate; future cache misses may change savings. Financial value does not guarantee context preservation.</p>
  </div>;
}
function History({s}: {s: Monitor}) {
  const [mode,setMode] = useState<'Cost'|'Tokens'|'Context'>('Cost');
  const [preview,setPreview]=useState<Inspection>({hovered:null,focused:null,pinned:null,closing:false});
  const [inspection]=useState(()=>new InspectionController(setPreview,()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false));
  useEffect(()=>()=>inspection.dispose(),[inspection]);
  const {hovered,focused,pinned}=preview;
  const samples=s.samples??[], compactions=s.compactions??[];
  const start=(s.callCount??samples.length)-samples.length;
  const callKey=(c:Sample,i:number)=>`${start+i}:${c.timestamp}`;
  const activeKey=hovered??focused??pinned;
  const inspect=samples.findIndex((c,i)=>callKey(c,i)===activeKey);
  const selected=inspect>=0?samples[inspect]:undefined;
  const retainedKeys=samples.map(callKey).join('|');
  useEffect(()=>inspection.retain(new Set(retainedKeys.split('|'))),[inspection,retainedKeys]);
  const clearInspection=()=>inspection.clear();
  const toggleInspection=(key:string)=>inspection.pin(key);
  const end=Math.max(start+1,(s.callCount??samples.length)-1,...compactions.map(c=>c.callPosition));
  const values=samples.map(c=>mode==='Cost'?c.price?.categories:sampleTokens(c));
  const max=Math.max(.000001,...samples.map((c,i)=>mode==='Context'?c.input:values[i]?.reduce((a,b)=>a+b,0)??0));
  const x=(i:number)=>45+(i-start)/(end-start)*510, y=(n:number)=>130-n/max*110;
  const describe=(c:Sample,i:number)=>`Call ${start+i+1}${c.ordinal!=null?` · ordinal ${c.ordinal}`:''} · ${c.model??'Unknown model'} · ${time(c.timestamp)}\nInput ${exact(c.input)} · Cached ${exact(c.cachedRecorded===false?undefined:c.cached)} · Cache write ${exact(c.cacheWriteRecorded===false?undefined:c.cacheWrite)}\nOutput ${exact(c.outputRecorded===false?undefined:c.output)} · Thinking ${exact(c.reasoningRecorded===false?undefined:c.reasoning)}\nAPI equivalent ${c.price?.total==null?'—':`$${c.price.total.toFixed(6)}`}${c.price?.rates?` · USD/1M input ${c.price.rates.input}, read ${c.price.rates.cached}, write ${c.price.rates.write??'—'}, output ${c.price.rates.output}`:''} · ${c.serviceTier??'Standard assumed'}${c.price?.issue?` · ${c.price.issue}`:''}${compactions.some(m=>Math.abs(m.callPosition-(start+i))<=.5)?' · Near compaction boundary':''}`;
  return <section className="history" aria-label="Recent call history"><div className="section-title"><h2>Recent calls</h2><div className="segmented" role="group" aria-label="History view">{(['Cost','Tokens','Context'] as const).map(m=><button key={m} title={`${m} per recorded call`} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m}</button>)}</div></div>
    {!samples.length?<p className="muted">Waiting for the first recorded call.</p>:<>
      <svg onMouseEnter={()=>inspection.enter()} onMouseLeave={()=>inspection.leave()} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))inspection.blur();}} viewBox="0 0 580 155" role="group" aria-label={`${mode} for latest ${samples.length} calls; dotted lines mark compaction.`}>
        <text x="0" y="24">{mode==='Cost'?money(max):number(max)}</text><text x="22" y="133">0</text><line x1="45" x2="565" y1="130" y2="130" className="axis"/>
        {compactions.map(c=><g key={c.timestamp}><title>Context compacted · {time(c.timestamp)}</title><line x1={x(c.callPosition)} x2={x(c.callPosition)} y1="12" y2="130" className="compaction-line"/></g>)}
        {mode==='Context' && (['input','fresh'] as const).map(series=><polyline key={series} className={`series ${series}`} points={samples.map((c,i)=>`${x(start+i)},${y(series==='input'?c.input:c.input-c.cached)}`).join(' ')}/>)}
        {samples.map((c,i)=>{let below=0; const parts=values[i];const key=callKey(c,i);return <g key={key} className="history-call" tabIndex={0} role="button" aria-label={describe(c,i)} aria-pressed={pinned===key} onMouseEnter={()=>inspection.enter(key)} onFocus={()=>inspection.focus(key)} onClick={()=>toggleInspection(key)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleInspection(key);}else if(e.key==='Escape'){clearInspection();}}}>
          {activeKey===key&&<rect className="call-highlight" x={x(start+i)-Math.min(8,230/samples.length)-2} width={Math.min(16,460/samples.length)+4} y="12" height="118" rx="3"/>}{mode==='Context'?<circle cx={x(start+i)} cy={y(c.input)} r="3" className="point"/>:parts?parts.map((n,j)=>{const bottom=below;below+=n;return n>0?<rect key={j} x={x(start+i)-Math.min(8,230/samples.length)} width={Math.min(16,460/samples.length)} y={y(below)} height={n/max*110} fill={categories[j].color}/>:null;}):<text x={x(start+i)} y="127" textAnchor="middle">×</text>}<rect x={x(start+i)-Math.min(8,230/samples.length)} width={Math.min(16,460/samples.length)} y="12" height="118" fill="transparent"/></g>;})}
        <text x="45" y="150">Call {start+1}</text><text x="565" y="150" textAnchor="end">{s.callCount}</text>
      </svg>
      {selected && <div className={`inspect-shell${preview.closing?' closing':''}`} onMouseEnter={()=>inspection.enter()} onMouseLeave={()=>inspection.leave()} onFocus={()=>inspection.focus(activeKey??undefined)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))inspection.blur();}} onKeyDown={e=>{if(e.key==='Escape')clearInspection();}}><div className="inspect-inner"><div className="chart-inspect" role="status" aria-label={`Call ${start+inspect+1} details`}>
        <div className="inspect-header"><div><strong>Call {start+inspect+1}</strong>{selected.ordinal!=null&&<span className="inspect-ordinal">Ordinal {selected.ordinal}</span>}<span className="inspect-state">{activeKey===pinned?'Pinned':'Preview'}</span></div>{pinned&&<button className="inspect-clear" onClick={clearInspection}>Clear selection</button>}</div>
        <div className="inspect-meta"><span>{selected.model??'Unknown model'} · {selected.serviceTier??'Standard assumed'}</span><time dateTime={selected.timestamp}>{time(selected.timestamp)}</time></div>
        <dl className="inspect-values">{[
          ['Input',selected.input],['Cached',selected.cachedRecorded===false?undefined:selected.cached],['Cache write',selected.cacheWriteRecorded===false?undefined:selected.cacheWrite],
          ['Output',selected.outputRecorded===false?undefined:selected.output],['Thinking',selected.reasoningRecorded===false?undefined:selected.reasoning]
        ].map(([label,value])=><div key={label as string}><dt>{label}</dt><dd>{exact(value as number|undefined)}</dd></div>)}<div className="inspect-cost"><dt>API equivalent</dt><dd>{selected.price?.total==null?'—':`$${selected.price.total.toFixed(6)}`}</dd></div></dl>
        {selected.price?.rates&&<p className="inspect-rates">USD / 1M tokens · Input {selected.price.rates.input} · Read {selected.price.rates.cached} · Write {selected.price.rates.write??'—'} · Output {selected.price.rates.output}</p>}
        {selected.price?.issue&&<p className="warning">{selected.price.issue}</p>}
        {compactions.some(m=>Math.abs(m.callPosition-(start+inspect))<=.5)&&<p className="inspect-rates">Near compaction boundary</p>}
        <div className="inspect-activity" aria-label="Call activity"><h3>Activity</h3>
          {selected.activity?.response&&<p className="activity-response">{selected.activity.response}</p>}
          {!!selected.activity?.tools.length&&<div className="activity-tools">{selected.activity.tools.map((tool,i)=><p key={i}><strong>{tool.name}</strong>{tool.detail&&<span>{tool.detail}</span>}</p>)}</div>}
          {!!selected.activity?.files.length&&<div className="activity-files"><h4>File targets</h4>{selected.activity.files.map(file=><code key={file}>{file}</code>)}<p className="inspect-rates">From edit requests; successful changes are not verified here.</p></div>}
          {!selected.activity&&<p className="inspect-rates">No visible response or tool activity recorded for this call.</p>}
        </div>
      </div></div></div>}
      <p className="hint">{mode==='Context'?'Blue: input · Orange: fresh. ':''}Dotted: compaction. {mode==='Cost'?'×: unpriced call. ':''}Hover or focus for details. Click or press Enter to pin; repeat to clear.</p>
    </>}
    {!!samples.length && <details><summary title="Inspect retained call records">Exact call values ({samples.length})</summary><div className="table-scroll"><table><thead><tr><th>Call / model</th><th>Input</th><th>Read</th><th>Write</th><th>Output</th><th>Thinking</th><th>USD</th></tr></thead><tbody>{samples.map((c,i)=><tr key={i} title={describe(c,i)}><th>{start+i+1}<small>{c.model??'—'}</small></th><td>{exact(c.input)}</td><td>{exact(c.cachedRecorded===false?undefined:c.cached)}</td><td>{exact(c.cacheWriteRecorded===false?undefined:c.cacheWrite)}</td><td>{exact(c.outputRecorded===false?undefined:c.output)}</td><td>{exact(c.reasoningRecorded===false?undefined:c.reasoning)}</td><td>{money(c.price?.total)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
export function MonitorView({s, expanded, scale, error='', onAction, onLayout, storage='host widget state', updates, onUpdate, updateError}:
 {updates?:UpdateStatus;onUpdate?:(action:UpdateAction)=>void;updateError?:string;s:Monitor; expanded:boolean; scale:number; error?:string; onAction?:(action?:'select',taskId?:string)=>void; onLayout?:(expanded:boolean,scale:number)=>void; storage?:string}) {
  const a=s.attribution, attributed=a?.contributors.reduce((sum,c)=>sum+c.tokens,0)??0;
  const tasks=[...(s.tasks??[])];if(s.task&&!tasks.some(t=>t.id===s.task?.id))tasks.unshift(s.task);
  return <main className={`monitor ${expanded?'expanded':'compact'}`} style={{fontSize:`${scale*85}%`}}>
    <header><div className="brand"><strong>{displayName}</strong>{isDev?<span className="version">{installedVersion}</span>:<UpdateMenu value={updates} onAction={onUpdate} error={updateError}/>}</div><div className="header-controls"><label title="Scale dashboard text and spacing">Scale <select aria-label="Layout scale" value={scale} onChange={e=>onLayout?.(expanded,Number(e.target.value))}><option value="0.85">85%</option><option value="1">100%</option><option value={1/.85}>118%</option><option value={1.15/.85}>135%</option></select></label><button disabled={!onAction} onClick={()=>onAction?.()} aria-label="Refresh monitor" title="Refresh local metrics and task list">↻</button></div></header>
    <div className="task-controls"><label className="task-picker"><span className="sr-only">Monitored task</span><select disabled={!onAction||!tasks.length} value={s.selectedId??''} onChange={e=>onAction?.('select',e.target.value)} title={`Select monitored thread: ${s.task?.title??'Waiting'}`}><option value="" disabled>Waiting for local task…</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.title} · {t.id.slice(-8)}</option>)}</select></label></div>
    <section className="capacity" aria-label="Thread capacity and account allowances"><div className="section-title"><h2 title="Selected thread's latest reported context occupancy; not cumulative usage">Context window{s.awaitingPostCompactionCall?' ≈':''}</h2><span style={{color:health(s.contextHealth)}} title={`${exact(s.input)} / ${exact(s.contextLimit)} tokens`}>{number(s.input)} / {number(s.contextLimit)} · {percent(s.contextPercent)}</span></div><progress aria-label="Context window used" value={Math.min(100,Math.max(0,s.contextPercent??0))} max="100" style={{'--context-color':health(s.contextHealth)} as React.CSSProperties}/><div className="allowances" aria-label="Account subscription allowances">{[['5 Hour',s.fiveHour],['Weekly',s.weekly]].map(([label,v])=>{const q=v as Monitor['fiveHour'];return <div key={label as string} title={`Account-level subscription allowance · ${q?.source==='live'?'Live Codex account':q?.source==='catalogue'?'Local catalogue fallback (may be incomplete)':'Source unavailable'} · Observed ${time(q?.observedAt)}${q?.stale?' · Stale':''}`}><div><b>{label as string}:</b> {quota(q)}{q?.awaitingRefresh?'':' remaining'}</div><small>Resets {time(q?.reset)}</small></div>;})}</div></section>
    <div className="following"><span className={s.disconnected||s.available===false?'offline':'live'}/>{s.followingMode==='host-chat'?'Following this chat':'Following latest hook activity'}{s.selectionSource==='manual'?' · inspecting another task':''}<span className="model" title={`${s.model??'Model unknown'} · ${s.effort??'Effort unknown'}`}>{s.model??'Model unknown'} · {s.effort??'—'}</span></div>
    {(error||s.disconnected||s.available===false||!s.task||s.isCompacting)&&<p className="status" role="status">{error||s.status}</p>}
    <ThreadSummary u={s.usage} calls={s.callCount??0} reported={s.outputTotals}/><LatestCall s={s} expanded={expanded}/><History key={s.selectedId??s.task?.id??s.panelId} s={s}/>
    <details className="attribution" open={expanded}><summary title={attributionHelp}>Skills &amp; tools · {a?.skillCount??0} skills · {a?.callCount??0} calls · ≈{number(a?attributed:undefined)} ({s.input&&a?percent(attributed/s.input*100):'—'} of context)</summary><p>{attributionHelp}</p><ul>{a?.contributors.map(c=><li key={c.name}><span title={c.name}>{c.name}</span><span>{c.calls} calls · ≈{number(c.tokens)} · {s.input?percent(c.tokens/s.input*100):'—'}</span></li>)}</ul><p>{a?.afterCompaction?'Since compaction; summary attribution unavailable.':'Estimated contribution; actual retained context may differ.'}</p></details>
    <details><summary title="Selected local task metadata">Task details</summary><dl className="details-grid"><dt>Session</dt><dd>{s.task?.id??'—'}</dd><dt>Workspace</dt><dd>{s.task?.workspace??'—'}</dd><dt>Last call</dt><dd>{time(s.lastCall)}</dd><dt>Last event</dt><dd>{time(s.lastEvent)}</dd><dt>Status</dt><dd>{s.status}</dd></dl></details>
    <footer><span>{s.isCompacting?'Compacting…':s.awaitingPostCompactionCall?'Compacted · waiting for next call':`Call ${s.callCount??0}`}</span><time title={time(s.lastCall)}>{s.lastCall?new Date(s.lastCall).toLocaleTimeString():'No call yet'}</time></footer>
    <details className="help"><summary title="Monitor operation, assumptions and connection diagnostics">Help &amp; diagnostics</summary><p>Checks for changes every two seconds while visible without model turns. Transcript reads are incremental; unchanged revisions retain the current view. Context is the selected thread's latest reported input, or reduced context after compaction. Allowances are account-level values last observed in that thread and can lag activity elsewhere.</p><p>Choosing a thread inspects its usage until the next relevant automatic selection event. Closing leaves metadata hooks available. Unknown values are —. Expand individual sections to inspect details. No thread-compaction action is exposed by this plugin.</p><p>Full paths and transcript text stay in the collector. No remote monitoring or tool/compute charge estimates.</p><dl className="details-grid"><dt>Selection</dt><dd>{s.selectionSource??'waiting'}</dd><dt>Following</dt><dd>{s.followingMode??'latest-hook'}</dd><dt>Connection</dt><dd>{s.disconnected?'Disconnected; retaining snapshot':'Connected'}</dd><dt>Layout storage</dt><dd>{storage}</dd><dt>Version</dt><dd>{installedVersion}</dd></dl></details>
  </main>;
}
