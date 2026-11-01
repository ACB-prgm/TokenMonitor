import type {Comparison} from '../../server/src/comparisons.js';
import type {Summary} from '../../server/src/efficiency.js';
import type {Monitor} from './view.js';
import {money} from './analytics.js';
import {isDev} from '../../shared/identity.js';
export type Thresholds={efficient:number;elevated:number;significant:number;paybackLow:number;paybackGood:number;minimumEvents:number};
export const defaultThresholds:Thresholds={efficient:10,elevated:10,significant:30,paybackLow:50,paybackGood:80,minimumEvents:5};
const key=isDev?'token-monitor-dev-performance-v1':'token-monitor-performance-v1';
export function validThresholds(v:unknown):v is Thresholds {
 if(!v||typeof v!=='object')return false;
 const t=v as Thresholds;
 return Object.keys(defaultThresholds).every(k=>typeof t[k as keyof Thresholds]==='number'&&Number.isFinite(t[k as keyof Thresholds]))&&t.efficient>0&&t.efficient<=100&&t.elevated>=0&&t.significant>t.elevated&&t.significant<=1000&&t.paybackLow>=0&&t.paybackGood>t.paybackLow&&t.paybackGood<=100&&Number.isInteger(t.minimumEvents)&&t.minimumEvents>=1&&t.minimumEvents<=1000;
}
export function loadThresholds(storage?:Pick<Storage,'getItem'>):Thresholds {try{const s=storage??globalThis.localStorage;const v=JSON.parse(s.getItem(key)??'null');if(v?.version===1&&validThresholds(v.thresholds))return {...v.thresholds};}catch{}return {...defaultThresholds};}
export function saveThresholds(t:Thresholds,storage?:Pick<Storage,'setItem'>){if(!validThresholds(t))return false;try{(storage??globalThis.localStorage).setItem(key,JSON.stringify({version:1,thresholds:t}));}catch{/* In-memory preferences remain active. */}return true;}
export type Assessment={tone:'neutral'|'good'|'amber'|'bad';label:string};
export function costAssessment(c:Comparison|undefined,t=defaultThresholds):Assessment {
 if(!c||c.delta==null)return {tone:'neutral',label:'Unavailable'};
 if(c.provisional)return {tone:'neutral',label:'Provisional'};
 if(c.delta<=-t.efficient)return {tone:'good',label:'Efficient'};
 if(c.delta>t.significant)return {tone:'bad',label:'Significant increase'};
 if(c.delta>t.elevated)return {tone:'amber',label:'Elevated cost'};
 return {tone:'neutral',label:'Typical'};
}
export function paybackAssessment(s:Summary,t=defaultThresholds):Assessment {
 if(s.paybackRate==null)return {tone:'neutral',label:'No evaluable events'};
 if(s.evaluable<t.minimumEvents)return {tone:'neutral',label:'Provisional'};
 if(Math.abs(s.netSavings)<1e-12)return {tone:'neutral',label:'Break-even'};
 if(s.netSavings<0||s.paybackRate<t.paybackLow)return {tone:'bad',label:'Not recovering costs'};
 if(s.paybackRate<t.paybackGood)return {tone:'amber',label:'Mixed recovery'};
 return {tone:'good',label:'Positive savings'};
}
export type Insight={id:string;title:string;finding:string;impact:string;recommendation:string;tone:Assessment['tone'];details?:{label:string;value:string}[]};
export function efficiencyInsights(s:Monitor,t=defaultThresholds):Insight[] {
 const found:Insight[]=[],d=s.efficiency,c=d?.comparisons?.thread;
 if(s.contextPercent!=null&&s.contextPercent>=85)found.push({id:'capacity',title:'Context approaching capacity',finding:`The context window is ${s.contextPercent.toFixed(1)}% utilized.`,impact:'Less space remains for additional context; this alone does not establish inefficient spending.',recommendation:'Review retained context before adding large inputs. Consider a new thread if you are switching to an unrelated task.',tone:s.contextPercent>=95?'bad':'amber'});
 if(d&&d.thread.evaluable>=t.minimumEvents&&d.thread.netSavings < -1e-12)found.push({id:'compaction',title:'Compaction costs not recovered',finding:`${d.thread.evaluable} completed, evaluable compactions have negative modeled net savings.`,impact:'Their estimated processing savings have not covered their modeled overhead.',recommendation:'Review the compaction results before repeating this strategy; allow for the amount of subsequent work.',tone:'bad'});
 const forecast=s.compactionTurnPayback,f=s.compactionValue;
 if(s.available===true&&!s.disconnected&&forecast?.status==='available'&&forecast.turns!=null&&forecast.turns<=forecast.epochCompleted){
  const mean=(n?:number)=>n==null?'Unavailable':n.toFixed(2);
  found.push({id:'compaction-forecast',title:`Compaction may pay back in ≈${forecast.turns} more ${forecast.turns===1?'turn':'turns'}`,finding:`Projected break-even is ${forecast.calls} model calls, or approximately ${forecast.turns} more user turns. This epoch has ${forecast.epochCompleted} completed turns.`,impact:`Modeled net savings are ${money(forecast.netSavingsUsd)} over the next ${f?.horizonCalls??20} calls.`,recommendation:'Continuing work that needs this chat’s context? Consider compacting. Starting unrelated work? Consider a new chat.',tone:'neutral',details:[
   {label:'Completed turns',value:`This chat: ${forecast.threadTurns}; other chats: ${forecast.historyTurns}`},
   {label:'Mean calls per turn',value:`This chat: ${mean(forecast.threadMean)}; other chats: ${mean(forecast.historyMean)}`},
   {label:'Conservative conversion',value:`Source: ${forecast.source}; ${mean(forecast.bufferedMean)} calls/turn after a 25% downward buffer; payback rounded up. This is a heuristic, not a statistical confidence bound.`},
   {label:'Forecast assumptions',value:`Warm prefix reuse; retained context ${f?.estimatedInput??'—'} tokens; compaction output ${f?.compactionOutput??'—'} tokens; growth ${f?.growthPerCall??'—'} tokens/call (${f?.assumptions.growth?.source??'—'}, ${f?.assumptions.growth?.source==='user'?f.assumptions.growth.userSampleCount:f?.assumptions.growth?.sampleCount??0} intervals); typical output ${f?.typicalOutput??'—'} tokens (${f?.assumptions.output?.sampleCount??0} samples).`},
   {label:'Pricing and overhead',value:`${f?.model??'Unknown model'}; ${f?.serviceTier??'standard assumed'}; regional pricing ${f?.regionalProcessing?'enabled':'disabled'}; compaction overhead ${money(f?.compactionOverheadUsd)}. API-equivalent estimates, not subscription charges.`}
  ]});
 }
 if(c?.context&&!c.context.provisional&&c.context.delta!=null&&c.context.delta>t.elevated)found.push({id:'context',title:'Elevated context overhead',finding:`Average input cost is ${c.context.delta.toFixed(1)}% above the comparable baseline.`,impact:'Repeated input processing is costing more per call within matching models.',recommendation:'Review carried context. Consider a new thread when switching to an unrelated task.',tone:costAssessment(c.context,t).tone});
 if(c?.cost&&!c.cost.provisional&&c.cost.delta!=null&&c.cost.delta>t.elevated)found.push({id:'cost',title:'Elevated cost per call',finding:`Comparable cost per call is ${c.cost.delta.toFixed(1)}% above baseline.`,impact:'Estimated resource spending per call increased; these measurements cannot establish task complexity or quality.',recommendation:'Inspect call composition to see whether input, output, or compaction charges explain the increase.',tone:costAssessment(c.cost,t).tone});
 if(c?.cache&&!c.cache.provisional&&c.cache.current!=null&&c.cache.reference!=null&&c.cache.reference-c.cache.current>=20)found.push({id:'cache',title:'Lower comparable cache reuse',finding:`Cache-read share is ${(c.cache.reference-c.cache.current).toFixed(1)} percentage points below baseline.`,impact:'A smaller share of recorded input benefits from cache-read pricing.',recommendation:'Inspect fresh-input composition and recent call details for changes in reusable context.',tone:'amber'});
 if(found.length)return found.slice(0,2);
 const healthy=c&&[c.cost,c.context,c.cache].every(v=>!v.provisional&&v.delta!=null)&&s.contextPercent!=null;
 return [{id:healthy?'healthy':'gathering',title:healthy?'No action needed':'Still gathering comparable history',finding:healthy?'No supported resource-efficiency issue was detected.':'Comparable samples or pricing coverage are not yet sufficient for an efficiency assessment.',impact:healthy?'Current recorded spending and cache reuse are within the configured thresholds.':'Mixed models, unknown reasoning settings, and small samples can make comparisons misleading.',recommendation:healthy?'Continue monitoring; no immediate optimization is recommended.':'Continue normal use and inspect KPI details for comparison coverage.',tone:healthy?'good':'neutral'}];
}
