import React,{useState} from 'react';
import type {Efficiency,Summary} from '../../server/src/efficiency.js';
import {money,percent} from './analytics.js';
const usd=(n:number|null)=>n==null?'N/A':money(n);
const preciseUsd=(n:number)=>n!==0&&Math.abs(n)<.000001?money(n):n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6});
import {costAssessment,paybackAssessment,defaultThresholds,type Thresholds,type Assessment} from './performance.js';
import type {Comparison,Comparisons} from '../../server/src/comparisons.js';
function KpiValue({value,assessment,comparison,primary=false}:{value:string;assessment:Assessment;comparison?:Comparison;primary?:boolean}) {
 const delta=comparison?.delta;
 const provisional=comparison?.provisional||assessment.label==='Provisional';
 const hasDelta=comparison&&delta!=null;
 return <span className={`kpi-value ${primary?'primary':''}`}><b>{value}{provisional&&<sup className="provisional-mark" title={comparison?.reason?`Provisional: ${comparison.reason}. Expand for calculation.`:"Provisional: expand Efficiency KPIs for sample requirements"} aria-label="Provisional; expand Efficiency KPIs for explanation">*</sup>}</b>{hasDelta&&<small className={`kpi-badge tone-${assessment.tone}`} title={comparison?`Matched current ${comparison.current??'N/A'} / reference ${comparison.reference??'N/A'}; ${comparison.currentCalls} current / ${comparison.baselineCalls} reference calls. ${comparison.reason??assessment.label}`:assessment.label}>{hasDelta&&<>{delta<0?'↓':delta>0?'↑':'→'} {Math.abs(delta).toFixed(1)}%</>}</small>}<span className="sr-only">{assessment.label}</span></span>;
}
function KpiSummary({thread,all,comparisons,thresholds}:{thread?:Summary;all?:Summary;comparisons?:{thread?:Comparisons;all?:Comparisons};thresholds:Thresholds}) {
 const rows=[{label:'Thread',s:thread,c:comparisons?.thread},{label:'All chats',s:all,c:comparisons?.all}];
 return <summary aria-label="Expand historical efficiency KPIs"><span className="kpi-heading">Efficiency KPIs <span className="kpi-chevron" aria-hidden="true">⌄</span></span><span className="kpi-grid"><span aria-hidden="true"/><span className="kpi-label">Cost / call</span><span className="kpi-label">Context / call</span><span className="kpi-label">Compaction payback</span>{rows.map(({label,s,c},i)=><React.Fragment key={label}><span className="kpi-row-label">{label}</span><KpiValue value={s?usd(s.costPerCall):'N/A'} primary={!i} comparison={c?.cost} assessment={costAssessment(c?.cost,thresholds)}/><KpiValue value={s?usd(s.contextPerCall):'N/A'} primary={!i} comparison={c?.context} assessment={costAssessment(c?.context,thresholds)}/><KpiValue value={s?.paybackRate==null?'N/A':percent(s.paybackRate)} primary={!i} assessment={s?paybackAssessment(s,thresholds):{tone:'neutral',label:'Unavailable'}}/></React.Fragment>)}</span></summary>;
}
function Calculation({thread,all,metric}:{thread?:Summary;all?:Summary;metric:'cost'|'context'|'payback'}) {
 const formula=(s?:Summary)=>{
  if(!s)return 'N/A';
  if(metric==='payback')return `${s.profitable} / ${s.evaluable} × 100 = ${s.paybackRate==null?'N/A':percent(s.paybackRate)}`;
  const numerator=metric==='cost'?s.cost+s.overhead:s.inputCost;
  const count=metric==='cost'?s.priced:s.inputPriced;
  return `${preciseUsd(numerator)} / ${count} = ${usd(metric==='cost'?s.costPerCall:s.contextPerCall)}`;
 };
 const exact=(s?:Summary)=>s?metric==='payback'?`Final net savings: ${s.netSavings} USD`:`Exact numerator: ${metric==='cost'?s.cost+s.overhead:s.inputCost} USD; average: ${metric==='cost'?s.costPerCall:s.contextPerCall} USD`:'Unavailable';
 return <p className="kpi-calculation"><span title={exact(thread)}>Thread: {formula(thread)}</span><span title={exact(all)}>All chats: {formula(all)}</span></p>;
}
export function EfficiencyBanner({data:d,thresholds=defaultThresholds}:{data?:Efficiency;thresholds?:Thresholds}){
 const [period,setPeriod]=useState('7');
 const all=d?.periods[period]?.summary,t=d?.thread;
 return <details className="efficiency"><KpiSummary thread={t} all={all} comparisons={{thread:d?.comparisons?.thread,all:d?.comparisons?.periods[period]}} thresholds={thresholds}/><div className="efficiency-details kpi-guide">
 <label className="kpi-period">All chats period <select value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="all">All history</option></select></label>
 {!d&&<p role="status">Historical analytics are loading.</p>}
 <dl className="kpi-definitions">
 <div><dt>Cost / call</dt><dd>Average estimated input and output cost per call, including compaction charges.<p className="kpi-formula">(Priced call cost + compaction charges) ÷ priced calls</p><Calculation thread={t} all={all} metric="cost"/></dd></div>
 <div><dt>Context / call <span>(USD)</span></dt><dd>Average estimated input cost per call: fresh, cached and cache-write input. Repeated context reads count each time; output and reasoning tokens are excluded.<p className="kpi-formula">Total input cost ÷ calls with priceable input</p><Calculation thread={t} all={all} metric="context"/></dd></div>
 <div><dt>Compaction payback</dt><dd>Share of completed, evaluable compactions that reached break-even.<p className="kpi-formula">Compactions reaching break-even ÷ evaluable compactions × 100</p><Calculation thread={t} all={all} metric="payback"/><p className="kpi-net">Final net savings: Thread {usd(t?.netSavings??null)} · All chats {usd(all?.netSavings??null)}. Reaching break-even does not guarantee positive final savings.</p></dd></div>
 </dl>
 <p className="kpi-comparison-note">Arrow % = (matched current average ÷ historical reference − 1) × 100. Cost matches model + effort; context cost matches model. Thread uses other chats; All chats uses earlier history. All history has no earlier comparison.</p>
 <p className="provisional-explanation"><strong>* Provisional:</strong> comparisons need 20 current and 20 reference calls per group and complete pricing/import coverage; compaction payback needs {thresholds.minimumEvents} completed, evaluable events. Estimates use API-equivalent pricing, not subscription charges.</p>
 </div></details>;
}
