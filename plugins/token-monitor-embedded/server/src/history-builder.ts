import {compactionDetail,updateReplacement,updateTotal,type CompactionDetail,type CompactionUsage} from './compaction.js';
import type {TurnAggregate} from './turns.js';
import {inputCost,price,rates,COMPACTION_DEFAULTS as D,type Sample} from './metrics.js';
export type NumericCall=Omit<Sample,'activity'|'price'>;
export type Bucket={timestamp:string;model?:string;effort?:string;rateBand?:string;cacheInput:number;cacheRead:number;serviceTier?:string;regionalProcessing?:boolean;input:number;cached:number;cacheWrite:number;output:number;calls:number;priced:number;inputPriced:number;inputCost:number;cost:number;overhead:number};
export type Payback={events?:number;timestamp:string;completed?:string;reason?:string;calls:number;breakEven:number|null;net:number;valid:boolean};
export type ThreadHistory={first:NumericCall[];last:NumericCall[];buckets:Bucket[];paybacks:Payback[];activity?:string;charges:Bucket[];compactions?:CompactionDetail[];turns?:TurnAggregate[]};
export {inputCost} from './metrics.js';
export function summarize(buckets:Bucket[],paybacks:Payback[]=[]){
 const total={calls:0,priced:0,inputPriced:0,cost:0,inputCost:0,overhead:0};
 for(const b of buckets)for(const k of Object.keys(total) as (keyof typeof total)[])total[k]+=b[k];
 // Break-even resolves payback immediately; closure still governs the epoch lifecycle.
 const resolved=(p:Payback)=>!!p.completed||p.valid&&p.breakEven!=null;
 const valid=paybacks.filter(p=>resolved(p)&&p.valid),profitable=valid.filter(p=>p.breakEven!=null);
 const count=(ps:Payback[])=>ps.reduce((n,p)=>n+(p.events??1),0),evaluable=count(valid);
 return {...total,costPerCall:total.priced?(total.cost+total.overhead)/total.priced:null,contextPerCall:total.inputPriced?total.inputCost/total.inputPriced:null,
  paybackRate:evaluable?count(profitable)/evaluable*100:null,netSavings:valid.reduce((s,p)=>s+p.net,0),evaluable,profitable:count(profitable),
  pending:count(paybacks.filter(p=>!resolved(p))),excluded:count(paybacks.filter(p=>p.completed&&!p.valid)),inactivity:count(valid.filter(p=>p.reason==='inactivity'))};
}
export type Summary=ReturnType<typeof summarize>;
export function callBucket(s:NumericCall):Bucket{const c=inputCost(s),p=price(s);return {timestamp:s.timestamp,model:s.model,effort:s.effort,rateBand:JSON.stringify(rates(s.model,s.serviceTier,s.input,s.regionalProcessing)),cacheInput:c!=null?s.input:0,cacheRead:c!=null?s.cached:0,serviceTier:s.serviceTier,regionalProcessing:s.regionalProcessing,input:s.input,cached:s.cached,cacheWrite:s.cacheWrite,output:s.output,calls:1,priced:p.total!=null?1:0,inputPriced:c!=null?1:0,cost:p.total??0,inputCost:c??0,overhead:0};}
export class HistoryBuilder {
 data:ThreadHistory={first:[],last:[],buckets:[],paybacks:[],charges:[]};private groups=new Map<string,Bucket>();private previous?:NumericCall;private epoch?:Payback;private retained?:number;private before?:NumericCall;private overheadBucket?:Bucket;private charge?:Bucket;private originalRead=0;private overhead=0;private compaction?:CompactionDetail;
 turn(turn:TurnAggregate){const groups=this.data.turns??=[];const old=groups.find(g=>g.model===turn.model);if(old){old.turns+=turn.turns;old.calls+=turn.calls;}else groups.push({...turn});}
 retainedContext(tokens:number){if(!this.epoch||!this.compaction)return;this.retained=tokens;const old=this.compaction.totalCost;updateReplacement(this.compaction,tokens);const total=this.compaction.totalCost;if(old==null||total==null){this.epoch.valid=false;return;}const delta=total-old;this.overhead+=delta;this.epoch.net-=delta;if(this.overheadBucket)this.overheadBucket.overhead+=delta;if(this.charge)this.charge.overhead+=delta;}
 checkpoint(){const numeric=(s?:NumericCall)=>s?Object.fromEntries(['timestamp','model','effort','serviceTier','regionalProcessing','input','cached','cacheWrite','output','reasoning','total','ordinal','outputRecorded','reasoningRecorded','cachedRecorded','cacheWriteRecorded'].map(k=>[k,(s as any)[k]])) as NumericCall:undefined;return {previous:numeric(this.previous),before:numeric(this.before),epoch:this.epoch,retained:this.retained,charge:this.charge,originalRead:this.originalRead,overhead:this.overhead,activity:this.data.activity,compaction:this.compaction};}
 restore(s:ReturnType<HistoryBuilder['checkpoint']>){this.compaction=s.compaction;if(this.compaction)(this.data.compactions??=[]).push(this.compaction);this.previous=s.previous;this.before=s.before;this.epoch=s.epoch;this.retained=s.retained;this.charge=s.charge;this.originalRead=s.originalRead;this.overhead=s.overhead;this.data.activity=s.activity;if(this.epoch)this.data.paybacks.push(this.epoch);if(this.charge){this.data.charges.push(this.charge);const delta={...this.charge,overhead:0};this.add(delta);this.overheadBucket=this.groups.get(this.groupKey(delta));}}
 activity(timestamp:string){if(this.epoch?.completed&&['inactivity','session-end'].includes(this.epoch.reason??'')&&timestamp>this.epoch.completed){this.epoch.completed=undefined;this.epoch.reason=undefined;}this.data.activity=timestamp;}
 compact(timestamp:string,usage?:CompactionUsage,callPosition=0,reason?:string){
 if(this.epoch)this.epoch.completed=timestamp,this.epoch.reason='compaction';this.before=this.previous;this.retained=undefined;
 const detail=compactionDetail(timestamp,callPosition,this.before,usage,reason);this.compaction=detail;(this.data.compactions??=[]).push(detail);
 this.epoch={timestamp,calls:0,breakEven:null,net:-(detail.totalCost??0),valid:!!this.before&&detail.totalCost!=null};this.data.paybacks.push(this.epoch);this.overhead=detail.totalCost??0;this.originalRead=0;this.charge=undefined;this.overheadBucket=undefined;
 if(detail.totalCost!=null&&detail.usage){const b={...callBucket(detail.usage),timestamp,calls:0,priced:0,inputPriced:0,cost:0,inputCost:0,input:0,cached:0,cacheInput:0,cacheRead:0,cacheWrite:0,output:0,overhead:detail.totalCost};this.charge=b;this.data.charges.push(b);this.add(b);this.overheadBucket=this.groups.get(this.groupKey(b));}
 return detail;
 }
 private groupKey(b:Bucket){return JSON.stringify([b.timestamp.slice(0,10),b.model,b.effort,b.serviceTier,b.regionalProcessing,b.rateBand]);}
 private add(b:Bucket){const key=this.groupKey(b);const old=this.groups.get(key);if(old){for(const k of ['calls','priced','inputPriced','cost','inputCost','overhead','input','cached','cacheWrite','output','cacheInput','cacheRead'] as const)old[k]+=b[k];}else {const copy={...b};this.groups.set(key,copy);this.data.buckets.push(copy);}}
 call(s:NumericCall,limit?:number){if(this.data.first.length<100)this.data.first.push(s);this.data.last.push(s);if(this.data.last.length>100)this.data.last.shift();this.add(callBucket(s));
 if(this.epoch&&this.before){
  const e=this.epoch;e.calls++;this.retained??=D.POST_COMPACTION_TOKENS;
  let credit=0;
  if(e.calls===1&&s.cacheWriteRecorded&&s.cacheWrite>=0&&s.cacheWrite<=s.input-s.cached){
   const u=this.compaction?.usage,r=rates(u?.model,u?.serviceTier,this.retained,u?.regionalProcessing);
   credit=Math.min(this.compaction?.replacementWrite??0,Math.min(s.cacheWrite,this.retained)*(r?.write??0)/1e6);
   if(this.compaction){this.compaction.writeCredit=credit;updateTotal(this.compaction);}
   if(this.overheadBucket)this.overheadBucket.overhead-=credit;if(this.charge)this.charge.overhead-=credit;
  }
  const removed=this.before.input-this.retained,counter={...s,input:s.input+removed,cached:s.cached+removed};
  const a=price(counter).total,b=price(s).total;
  if(removed<0||a==null||b==null||limit!=null&&counter.input>limit)e.valid=false;
  else {e.net+=a-b+credit;if(e.breakEven==null&&e.net>=-1e-12)e.breakEven=e.calls;}
 }

 this.previous=s;}
 finish(now:number,end?:string){const e=this.epoch;if(e&&!e.completed){if(end&&end>=(this.data.activity??'')){e.completed=end;e.reason='session-end';}else if(this.data.activity&&now-Date.parse(this.data.activity)>=7*864e5){e.completed=new Date(Date.parse(this.data.activity)+7*864e5).toISOString();e.reason='inactivity';}}return this.data;}
}
