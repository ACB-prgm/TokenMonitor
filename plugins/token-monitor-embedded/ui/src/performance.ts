export type KpiComparison={current:number|null;reference:number|null;delta:number|null;currentCalls:number;referenceCalls:number;provisional:boolean;reason?:string};
import type {Summary} from '../../server/src/efficiency.js';
import type {Monitor} from './view.js';
import {money} from './analytics.js';
import {performanceThresholds as defaultThresholds} from './performance-config.js';
export {performanceThresholds as defaultThresholds} from './performance-config.js';
export type Assessment={tone:'neutral'|'good'|'amber'|'bad';label:string};
export function costAssessment(c:KpiComparison|undefined,t=defaultThresholds):Assessment {
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
export function efficiencyInsights(s:Monitor):Insight[] {
 const found:Insight[]=[];
 if(s.contextPercent!=null&&s.contextPercent>=85)found.push({id:'capacity',title:'Context approaching capacity',finding:`The context window is ${s.contextPercent.toFixed(1)}% utilized.`,impact:'Less space remains for additional context; this alone does not establish inefficient spending.',recommendation:'Review retained context before adding large inputs. Consider a new thread if you are switching to an unrelated task.',tone:s.contextPercent>=95?'bad':'amber'});
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
 return found;
}
