import React,{useEffect,useRef,useState} from 'react';
import type {AnalyticsPeriod} from '../../server/src/history-database.js';
import type {DashboardFilters,DashboardThread,DashboardTotals,HistoryDashboard} from '../../server/src/history-dashboard.js';
import type {Efficiency} from '../../server/src/efficiency.js';
import {pluginName} from '../../shared/identity.js';
import {analyticsBucketStart,analyticsGrains,defaultAnalyticsGrain,type AnalyticsGrain} from '../../shared/analytics-grain.js';
import {categories,exact,money,percent} from './analytics.js';

const spend=(r:DashboardTotals)=>r.cost+r.overhead;
const cached=(r:DashboardTotals)=>r.input?r.cached/r.input*100:null;
const metrics={
 spend:{label:'Estimated cost',value:(r:DashboardTotals)=>r.priced||r.overhead?spend(r):null,format:money},
 tokens:{label:'Total tokens',value:(r:DashboardTotals)=>r.input+r.output,format:exact},
 call:{label:'Cost per call',value:(r:DashboardTotals)=>r.priced?spend(r)/r.priced:null,format:money},
 context:{label:'Context cost per call',value:(r:DashboardTotals)=>r.inputPriced?r.inputCost/r.inputPriced:null,format:money},
 cache:{label:'Cached input',value:cached,format:percent},
};
type Metric=keyof typeof metrics;
type Display = {metric:Metric; rank:string};
const splitKeys=['freshCost','readCost','writeCost','reasoningCost','otherCost','unsplitCost'] as const;
const filterLabels={model:'Model',effort:'Effort',workspace:'Project'};
const unknownLabels={model:'Unknown model',effort:'Unknown effort',workspace:'No project'};
const dimensions=Object.keys(filterLabels) as (keyof DashboardFilters)[];
const scales=['Compact','Comfortable','Large'] as const;
const scaleKey=`${pluginName}-analytics-scale`;
function savedScale(){
 try{return scales.find(s=>s===localStorage.getItem(scaleKey))??scales[0];}
 catch{return scales[0];}
}
const periods={7:'Last 7 days',30:'Last 30 days',90:'Last 90 days',all:'All time'};
const periodKeys=Object.keys(periods) as AnalyticsPeriod[];
const grainLabels={day:'Daily',week:'Weekly',month:'Monthly'};
const signed=(value:number)=>`${value>0?'+':''}${Number(value.toFixed(1))}`;
const labelFor=(key:keyof DashboardFilters,value:string)=>value||unknownLabels[key];
const sumRows=(rows:DashboardTotals[]):DashboardTotals=>Object.fromEntries(
 Object.keys(rows[0]).filter(k=>typeof rows[0][k as keyof DashboardTotals]==='number')
  .map(key=>[key,rows.reduce((sum,row)=>sum+row[key as keyof DashboardTotals],0)])
) as DashboardTotals;

function dateSeries(data:HistoryDashboard,grain:AnalyticsGrain){
 if(!data.trend.length)return [];
 const keys=new Map(data.trend.map(r=>[r.label,r]));
 const start=analyticsBucketStart(data.start||data.trend[0].label,grain);
 const end=new Date(data.end+'T00:00:00Z');
 const rows=[];
 for(const d=start;d<=end;grain==='month'?d.setUTCMonth(d.getUTCMonth()+1):d.setUTCDate(d.getUTCDate()+(grain==='week'?7:1))){
  const label=d.toISOString().slice(0,10);
  rows.push({label,row:keys.get(label)});
 }
 return rows;
}

function TrendMarks({values,metric,spark=false}:{values:(number|null)[];metric:Metric;spark?:boolean}){
 const peak=values.reduce<number>((max,n)=>Math.max(max,n??0),0);
 const scale=!spark&&metric==='cache'?100:peak||1;
 const step=1000/Math.max(values.length,1);
 const x=(i:number)=>(i+.5)*step;
 const y=(n:number)=>98-(n/scale)*94;
 // Keep each bucket's x position so the line interpolates across missing observations.
 const points=values.flatMap((value,i)=>value===null?[]:[{x:x(i),y:y(value)}]);
 const path=points.map((point,i)=>`${i?'L':'M'}${point.x} ${point.y}`).join(' ');
 const point=points.length===1?points[0]:undefined;
 return <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
  {!spark&&[4,51,98].map(n=><line key={n} x1="0" x2="1000" y1={n} y2={n} className="analytics-gridline" vectorEffect="non-scaling-stroke"/>)}
  <path d={path} fill="none" strokeWidth={spark?1.25:2} vectorEffect="non-scaling-stroke"/>
  {point&&<line x1={point.x-3} x2={point.x+3} y1={point.y} y2={point.y} strokeWidth={spark?1.25:3} strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
 </svg>;
}

function TopModels({models}:{models:HistoryDashboard['models']}){
 return <section className="analytics-section">
  <div className="analytics-section-heading"><h2>Your top models</h2><span className="analytics-note">Ranked by input tokens · includes cached input</span></div>
  <div className="analytics-models">{models.map(({model,total,efforts})=><article key={model}>
   <div className="analytics-section-heading"><h3>{labelFor('model',model)}</h3><span><b>{exact(total.input)}</b> <small>input tokens</small></span></div>
   <ul className="analytics-efforts" aria-label="Input tokens by effort">
    {efforts.map(({effort,input})=><li key={effort}>
     <div className="analytics-section-heading"><span>{labelFor('effort',effort)}</span><span>{exact(input)}</span></div>
     <div className="stack" aria-hidden="true"><span style={{width:`${total.input?input/total.input*100:0}%`}}/></div>
    </li>)}
   </ul>
   <dl className="analytics-model-kpis">{(Object.keys(metrics) as Metric[]).map(key=>{
    const m=metrics[key];
    return <div key={key}><dt>{m.label}</dt><dd>{m.format(m.value(total))}</dd></div>;
   })}</dl>
   {total.priced<total.calls&&<p className="analytics-note">{exact(total.priced)} / {exact(total.calls)} calls priced</p>}
  </article>)}</div>
 </section>;
}

function Dashboard({data,period,grain,display,setDisplay}:{data:HistoryDashboard;period:AnalyticsPeriod;grain:AnalyticsGrain;
 display:Display; setDisplay:(next:Display)=>void}){
 const {metric,rank}=display;
 const [selection,setSelection]=useState<string>();
 const series=dateSeries(data,grain);
 if(!series.length)return <p className="analytics-empty">No imported activity matches these filters.</p>;
 const total=sumRows(data.trend);
 const cost=metrics[metric];
 const valuesFor=(key:Metric)=>series.map(({row})=>row?metrics[key].value(row):null);
 const values=valuesFor(metric);
 const peak=metric==='cache'?100:values.reduce<number>((max,v)=>Math.max(max,v??0),0);
 const composition=splitKeys.map((key,i)=>({...categories[i],value:total[key]}));
 const splitTotal=composition.reduce((n,part)=>n+part.value,0);
 const active=(rank==='peer'?[...data.low,...data.high]:data.spend).find(t=>t.source===selection);
 const rankings=(rows:DashboardThread[],heading?:string)=><div>{heading&&<h3>{heading}</h3>}
  {rows.length?<ul className="analytics-rank-list">{rows.map(t=><li key={t.source}>
   <button type="button" aria-expanded={active?.source===t.source} aria-controls="analytics-thread-detail" onClick={()=>setSelection(active?.source===t.source?undefined:t.source)}>
    <strong>{t.title}</strong><b className={rank==='peer'?(t.delta!<0?'analytics-below':'analytics-above'):undefined}>{rank==='peer'?`${signed(t.delta!*100)}%`:money(spend(t))}</b>
    <small>{exact(t.calls)} calls · {money(metrics.spend.value(t))} total</small><small>{money(metrics.call.value(t))} / call</small>
   </button></li>)}</ul>:<p className="analytics-note">No eligible threads</p>}</div>;
 return <>
  <div className="analytics-metrics">{(Object.keys(metrics) as Metric[]).map(key=>{
   const m=metrics[key], current=m.value(total), previous=data.previous?m.value(data.previous):null;
   const change=current!==null&&previous?(key==='cache'?`${signed(current-previous)} pp`:`${signed((current/previous-1)*100)}%`):null;
   return <button key={key} type="button" aria-pressed={metric===key} onClick={()=>setDisplay({...display,metric:key})}>
    <span>{m.label}</span><strong>{m.format(current)}</strong><span className="analytics-spark"><TrendMarks metric={key} values={valuesFor(key)} spark/></span>
    <small>{change?`${change} vs previous period`:period==='all'?'All imported history':'No prior comparison'}</small>
   </button>;
  })}</div>
  <div className="analytics-scope analytics-note"><span>{exact(total.calls)} calls</span><span>{exact(data.active)} active threads</span>
   <span>{exact(total.priced)} / {exact(total.calls)} calls priced</span>
   <span>{data.start||data.trend[0].label} to {data.end} UTC · today in progress</span>
  </div>

  <section className="analytics-section">
   <div className="analytics-section-heading"><h2>Cost composition</h2><span className="analytics-note">Compaction {money(total.overhead)} separately</span></div>
   {splitTotal>0?<><div className="analytics-stack stack" aria-hidden="true">{composition.map(({label,color,value})=>value>0&&<span key={label} style={{width:`${value/splitTotal*100}%`,background:color}}/>)}</div>
    <ul className="analytics-legend">{composition.filter(p=>p.value>0).map(({label,color,value})=><li key={label}>
     <span style={{background:color}} aria-hidden="true"/><div>{label}<small>{money(value)} · {percent(value/splitTotal*100)}{label==='Reasoning output'&&total.splitCalls>0&&` · ${money(value/total.splitCalls)}/call`}</small></div>
    </li>)}</ul></>:<p className="analytics-note">Cost categories unavailable for this selection.</p>}
   {total.splitCalls<total.calls&&<p className="analytics-note">Composition covers {exact(total.splitCalls)} of {exact(total.calls)} calls. Historical or unpriced calls may lack category costs.</p>}
  </section>

  {(data.context||data.effort)&&<section className="analytics-section">
   <h2>How to improve</h2>
   <div className="analytics-actions">
    {data.context&&<article><h3>Start fresh for unrelated work</h3>
     <p className="analytics-note">{data.context.title} · {money(metrics.context.value(data.context))} context per call vs {money(data.context.contextExpected!/data.context.calls)} for peers</p>
     <p>Bring over only what the new task needs. Compare context cost per call on similar work. For ongoing work, check the thread’s compaction forecast.</p>
    </article>}
    {data.effort&&<article><h3>Try lower effort on a routine task</h3>
     <p className="analytics-note">{money(data.effort.perCall)} reasoning per call · {percent(data.effort.share*100)} of high-effort costs across {exact(data.effort.calls)} calls</p>
     <p>Try one step lower. Compare reasoning cost per call on similar work and check the result.</p>
    </article>}
   </div>
  </section>}

   <section className="analytics-section">
    <div className="analytics-section-heading"><h2>{cost.label} over time</h2><span className="analytics-note">{grainLabels[grain]} · UTC</span></div>
    <div className="analytics-trend"><div className="analytics-axis analytics-note"><span>{cost.format(peak)}</span><span>{cost.format(peak/2)}</span><span>{cost.format(0)}</span></div>
     <TrendMarks values={values} metric={metric}/>
    </div>
    <div className="analytics-dates analytics-note"><span>{series[0].label}</span><span>{series.at(-1)!.label}</span></div>
    <details><summary>Exact trend values</summary><div className="analytics-table"><table><thead><tr><th scope="col">UTC bucket start</th><th scope="col">{cost.label}</th><th scope="col">Calls</th></tr></thead>
     <tbody>{series.map(({label,row},i)=><tr key={label}><th scope="row">{label}</th><td>{cost.format(values[i])}</td><td>{exact(row?.calls??0)}</td></tr>)}</tbody>
    </table></div></details>
   </section>
   <TopModels models={data.models}/>

  <section className="analytics-section">
   <div className="analytics-section-heading"><div><h2>Thread outliers</h2><p className="analytics-note">{rank==='peer'?'Matched by model and effort · 20+ priced calls · comparable pricing':'Known charges in the selected period'}</p></div>
    <select aria-label="Rank threads by" value={rank} onChange={e=>{setDisplay({...display,rank:e.target.value});setSelection(undefined);}}><option value="peer">Cost per call vs peers</option><option value="spend">Total estimated cost</option></select>
   </div>
   <div className="analytics-ranks">{rank==='peer'?<>{rankings(data.low,'Below peer cost')}{rankings(data.high,'Above peer cost')}</>:
    <>{rankings(data.spend.slice(0,3))}{data.spend.length>3&&rankings(data.spend.slice(3))}</>}</div>
   <div id="analytics-thread-detail" className="analytics-thread-detail" hidden={!active} aria-live="polite">{active&&<>
    <h3>{active.title}</h3><div className="analytics-scope">
     <span>{money(active.inputPriced?active.inputCost:null)} context</span><span>{money(active.splitCalls?active.reasoningCost+active.otherCost+active.unsplitCost:null)} output{active.splitCalls>0&&active.splitCalls<active.calls?' (covered calls)':''}</span>
     <span>{money(active.overhead)} compaction</span><span>{percent(cached(active))} cached input</span>
     {active.expected!==null&&<span>{money(active.expected/active.calls)} peer cost per call</span>}
    </div></>}</div>
  </section>
  <details className="analytics-section"><summary>Compaction outcomes · {data.payback.evaluable?`${data.payback.profitable} / ${data.payback.evaluable} paid back`:'No evaluable events'}</summary>
   <p className="analytics-note">Selected dates and project, across all models and efforts. {exact(data.payback.pending)} pending{data.payback.evaluable?` · ${money(data.payback.net)} estimated net savings`:''}.</p>
  </details>
 </>;
}

export function HistoryAnalyticsView({load,onBack,efficiency}:{load:(period:AnalyticsPeriod,filters:DashboardFilters,grain:AnalyticsGrain)=>Promise<HistoryDashboard>;onBack?:()=>void;efficiency?:Efficiency}){
 const [scale,setScale]=useState(savedScale);
 const [display,setDisplay]=useState<Display>({metric:'spend',rank:'peer'});
 const [period,setPeriod]=useState<AnalyticsPeriod>('30');
 const [grain,setGrain]=useState<AnalyticsGrain>(()=>defaultAnalyticsGrain(period));
 const [filters,setFilters]=useState<DashboardFilters>({});
 const [loaded,setLoaded]=useState<{key:string;data:HistoryDashboard}>();
 const data=loaded?.data;
 const [request,setRequest]=useState(0);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const heading=useRef<HTMLHeadingElement>(null);
 const cache=useRef(new Map<string,HistoryDashboard>());
 const key=JSON.stringify([period,filters,grain]);
 useEffect(()=>{heading.current?.focus();},[]);
 useEffect(()=>{
  let active=true;
  const cached=cache.current.get(key);
  if(cached){setLoaded({key,data:cached});setStatus('ready');}
  load(period,filters,grain).then(result=>{
   if(!active)return;
   if(cache.current.size>=12)cache.current.clear();
   cache.current.set(key,result);setLoaded({key,data:result});setStatus('ready');
  },()=>{if(active)setStatus('error');});
  return()=>{active=false;};
 },[key,period,filters,grain,request,load]);
 const filter=(k:keyof DashboardFilters,value?:string)=>{
  setStatus('loading');
  setFilters(current=>({...current,[k]:value}));
 };
 const progress=efficiency?.progress;
 return <main className="analytics-page" data-scale={scale}>
  <header className="analytics-heading">
   <div>{onBack&&<button type="button" onClick={onBack}>‹ Thread monitor</button>}
    <h1 ref={heading} tabIndex={-1}>Usage analytics</h1><p className="analytics-note">Local Codex history · API-equivalent USD</p>
   </div>
   <div className="analytics-heading-controls">
    <label>View scale <select value={scale} onChange={e=>{
     const next=scales[e.target.selectedIndex];
     setScale(next);
     try{localStorage.setItem(scaleKey,next);}catch{/* The current view still updates. */}
    }}>{scales.map(s=><option key={s}>{s}</option>)}</select></label>
    <button type="button" disabled={status==='loading'} onClick={()=>{cache.current.delete(key);setStatus('loading');setRequest(n=>n+1);}}>Refresh</button>
   </div>
  </header>
  <div className="analytics-toolbar">
   <div className="analytics-periods" role="group" aria-label="Date range">{periodKeys.map(k=><button key={k} type="button" aria-pressed={period===k} onClick={()=>{if(period!==k){setStatus('loading');setPeriod(k);setGrain(defaultAnalyticsGrain(k));}}}>{periods[k]}</button>)}</div>
   <div className="analytics-filters">
    <select aria-label="Time grain" value={grain} onChange={e=>{setStatus('loading');setGrain(analyticsGrains[e.target.selectedIndex]);}}>
     {analyticsGrains.map(k=><option key={k} value={k}>{grainLabels[k]}</option>)}
    </select>
    {dimensions.map(k=><select key={k} aria-label={filterLabels[k]} value={filters[k]===undefined?'all':`=${filters[k]}`} onChange={e=>filter(k,e.target.value==='all'?undefined:e.target.value.slice(1))}>
    <option value="all">All {filterLabels[k].toLowerCase()}s</option>{data?.choices[k].map(v=><option key={v} value={`=${v}`}>{labelFor(k,v)}</option>)}
   </select>)}</div>
  </div>
  {progress?.running&&<p className="analytics-note">Importing history · {progress.processed} of {progress.total} chats checked. Refresh for current totals.</p>}
  {!!progress?.failed&&<p className="analytics-note">{exact(progress.failed)} chats could not be read.</p>}
  {status==='loading'&&<p role="status" className="analytics-note">Loading usage analytics…</p>}
  {status==='error'&&<p role="status">Local history is unavailable. Try refreshing.</p>}
  {data&&loaded?.key===key&&status!=='loading'&&<Dashboard data={data} period={period} grain={grain} display={display} setDisplay={setDisplay}/>}
 </main>;
}
