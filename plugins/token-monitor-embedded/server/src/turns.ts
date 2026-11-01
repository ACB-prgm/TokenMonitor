import {BoundedSet,date,type CompactionForecast,type RecordValue} from './metrics.js';
export type TurnAggregate={model:string;turns:number;calls:number};
export type TurnStats={models:TurnAggregate[];epochCompleted:number};
/** Numeric lifecycle accounting; no prompt, response or tool content is retained. */
export class TurnCounter {
 private active?:{id?:string;started:string;user:boolean;calls:number;model?:string;invalid:boolean;spanning:boolean};
 private seen=new BoundedSet();private starts=new BoundedSet();private messages=new BoundedSet();
 private groups=new Map<string,TurnAggregate>();epochCompleted=0;
 constructor(private completed?:(turn:TurnAggregate)=>void){}
 consume(type:string,p:RecordValue,timestamp?:string){
  if(!timestamp)return;
  const id=typeof p.turn_id==='string'?p.turn_id:undefined;
  if(type==='compacted'){this.epochCompleted=0;if(this.active)this.active.spanning=true;return;}
  if(type==='turn_context'&&this.active&&id&&this.active.id&&id!==this.active.id)this.active.invalid=true;
  if(type==='response_item'&&p.type==='message'&&p.role==='user'){if(this.active)this.active.user=true;return;}
  if(type!=='event_msg')return;
  if(p.type==='task_started'){
   if(!id||!this.starts.add(id))return;
   const trigger=p.turn_attribution?.turn_trigger;
   this.active={id,started:timestamp,user:trigger==='composer',calls:0,invalid:typeof trigger==='string'&&trigger!=='composer',spanning:false};return;
  }
  if(p.type==='user_message'){
   if(!this.messages.add(JSON.stringify([id,timestamp])))return;
   if(this.active&&(!id||id===this.active.id)){this.active.user=true;return;}
   this.active={id,started:timestamp,user:true,calls:0,invalid:false,spanning:false};return;
  }
  if(['task_aborted','turn_aborted'].includes(p.type)){if(!id||this.active?.id===id)this.active=undefined;return;}
  if(p.type!=='task_complete')return;
  const a=this.active;if(!a||id&&a.id!==id)return;
  this.active=undefined;
  const key=a.id??JSON.stringify([a.started,timestamp]);if(!this.seen.add(key)||timestamp<a.started||!a.user||a.invalid||!a.calls||!a.model)return;
  if(!a.spanning)this.epochCompleted++;
  const turn={model:a.model,turns:1,calls:a.calls},old=this.groups.get(a.model);
  if(old){old.turns++;old.calls+=a.calls;}else this.groups.set(a.model,{...turn});
  this.completed?.(turn);
 }
 call(model?:string){const a=this.active;if(!a)return;a.calls++;if(!model||a.model&&a.model!==model)a.invalid=true;else a.model=model;}
 snapshot():TurnStats{return {models:[...this.groups.values()].map(g=>({...g})),epochCompleted:this.epochCompleted};}
}
export type TurnPayback={status:'available'|'unavailable';reason?:string;turns?:number;calls?:number;epochCompleted:number;threadTurns:number;historyTurns:number;threadMean?:number;historyMean?:number;bufferedMean?:number;source?:'thread'|'history'|'both';buffer:number;netSavingsUsd?:number};
export function estimateTurnPayback(input:{forecast?:CompactionForecast;stats?:TurnStats;history?:TurnAggregate[];ready:boolean;available:boolean;lastCall?:string;now:number;isCompacting?:boolean;awaitingPostCompactionCall?:boolean;ended?:boolean;latestPayback?:{valid:boolean;breakEven:number|null};hasCompactions?:boolean}):TurnPayback {
 const f=input.forecast,model=f?.model,t=input.stats?.models.find(g=>g.model===model),h=input.history?.find(g=>g.model===model);
 const mean=(g?:TurnAggregate)=>g&&g.turns>0&&Number.isFinite(g.calls)&&g.calls>0?g.calls/g.turns:undefined;
 const result:TurnPayback={status:'unavailable',epochCompleted:input.stats?.epochCompleted??0,threadTurns:t?.turns??0,historyTurns:h?.turns??0,threadMean:mean(t),historyMean:mean(h),buffer:.75};
 const fail=(reason:string)=>({...result,reason});
 if(!input.available||input.ended||!date(input.lastCall)||input.now-Date.parse(input.lastCall!)>7200000||input.now<Date.parse(input.lastCall!))return fail('Current transcript or recent call unavailable');
 if(!input.ready)return fail('Historical turn import is incomplete');
 if(input.isCompacting||input.awaitingPostCompactionCall)return fail('Waiting for reliable post-compaction telemetry');
 if(input.hasCompactions&&(!input.latestPayback?.valid||input.latestPayback.breakEven==null))return fail('The latest compaction has not demonstrably reached break-even');
 if(!f||f.status!=='available'||!f.assumptions.pricingAvailable||!f.assumptions.contextLimitKnown||!f.assumptions.growth||f.assumptions.growth.source==='default'||!f.assumptions.output||f.assumptions.output.fallback)return fail('Observed growth, output, context and pricing are required');
 if(f.breakEvenCalls==null||!Number.isFinite(f.breakEvenCalls)||f.breakEvenCalls<=0||f.breakEvenCalls>f.completedCalls||f.breakEvenCalls>f.horizonCalls||f.netSavingsUsd==null||!Number.isFinite(f.netSavingsUsd)||f.netSavingsUsd<.000001)return fail('No supported positive payback within the forecast horizon');
 const thread=result.threadTurns>=5&&result.threadMean!=null,history=result.historyTurns>=20&&result.historyMean!=null;
 if(!thread&&!history)return fail('Need 5 completed same-model turns in this chat or 20 in other chats');
 const rate=Math.min(...[thread?result.threadMean!:Infinity,history?result.historyMean!:Infinity])*.75;
 if(!Number.isFinite(rate)||rate<=0)return fail('Calls per turn unavailable');
 return {...result,status:'available',turns:Math.ceil(f.breakEvenCalls/rate),calls:f.breakEvenCalls,bufferedMean:rate,source:thread&&history?'both':thread?'thread':'history',netSavingsUsd:f.netSavingsUsd};
}
