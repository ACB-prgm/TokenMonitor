import type {AnalyticsPeriod,HistoryDatabase} from './history-database.js';
import {compositionKeys,summarize} from './history-builder.js';
import {defaultAnalyticsGrain,type AnalyticsGrain} from '../../shared/analytics-grain.js';

export type DashboardFilters = {model?:string; effort?:string; workspace?:string};
export const dashboardFields = ['calls','priced','inputPriced','inputCost','input','cached','output','cost','overhead',...compositionKeys] as const;
export type DashboardTotals = Record<typeof dashboardFields[number],number>;
type ThreadGroup = DashboardTotals & {source:string;title:string;model:string;effort:string;basis:string|null};
export type DashboardThread = DashboardTotals & {source:string;title:string;expected:number|null;contextExpected:number|null;delta:number|null};
type DashboardModel = {model:string; total:DashboardTotals; efforts:{effort:string;input:number}[]};
const sums = dashboardFields.map(k=>`SUM(${k}) AS ${k}`).join(',');
const accumulate = (a:DashboardTotals,b:DashboardTotals,sign=1) => {
 for(const key of dashboardFields)a[key]+=sign*b[key];
};
export const emptyDashboardTotals = () => Object.fromEntries(dashboardFields.map(k=>[k,0])) as DashboardTotals;

function rankModels(rows:ThreadGroup[]){
 const models=new Map<string,{total:DashboardTotals;efforts:Map<string,number>}>();
 const high=emptyDashboardTotals();
 for(const row of rows){
  const model=models.get(row.model)??{total:emptyDashboardTotals(),efforts:new Map<string,number>()};
  accumulate(model.total,row);
  if(row.calls)model.efforts.set(row.effort,(model.efforts.get(row.effort)??0)+row.input);
  models.set(row.model,model);
  if(row.effort.toLowerCase()==='high')accumulate(high,row);
 }
 const ranked=[...models].map(([model,{total,efforts}]):DashboardModel=>({
  model,total,efforts:[...efforts].map(([effort,input])=>({effort,input})).sort((a,b)=>b.input-a.input||a.effort.localeCompare(b.effort)),
 })).sort((a,b)=>b.total.input-a.total.input||a.model.localeCompare(b.model));
 return {models:ranked,high};
}

function matchingThreads(rows:ThreadGroup[]){
 const cohorts = new Map<string,DashboardTotals>();
 const threads = new Map<string,{total:DashboardTotals;groups:ThreadGroup[]}>();
 const cohortKey = (r:ThreadGroup) => JSON.stringify([r.model,r.effort,r.basis]);
 for(const row of rows){
  const key=cohortKey(row), cohort=cohorts.get(key)??emptyDashboardTotals();
  accumulate(cohort,row);cohorts.set(key,cohort);
  const thread=threads.get(row.source)??{total:emptyDashboardTotals(),groups:[]};
  accumulate(thread.total,row);thread.groups.push(row);threads.set(row.source,thread);
 }
 return [...threads.values()].map(({total,groups}):DashboardThread=>{
  let expected=0,contextExpected=0,peers=0,valid=total.calls>=20&&total.priced===total.calls;
  for(const row of groups){
   const peer={...cohorts.get(cohortKey(row))!};
   accumulate(peer,row,-1);
   if(!row.basis||!row.model||peer.calls<=0||peer.calls!==peer.priced){valid=false;break;}
   peers+=peer.calls;
   expected+=(peer.cost+peer.overhead)/peer.calls*row.calls;
   contextExpected+=peer.inputCost/peer.calls*row.calls;
  }
  valid&&=peers>=20;
  return {...total,source:groups[0].source,title:groups[0].title,expected:valid?expected:null,
   contextExpected:valid&&total.inputPriced===total.calls?contextExpected:null,
   delta:valid&&expected>0?(total.cost+total.overhead)/expected-1:null};
 });
}

export function readHistoryDashboard(db:HistoryDatabase,period:AnalyticsPeriod,filters:DashboardFilters,now=Date.now(),grain=defaultAnalyticsGrain(period)){
 const day=864e5, today=Math.floor(now/day)*day;
 const iso=(n:number)=>new Date(n).toISOString().slice(0,10);
 const end=iso(today);
 const start=period==='all'?'':iso(today-(Number(period)-1)*day);
 const previous=period==='all'?'':iso(today-(2*Number(period)-1)*day);
 const buckets:Record<AnalyticsGrain,string>={
  day:'day',
  week:"date(day,'-' || ((CAST(strftime('%w',day) AS INTEGER)+6)%7) || ' days')",
  month:"date(day,'start of month')",
 };
 const scope=`SELECT t.*, d.model AS model, d.effort AS effort, c.workspace AS workspace,
  COALESCE(c.title,'Saved chat · '||substr(t.source,-8)) AS title, COALESCE(p.basis,s.basis) AS basis
 FROM history_daily t JOIN history_dimensions d ON d.id=t.dimension
 LEFT JOIN history_catalogue c ON c.source=t.source
 LEFT JOIN history_sources s ON s.id=t.source
 LEFT JOIN history_day_basis p ON p.source=t.source AND p.day=t.day
 WHERE t.source NOT LIKE '~%' AND t.day BETWEEN ?1 AND ?2
 AND (?4 IS NULL OR COALESCE(d.model,'')=?4) AND (?5 IS NULL OR COALESCE(d.effort,'')=?5)
 AND (?6 IS NULL OR COALESCE(c.workspace,'')=?6)`;
 const args={'1':previous,'2':end,'3':start,'4':filters.model??null,'5':filters.effort??null,'6':filters.workspace??null};
 type Row = DashboardTotals & {kind:string; label:string;source:string;title:string;model:string;effort:string;basis:string|null};
 const rows=db.statement(`WITH scoped AS MATERIALIZED (${scope})
 SELECT 'trend' AS kind,${buckets[grain]} AS label,'' AS source,'' AS title,'' AS model,'' AS effort,NULL AS basis,${sums}
 FROM scoped WHERE day>=?3 GROUP BY label
 UNION ALL SELECT 'previous','', '', '', '', '', NULL,${sums} FROM scoped WHERE day<?3 HAVING COUNT(*)>0
 UNION ALL SELECT 'thread','',source,title,COALESCE(model,''),COALESCE(effort,''),basis,${sums}
 FROM scoped WHERE day>=?3 GROUP BY source,model,effort,basis HAVING calls>0 OR overhead<>0`).all(args) as unknown as Row[];
 const trend=rows.filter(r=>r.kind==='trend').sort((a,b)=>a.label.localeCompare(b.label));
 const threadRows=rows.filter(r=>r.kind==='thread');
 const threads=matchingThreads(threadRows);
 const {models,high}=rankModels(threadRows);
 const ranked=threads.filter(r=>r.delta!==null).sort((a,b)=>a.delta!-b.delta!);
 const context=threads.filter(r=>r.contextExpected&&r.inputCost>1.30*r.contextExpected)
  .sort((a,b)=>(b.inputCost-b.contextExpected!)-(a.inputCost-a.contextExpected!))[0];
 const effort=high.splitCalls===high.priced&&high.priced>=20&&high.reasoningCost>0&&high.reasoningCost>=.25*high.cost
  ?{perCall:high.reasoningCost/high.priced,share:high.reasoningCost/high.cost,calls:high.priced}:undefined;
 const payback=summarize([],db.outcomes(undefined,start||undefined,iso(today+day),undefined,filters.workspace));
 return {start,end,trend,previous:rows.find(r=>r.kind==='previous'),
  models,
  choices:{
   model:db.statement("SELECT DISTINCT COALESCE(model,'') AS value FROM history_dimensions ORDER BY value").all().map(r=>String(r.value)),
   effort:db.statement("SELECT DISTINCT COALESCE(effort,'') AS value FROM history_dimensions ORDER BY value").all().map(r=>String(r.value)),
   workspace:db.statement("SELECT DISTINCT COALESCE(workspace,'') AS value FROM history_catalogue ORDER BY value").all().map(r=>String(r.value)),
  },active:threads.filter(t=>t.calls).length,
  low:ranked.filter(t=>t.delta!<-.005).slice(0,3),high:ranked.filter(t=>t.delta!>.005).reverse().slice(0,3),
  spend:threads.sort((a,b)=>(b.cost+b.overhead)-(a.cost+a.overhead)).slice(0,6),
  context,effort,payback:{profitable:payback.profitable,evaluable:payback.evaluable,pending:payback.pending,net:payback.netSavings}};
}
export type HistoryDashboard = ReturnType<typeof readHistoryDashboard>;
