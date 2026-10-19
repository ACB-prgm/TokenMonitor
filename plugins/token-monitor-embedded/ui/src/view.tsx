import React from 'react';
export type Sample = { timestamp: string; input: number; cached: number; output: number; reasoning: number; cacheWrite?: number; outputRecorded?: boolean; reasoningRecorded?: boolean };
export type Task = { id: string; title: string; workspace?: string };
export type Monitor = { panelId: string; revision?: string; unchanged?: boolean; task?: Task; selectedId?: string;
  status: string; selectionSource?: string; followingMode?: string; locked?: boolean; disconnected?: boolean;
  available?: boolean; input?: number; cached?: number; fresh?: number; contextLimit?: number; contextPercent?: number;
  contextHealth?: number; freshHealth?: number; model?: string; effort?: string; callCount?: number;
  samples?: Sample[]; compactions?: {timestamp: string; callPosition: number}[]; isCompacting?: boolean;
  awaitingPostCompactionCall?: boolean; lastCall?: string; lastEvent?: string; cacheTemperature?: string;
  fiveHour?: {used: number; reset?: string}; weekly?: {used: number; reset?: string};
  compactionValue?: {category: string; level: number; currentInput: number; estimatedInput: number; breakEvenCalls?: number};
  attribution?: {contributors: {name: string; calls: number; tokens: number}[]; skillCount: number; callCount: number; afterCompaction: boolean};
  outputTotals?: {total?: number; reasoning?: number; source: string}; tasks?: Task[]; completedAt?: string };
export const number = (n?: number | null) => n == null ? '—' : Math.abs(n) >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const exact = (n?: number | null) => n == null ? 'Unknown' : n.toLocaleString();
const percent = (n?: number | null) => n == null ? '—' : `${n.toFixed(0)}%`;
const time = (date?: string) => date ? new Date(date).toLocaleString() : '—';
const quota = (a?: {used: number}) => a ? percent(Math.min(100, Math.max(0, 100 - a.used))) : '—';
const attributionHelp = 'Estimate from recorded tool arguments and result text, about 4 characters per token, bounded by latest input. Covers retained history, not the entire session. Wrapped calls count once. Images, hidden tool schemas and skill catalogs are excluded. Compaction summaries cannot be attributed.';
const cacheHelp = 'Predicted cache availability before the next call: warm under 30 minutes; uncertain through 120 minutes; presumed cold afterward. Actual cache reuse may differ.';
const compactionHelp = 'Cost-only estimate of when compacting becomes cheaper. Includes estimated compaction output; the current-context read common to both choices cancels. Cache temperature does not change this estimate. Assumes 10% cached-read cost, 30% retained context (minimum 40,000), and 3,600 compaction output tokens. Compacting may discard useful detail.';
function health(level = 0) {
  const stops = ['var(--ink)','var(--health-amber)','var(--health-orange)','var(--health-red)'];
  const x = Math.min(3,Math.max(0,level)), i = Math.min(2,Math.floor(x));
  return `color-mix(in srgb, ${stops[i]} ${(1-(x-i))*100}%, ${stops[i+1]})`;
}
function Metric({label, value, level = 0, help}: {label: string; value?: number | null; level?: number; help?: string}) {
  return <div className="metric" title={`${help ?? label}: ${exact(value)} tokens`}><dt>{label}</dt><dd style={{color: health(level)}}>{number(value)}</dd></div>;
}
function History({s}: {s: Monitor}) {
  const samples = s.samples ?? [], compactions = s.compactions ?? [];
  if (!samples.length) return <p className="muted">Waiting for the first recorded call.</p>;
  const start = (s.callCount ?? samples.length) - samples.length;
  const end = Math.max(start + 1, (s.callCount ?? samples.length) - 1, ...compactions.map(c => c.callPosition));
  const max = Math.max(1, ...samples.map(c => c.input));
  const x = (i: number) => 45 + (i - start) / (end - start) * 510;
  const y = (n: number) => 130 - n / max * 110;
  return <section className="history" aria-label="Recent call history">
    <div className="section-title"><h2>Recent calls</h2><span><i className="input-key" />Input <i className="fresh-key" />Fresh</span></div>
    <svg viewBox="0 0 570 155" role="img" aria-label={`Input and fresh tokens for the latest ${samples.length} calls. Dotted lines mark compaction.`}>
      <text x="2" y="24">{number(max)}</text><text x="22" y="133">0</text>
      <line x1="45" x2="555" y1="130" y2="130" className="axis" />
      {compactions.map(c => <g key={c.timestamp} tabIndex={0} aria-label={`Context compacted ${time(c.timestamp)}`}><title>Context compacted · {time(c.timestamp)}</title><line x1={x(c.callPosition)} x2={x(c.callPosition)} y1="12" y2="130" className="compaction-line" /></g>)}
      {(['input','fresh'] as const).map(series => <polyline key={series} className={`series ${series}`} points={samples.map((c,i) => `${x(start+i)},${y(series === 'input' ? c.input : c.input-c.cached)}`).join(' ')} />)}
      {samples.map((c,i) => <circle key={i} cx={x(start+i)} cy={y(c.input)} r="3" className="point" tabIndex={0} aria-label={`Call ${start+i+1}, input ${exact(c.input)}, fresh ${exact(c.input-c.cached)}, ${time(c.timestamp)}`}><title>{`Call ${start+i+1} · ${time(c.timestamp)}\nInput ${exact(c.input)} · Cached ${exact(c.cached)} · Fresh ${exact(c.input-c.cached)}\nOutput ${exact(c.outputRecorded === false ? undefined : c.output)} · Thinking ${exact(c.reasoningRecorded === false ? undefined : c.reasoning)}`}</title></circle>)}
      <text x="45" y="150">Call {start+1}</text><text x="555" y="150" textAnchor="end">{s.callCount}</text>
    </svg>
    <details><summary>Exact call values ({samples.length})</summary><div className="table-scroll"><table><thead><tr><th>Call</th><th>Input</th><th>Cached</th><th>Fresh</th><th>Output</th><th>Thinking</th></tr></thead><tbody>{samples.map((c,i)=><tr key={i} title={time(c.timestamp)}><td>{start+i+1}</td><td>{exact(c.input)}</td><td>{exact(c.cached)}</td><td>{exact(c.input-c.cached)}</td><td>{exact(c.outputRecorded === false ? undefined : c.output)}</td><td>{exact(c.reasoningRecorded === false ? undefined : c.reasoning)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
export function MonitorView({s, expanded, scale, busy = false, error = '', onAction, onLayout, storage = 'host widget state'}:
 {s: Monitor; expanded: boolean; scale: number; busy?: boolean; error?: string; onAction?: (action?: 'select'|'lock'|'unlock', taskId?: string)=>void; onLayout?: (expanded: boolean, scale: number)=>void; storage?: string}) {
  const a = s.attribution, attributed = a?.contributors.reduce((sum,c)=>sum+c.tokens,0) ?? 0;
  const value = s.compactionValue, totals = s.outputTotals;
  const remaining = totals?.total != null && totals?.reasoning != null ? totals.total - totals.reasoning : undefined;
  const last = s.samples?.at(-1);
  const tasks = [...(s.tasks ?? [])]; if (s.task && !tasks.some(t=>t.id===s.task?.id)) tasks.unshift(s.task);
  const cachedPercent = s.input && s.cached != null ? s.cached / s.input * 100 : undefined;
  const freshPercent = s.input && s.fresh != null ? s.fresh / s.input * 100 : undefined;
  return <main className={`monitor ${expanded ? 'expanded' : 'compact'}`} style={{fontSize: `${scale * 100}%`}}>
    <header><div className="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h4l3-8 5 16 3-8h5" /></svg><strong>TokenMonitor</strong><span className="version">0.2.0 · Local</span></div><button disabled={busy || !onAction} onClick={()=>onAction?.()} aria-label="Refresh monitor" title="Refresh metrics and tasks">↻</button></header>
    <div className="task-controls"><label className="task-picker"><span className="sr-only">Monitored task</span><select disabled={busy || !onAction || !tasks.length} value={s.selectedId ?? ''} onChange={e=>onAction?.('select',e.target.value)} title={s.task?.title}><option value="" disabled>Waiting for local task…</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.title} · {t.id.slice(-8)}</option>)}</select></label><button disabled={busy || !onAction || !s.selectedId} aria-pressed={!!s.locked} onClick={()=>onAction?.(s.locked ? 'unlock' : 'lock')} title="Selecting a task does not change lock state. Unlocking waits for the next automatic selection event.">{s.locked ? 'Locked' : 'Lock'}</button></div>
    <div className="following"><span className={s.disconnected || s.available === false ? 'offline' : 'live'} />{s.locked ? 'Locked to selected task' : s.followingMode === 'host-chat' ? 'Following this chat' : 'Following latest hook activity'}{s.selectionSource === 'manual' && !s.locked && ' · inspecting another task'}</div>
    {(error || s.disconnected || s.available === false || !s.task || s.isCompacting) && <p className="status" role="status">{error || s.status}</p>}
    <dl className="metrics"><Metric label={`Cached${cachedPercent == null ? '' : ` (${percent(cachedPercent)})`}`} value={s.cached} /><Metric label={`Fresh${freshPercent == null ? '' : ` (${percent(freshPercent)})`}`} value={s.fresh} level={s.freshHealth} /><Metric label={s.awaitingPostCompactionCall ? 'Input ≈' : 'Input'} value={s.input} level={s.contextHealth} help={s.awaitingPostCompactionCall ? 'Reduced context after compaction; cached/fresh unknown until next call' : 'Latest call input'} /></dl>
    <div className="model-row"><span title={`${s.model ?? 'Model unknown'} · ${s.effort ?? 'Effort unknown'}`}>{s.model ?? 'Model unknown'} · {s.effort ?? 'Effort unknown'}</span><span title={`5h resets ${time(s.fiveHour?.reset)}\n7d resets ${time(s.weekly?.reset)}`}>5h {quota(s.fiveHour)} · 7d {quota(s.weekly)} remaining</span></div>
    <div className="cache-row"><span title={cacheHelp}>Cache <b className={s.cacheTemperature === 'WARM' ? 'warm' : ''} style={{color: s.cacheTemperature === 'UNCERTAIN' ? health(1) : s.cacheTemperature === 'PRES. COLD' ? health(2.5) : undefined}}>{s.cacheTemperature ?? '—'}</b></span><span style={{color:health(s.contextHealth)}}>Context {percent(s.contextPercent)}</span></div>
    <div className="compaction-value" title={compactionHelp}>Compaction Value <b style={{color:health(value?.level)}}>{value?.category ?? '—'}</b>{value && <span> · Est. {number(value.currentInput)} → {number(value.estimatedInput)} · {value.breakEvenCalls == null ? 'No break-even' : `Break-even ~${value.breakEvenCalls} calls`}</span>}</div>
    <section className="output"><h2>Thread output</h2><dl className="metrics"><Metric label="Total output" value={totals?.total} /><Metric label="Thinking" value={totals?.reasoning} /><Metric label="Non-reasoning" value={remaining} /></dl><p className="hint">Thinking is included in total output. {totals?.source === 'reported-cumulative' ? 'Reported cumulative counters for this thread.' : 'Sum of recorded calls; missing values remain unknown.'}</p></section>
    <details className="attribution"><summary title={attributionHelp}>Skills &amp; tools · {a?.skillCount ?? 0} skills · {a?.callCount ?? 0} calls · ≈{number(a ? attributed : undefined)} ({s.input && a ? percent(attributed / s.input * 100) : '—'} of context)</summary><p className="hint">{attributionHelp}</p><ul>{a?.contributors.map(c=><li key={c.name}><span title={c.name}>{c.name}</span><span>{c.calls} calls · ≈{number(c.tokens)} · {s.input ? percent(c.tokens/s.input*100) : '—'}</span></li>)}</ul><p className="hint">{a?.afterCompaction ? 'Estimate since compaction; summary attribution unavailable.' : 'Text estimate; actual retained context may differ.'}</p></details>
    <div className="layout-controls"><button aria-expanded={expanded} onClick={()=>onLayout?.(!expanded,scale)}>{expanded ? 'Compact' : 'Expand details'}</button><label>Scale <select aria-label="Layout scale" value={scale} onChange={e=>onLayout?.(expanded,Number(e.target.value))}><option value="0.85">85%</option><option value="1">100%</option><option value="1.15">115%</option></select></label></div>
    {expanded && <>
      <section><div className="section-title"><h2>Context window</h2><span style={{color:health(s.contextHealth)}} title={`${exact(s.input)} / ${exact(s.contextLimit)} tokens`}>{number(s.input)} / {number(s.contextLimit)} · {percent(s.contextPercent)}</span></div><progress aria-label="Context window used" value={Math.min(100,Math.max(0,s.contextPercent??0))} max="100" style={{accentColor:health(s.contextHealth),'--context-color':health(s.contextHealth)} as React.CSSProperties} /></section>
      <section className="allowances">{[['5-hour allowance',s.fiveHour],['Weekly allowance',s.weekly]].map(([label,v])=>{const value=v as Monitor['fiveHour'];return <div key={label as string}><h2>{label as string}</h2><p>{quota(value)} remaining</p><small>Resets {time(value?.reset)}</small></div>;})}</section>
      <History s={s} />
      <section><h2>Latest call output</h2><dl className="metrics"><Metric label="Output (incl. thinking)" value={last?.outputRecorded === false ? undefined : last?.output} /><Metric label="Thinking" value={last?.reasoningRecorded === false ? undefined : last?.reasoning} /><Metric label="Cache write" value={last?.cacheWrite} /></dl></section>
      <details><summary>Task details</summary><dl className="details-grid"><dt>Session</dt><dd>{s.task?.id ?? '—'}</dd><dt>Workspace</dt><dd>{s.task?.workspace ?? '—'}</dd><dt>Last call</dt><dd>{time(s.lastCall)}</dd><dt>Last event</dt><dd>{time(s.lastEvent)}</dd><dt>Status</dt><dd>{s.status}</dd></dl></details>
    </>}
    <footer><span>{s.isCompacting ? 'Compacting…' : s.awaitingPostCompactionCall ? 'Compacted · waiting for next call' : `Call ${s.callCount ?? 0}`}</span><time title={time(s.lastCall)}>{s.lastCall ? new Date(s.lastCall).toLocaleTimeString() : 'No call yet'}</time></footer>
    <details className="help"><summary>Help &amp; diagnostics</summary><p>Refreshes every two seconds while visible, without model turns. Cached → Fresh → Input describes the latest call, not cumulative input. Thread output includes reasoning, tool calls, and other generated output; non-reasoning is not a measure of visible prose alone.</p><p>Selecting another task preserves the lock setting. While unlocked, the next relevant hook event follows this chat (or latest valid activity when chat identity is unavailable). Closing the panel leaves metadata hooks available.</p><p>Unknown values are shown as —. No remote connections or floating-window controls. Transcript content and full source paths stay inside the local Swift collector.</p><dl className="details-grid"><dt>Selection</dt><dd>{s.selectionSource ?? 'waiting'}</dd><dt>Following</dt><dd>{s.followingMode ?? 'latest-hook'}</dd><dt>Connection</dt><dd>{s.disconnected ? 'Disconnected; retaining snapshot' : 'Connected'}</dd><dt>Layout storage</dt><dd>{storage}</dd><dt>Version</dt><dd>0.2.0</dd></dl></details>
  </main>;
}
