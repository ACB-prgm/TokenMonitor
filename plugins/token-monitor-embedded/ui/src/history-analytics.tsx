import React, {useEffect, useRef, useState} from 'react';
import type {AnalyticsPeriod,HistoryAnalytics} from '../../server/src/history-database.js';
import type {Efficiency} from '../../server/src/efficiency.js';
import {exact,money,number,percent} from './analytics.js';

type Usage=HistoryAnalytics[number];
const spend=(row:Usage)=>row.priced||row.overhead?money(row.cost+row.overhead):'—';
const tokens=(row:Usage)=>row.input+row.output;
const cache=(row:Usage)=>row.input?percent(row.cached/row.input*100):'—';
const metrics={
 spend:{label:'Estimated cost',value:(row:Usage)=>row.cost+row.overhead,format:spend},
 tokens:{label:'Tokens',value:tokens,format:(row:Usage)=>exact(tokens(row))},
 calls:{label:'Calls',value:(row:Usage)=>row.calls,format:(row:Usage)=>exact(row.calls)},
};

function UsageTable({rows,models=false}:{rows:HistoryAnalytics;models?:boolean}){
 return <div className="analytics-table" tabIndex={0} role="region" aria-label={models?'Model breakdown':'Trend data'}>
  <table><thead><tr><th scope="col">{models?'Model':'UTC period'}</th>{models&&<th scope="col">Effort</th>}<th scope="col">Est. cost</th><th scope="col">Calls</th><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Cached input</th><th scope="col">Priced calls</th></tr></thead>
   <tbody>{rows.map(row=><tr key={JSON.stringify([row.label,row.effort])}><th scope="row">{row.label}</th>{models&&<td>{row.effort??'—'}</td>}<td>{spend(row)}</td><td>{exact(row.calls)}</td><td>{exact(row.input)}</td><td>{exact(row.output)}</td><td>{cache(row)}</td><td>{exact(row.priced)} / {exact(row.calls)}</td></tr>)}</tbody>
  </table>
 </div>;
}

export function HistoryAnalyticsView({load,onBack,scale,efficiency}:{load:(period:AnalyticsPeriod)=>Promise<HistoryAnalytics>;onBack?:()=>void;scale:number;efficiency?:Efficiency}){
 const [period,setPeriod]=useState<AnalyticsPeriod>('all');
 const [metric,setMetric]=useState<keyof typeof metrics>('spend');
 const [request,setRequest]=useState(0);
 const [rows,setRows]=useState<HistoryAnalytics>();
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[]);
 useEffect(()=>{
  let active=true;
  load(period).then(data=>{if(active)setRows(data);},()=>{if(active)setError('Local history is unavailable. Try refreshing.');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[period,request,load]);

 const trend=rows?.filter(row=>row.kind==='trend')??[];
 const models=rows?.filter(row=>row.kind==='model').sort((a,b)=>b.cost+b.overhead-a.cost-a.overhead||b.calls-a.calls)??[];
 const total=trend.reduce((sum,row)=>({...sum,calls:sum.calls+row.calls,priced:sum.priced+row.priced,
  input:sum.input+row.input,cached:sum.cached+row.cached,output:sum.output+row.output,
  cost:sum.cost+row.cost,overhead:sum.overhead+row.overhead}),
 {kind:'trend',label:'',effort:null,calls:0,priced:0,input:0,cached:0,output:0,cost:0,overhead:0} as Usage);
 const chart=metrics[metric];
 const peak=trend.reduce((max,row)=>Math.max(max,Math.abs(chart.value(row))),0);
 const progress=efficiency?.progress;
 const frozen=efficiency?.history?.frozenThreads;
 return <main className="analytics-page" style={{fontSize:`${scale*90}%`}}>
  <header>
   {onBack&&<button type="button" onClick={onBack}>‹ Thread monitor</button>}
   <div><label>Period <select value={period} onChange={e=>{setRows(undefined);setError('');setLoading(true);setPeriod(e.target.value as AnalyticsPeriod);}}>
    <option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
   </select></label><button type="button" disabled={loading} onClick={()=>{setLoading(true);setError('');setRequest(n=>n+1);}}>Refresh</button></div>
  </header>
  <h1 ref={heading} tabIndex={-1}>Usage analytics</h1>
  <p className="analytics-note">Imported local chats, including archived chats. Periods use UTC. Costs are API-equivalent estimates.</p>
  {progress?.running&&<p role="status">Importing history · {progress.processed} of {progress.total} chats checked. Refresh for the latest totals.</p>}
  {!!progress?.failed&&<p role="status">{exact(progress.failed)} chats could not be read during import.</p>}
  {!!frozen&&<p className="analytics-note">{exact(frozen)} saved chats retain their original pricing estimates.</p>}
  {loading&&<p role="status">Loading usage analytics…</p>}
  {error&&<p role="status">{error}</p>}
  {rows&&!trend.length&&<p>No imported activity in this period.</p>}
  {!!trend.length&&<>
   <dl className="analytics-metrics">
    <div><dt>Estimated cost</dt><dd>{spend(total)}</dd><small>{total.overhead?money(total.overhead)+' attributed to compaction':'Includes priced compaction charges'}</small></div>
    <div><dt>Tokens</dt><dd title={exact(tokens(total))}>{number(tokens(total))}</dd><small>{number(total.input)} input · {number(total.output)} output</small></div>
    <div><dt>Calls</dt><dd>{exact(total.calls)}</dd><small>{exact(total.priced)} fully priced</small></div>
    <div><dt>Cached input</dt><dd>{cache(total)}</dd><small>{number(total.cached)} cache-read tokens</small></div>
   </dl>
   {total.priced<total.calls&&<p className="analytics-note">Some calls lack full pricing. Estimated cost includes only known charges.</p>}
   <section className="analytics-section">
    <div className="analytics-section-heading"><h2>Usage over time</h2>
     <label>Metric <select value={metric} onChange={e=>setMetric(e.target.value as keyof typeof metrics)}>{Object.entries(metrics).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
    </div>
    <p className="analytics-note">Each bar shows one {period==='all'?'active month':'active day'}.</p>
    <div className="analytics-chart" aria-hidden="true">{trend.map(row=><span key={row.label} title={`${row.label} · ${chart.format(row)}`} style={{height:`${peak?Math.abs(chart.value(row))/peak*100:0}%`}}/>)}</div>
    <div className="analytics-chart-dates" aria-hidden="true"><span>{trend[0].label}</span>{trend.length>1&&<span>{trend.at(-1)!.label}</span>}</div>
    <details><summary>Trend data</summary><UsageTable rows={trend}/></details>
   </section>
   <section className="analytics-section"><h2>By model and effort</h2><UsageTable rows={models} models/></section>
  </>}
 </main>;
}
