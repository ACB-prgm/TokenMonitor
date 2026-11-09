import React,{useState} from 'react';
import type {Efficiency,Summary} from '../../server/src/efficiency.js';
import {money,percent} from './analytics.js';
const usd=(n:number|null)=>n==null?'—':money(n);
const perCallUsd=(n:number|null)=>n==null||!Number.isFinite(n)?'—':`${n<0?'−':''}$${Math.abs(n).toFixed(4)}`;
const preciseUsd=(n:number)=>n!==0&&Math.abs(n)<.000001?money(n):n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6});
import {costAssessment,paybackAssessment,type Assessment,type KpiComparison} from './performance.js';
import {performanceThresholds} from './performance-config.js';
function KpiValue({value,assessment,comparison,primary=false}:{value:string;assessment:Assessment;comparison?:KpiComparison;primary?:boolean}) {
 const delta=comparison?.delta;
 const provisional=value!=='—'&&(comparison?.provisional||assessment.label==='Provisional');
 const hasDelta=comparison&&delta!=null;
 return <span className={`kpi-value ${primary?'primary':''} tone-${assessment.tone}`} title={assessment.label}><b>{value}{provisional&&<sup className="provisional-mark" title={comparison?.reason?`Provisional: ${comparison.reason}. Expand for calculation.`:"Provisional: expand Efficiency KPIs for sample requirements"} aria-label="Provisional; expand Efficiency KPIs for explanation">*</sup>}</b>{hasDelta&&<small className={`kpi-badge tone-${assessment.tone}`} title={comparison?`Current average ${comparison.current??'—'} / reference ${comparison.reference??'—'}; ${comparison.currentCalls} current / ${comparison.referenceCalls} reference calls. ${comparison.reason??assessment.label}`:assessment.label}>{hasDelta&&<>{delta<0?'↓':delta>0?'↑':'→'} {Math.abs(delta).toFixed(1)}%</>}</small>}</span>;
}
// Compare the same aggregate values shown in the visible rows.
function directComparison(current:Summary|undefined,reference:Summary|undefined,metric:'cost'|'context',ready:boolean):KpiComparison {
 const a=current?.[metric==='cost'?'costPerCall':'contextPerCall']??null,r=reference?.[metric==='cost'?'costPerCall':'contextPerCall']??null;
 const count=metric==='cost'?'priced':'inputPriced',n=current?.[count]??0,bn=reference?.[count]??0;
 const complete=!!current&&!!reference&&n===current.calls&&bn===reference.calls;
 const provisional=!ready||n<20||bn<20||!complete;
 return {current:a,reference:r,delta:a!=null&&r!=null&&r>0?(a/r-1)*100:null,currentCalls:n,referenceCalls:bn,provisional,reason:!ready?'Historical import is incomplete':!complete?'Missing or partial pricing coverage':n<20||bn<20?'At least 20 current and 20 reference calls required':undefined};
}
function KpiSummary({thread,all,previous,ready}:{thread?:Summary;all?:Summary;previous?:Summary;ready:boolean}) {
 const rows=[{label:'Thread',s:thread,reference:all},{label:'Comp',s:all,reference:previous}];
 return <summary aria-label="Expand historical efficiency KPIs"><span className="kpi-heading"><span className="kpi-chevron disclosure-caret" aria-hidden="true"/>Efficiency KPIs</span><span className="kpi-grid"><span aria-hidden="true"/><span className="kpi-label">Context / call</span><span className="kpi-label">Cost / call</span><span className="kpi-label">Compaction payback</span>{rows.map(({label,s,reference},i)=><React.Fragment key={label}><span className="kpi-row-label">{label}</span>{(['context','cost'] as const).map(metric=>{const c=directComparison(s,reference,metric,ready);return <KpiValue key={metric} value={perCallUsd(s?.[metric==='cost'?'costPerCall':'contextPerCall']??null)} primary={!i} comparison={reference?c:undefined} assessment={reference?costAssessment(c):{tone:'neutral',label:'Unavailable'}}/>;})}<span className="kpi-payback"><KpiValue value={s?.paybackRate==null?'—':`${s.profitable}/${s.evaluable} (${percent(s.paybackRate)})`} primary={!i} assessment={s?paybackAssessment(s):{tone:'neutral',label:'Unavailable'}}/></span></React.Fragment>)}</span></summary>;
}
function Calculation({thread,all,metric,comparisonLabel}:{thread?:Summary;all?:Summary;metric:'cost'|'context'|'payback';comparisonLabel:string}) {
 const formula=(s?:Summary)=>{
  if(!s)return '—';
  if(metric==='payback')return `${s.profitable} / ${s.evaluable} × 100 = ${s.paybackRate==null?'—':percent(s.paybackRate)}`;
  const numerator=metric==='cost'?s.cost+s.overhead:s.inputCost;
  const count=metric==='cost'?s.priced:s.inputPriced;
  return `${preciseUsd(numerator)} / ${count} = ${perCallUsd(metric==='cost'?s.costPerCall:s.contextPerCall)}`;
 };
 const exact=(s?:Summary)=>s?metric==='payback'?`Final net savings: ${s.netSavings} USD`:`Exact numerator: ${metric==='cost'?s.cost+s.overhead:s.inputCost} USD; average: ${metric==='cost'?s.costPerCall:s.contextPerCall} USD`:'Unavailable';
 return <p className="kpi-calculation"><span title={exact(thread)}>Thread: {formula(thread)}</span><span title={exact(all)}>{comparisonLabel}: {formula(all)}</span></p>;
}
export function EfficiencyBanner({data:d}:{data?:Efficiency}){
 const [period,setPeriod]=useState('7');
 const all=d?.periods[period]?.summary,t=d?.thread;
 const periodLabel=period==='all'?'All history':`Last ${period} days`,comparisonLabel=`Comp (${periodLabel})`;
 const history=d?.periods.all?.summary;
 const matchesHistory=period!=='all'&&!!all&&all.calls>0&&!!history&&(Object.keys(history) as (keyof Summary)[]).every(key=>all[key]===history[key]);
 const ready=!!d&&!d.progress?.running&&!d.progress?.failed&&d.comparisonReady;
 return <div className="efficiency-panel"><label className="kpi-period">Compare with <select aria-label="Comparison period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All history</option></select></label><details className="efficiency"><KpiSummary thread={t} all={all} previous={d?.periods[period]?.previousSummary} ready={ready}/><div className="efficiency-details kpi-guide">
 {!!d?.progress?.failed&&<p role="status">Historical collection is paused after a storage or import error. Showing committed totals; collection will retry automatically.</p>}
 {!d&&<p role="status">Historical analytics are loading.</p>}
 <p className="kpi-comparison-scope">{comparisonLabel}: all local chats in the selected period, including this thread · {all?.calls??0} recorded calls. Thread uses its full recorded history.{matchesHistory&&' This period includes all available history, so Comp matches All history.'}</p>
 {Boolean(d?.history?.frozenThreads)&&<p className="provisional-explanation">Saved history includes {d?.history?.frozenThreads} chats with estimates from an earlier calculation version. Their original totals are retained; comparisons remain provisional.</p>}
 {d?.history?.sourceAvailable===false&&<p>Source transcript unavailable. Saved summaries remain available; {d.history.detailCalls??0} of {d.thread.calls} recorded calls retain numeric detail.</p>}
 <dl className="kpi-definitions">
 <div><dt>Context / call <span>(USD)</span></dt><dd>Average estimated input cost per call: fresh, cached and cache-write input. Repeated context reads count each time; output and reasoning tokens are excluded.<p className="kpi-formula">Total input cost ÷ calls with priceable input</p><Calculation thread={t} all={all} metric="context" comparisonLabel={comparisonLabel}/></dd></div>
 <div><dt>Cost / call</dt><dd>Average estimated input and output cost per call, including compaction charges.<p className="kpi-formula">(Priced call cost + compaction charges) ÷ priced calls</p><Calculation thread={t} all={all} metric="cost" comparisonLabel={comparisonLabel}/></dd></div>
 <div><dt>Compaction payback</dt><dd>Share of completed, evaluable compactions that reached break-even.<p className="kpi-formula">Compactions reaching break-even ÷ evaluable compactions × 100</p><Calculation thread={t} all={all} metric="payback" comparisonLabel={comparisonLabel}/>{!!((t?.pending??0)+(all?.pending??0))&&<p className="kpi-net">Pending compactions: Thread {t?.pending??0} · {comparisonLabel} {all?.pending??0}. Excluded from payback until completed.</p>}<p className="kpi-net">Final net savings: Thread {usd(t?.netSavings??null)} · {comparisonLabel} {usd(all?.netSavings??null)}. Pending compactions are excluded until completed. Closing a session can complete a pending compaction and change the fraction. Reaching break-even does not guarantee positive final savings.</p></dd></div>
 </dl>
 <p className="kpi-comparison-note">Arrow % = (current average ÷ comparison average − 1) × 100. Thread compares directly with the Comp row ({periodLabel}). {period==='all'?'All history has no preceding period; the Comp row has no arrow.':'Comp compares with the preceding equal-length period.'} Green: at least {performanceThresholds.efficient}% lower; amber: over {performanceThresholds.elevated}% higher; red: over {performanceThresholds.significant}% higher. Provisional comparisons remain neutral. These are spending comparisons; model mix, effort and output can affect them.</p>
 <p className="provisional-explanation"><strong>* Provisional:</strong> comparisons need 20 current and 20 reference priced calls and complete pricing/import coverage; compaction payback needs {performanceThresholds.minimumEvents} completed, evaluable events. Estimates use API-equivalent pricing, not subscription charges.</p>
 </div></details></div>;
}
