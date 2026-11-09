import type {CompactionDetail} from './compaction.js';
import type {TurnAggregate} from './turns.js';
import {HistoryDatabase} from './history-database.js';
import {statSync} from 'node:fs';
import {importHistory,type HistoryFile} from './history-import.js';
import path from 'node:path';
import {TelemetryParser} from './parser.js';
import {pricingMetadata,pricingTableSignature} from './metrics.js';
import {acceptedTranscript,privateDirectory,stateRoot} from './platform.js';
export const historyBasis=JSON.stringify({version:5,table:pricingTableSignature,...pricingMetadata});
export {HistoryBuilder,summarize,callBucket,inputCost} from './history-builder.js';
import {HistoryBuilder,summarize,callBucket,type NumericCall,type Bucket,type Payback,type ThreadHistory,type Summary} from './history-builder.js';
export type {NumericCall,Bucket,Payback,ThreadHistory,Summary} from './history-builder.js';
export function weekly(buckets:Bucket[]){const weeks=new Map<string,Bucket[]>();for(const b of buckets){const d=new Date(b.timestamp.slice(0,10));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const key=d.toISOString().slice(0,10);weeks.set(key,[...(weeks.get(key)??[]),b]);}return [...weeks].sort().map(([week,b])=>({week,summary:summarize(b)}));}
export type Efficiency={threadCompactions?:CompactionDetail[];history?:{retentionDays:number;frozenThreads:number;detailCalls?:number;sourceAvailable?:boolean};threadSamples?:NumericCall[];turns?:{other:TurnAggregate[]};activation:string;comparisonReady:boolean;thread:Summary;threadWeeks:ReturnType<typeof weekly>;paybacks:Payback[];periods:Record<string,{summary:Summary;previousSummary?:Summary;models:{model:string;summary:Summary}[];weeks:{week:string;summary:Summary}[]}>;rolling:Summary;threadRolling:Summary;progress:{processed:number;total:number;running:boolean;failed:number};pricingBasis:string};
export class EfficiencyStore {
 private snapshots=new Map<string,{value:Efficiency;bytes:number;expires:number}>();private snapshotBytes=0;
 private basisKey:string;readonly storage:HistoryDatabase;private scannedRevision?:string;private scanKey='';private lastScan=-Infinity;private lastMaintenance=-Infinity;private busy=false;private closed=false;private processed=0;private failed=0;private total=0;private importComplete=false;
 constructor(home:string,options:{backgroundMigration?:boolean}={}){const root=stateRoot(home);privateDirectory(root);this.storage=new HistoryDatabase(path.join(root,'efficiency.sqlite'),{migrate:!options.backgroundMigration});this.basisKey=this.storage.internBasis(historyBasis);this.storage.statement('INSERT OR IGNORE INTO meta VALUES (?,?)').run('activation',new Date().toISOString());}
 savedTasks(query='',includeArchived=false){return this.storage.savedTasks(query,includeArchived);}
 storageDiagnostics(){return {...this.storage.diagnostics(),backlog:Number(this.storage.statement('SELECT COUNT(*) AS n FROM history_cursors WHERE complete=0').get()!.n),frozenThreads:this.frozenThreads()};}
 private frozenThreads(){return Number(this.storage.statement("SELECT COUNT(*) AS n FROM history_sources WHERE basis<>? AND id NOT LIKE '~%'").get(this.basisKey)!.n);}
 async scan(home:string,files:HistoryFile[],complete:boolean,now=Date.now(),reconcile=true){
  const scanKey=JSON.stringify([complete,reconcile,files.map(f=>[f.id,f.file,f.end,f.title,f.workspace,f.archived])]);if(this.busy||this.closed||now-this.lastScan<5000&&scanKey===this.scanKey)return;this.scanKey=scanKey;this.lastScan=now;
  if(reconcile)this.storage.syncAvailability(files);for(const f of files)this.storage.syncCatalogue(f);
  if(!this.failed&&this.scannedRevision===this.storage.revision()&&this.importComplete===complete&&files.every(f=>{try{const st=statSync(f.file),old=this.storage.signature(f.id);return acceptedTranscript(f.file,f.id,home)&&old?.basis===historyBasis&&old.signature===JSON.stringify([st.dev,st.ino,st.size,st.mtimeMs,f.end,st.ctimeMs]);}catch{return !!this.storage.signature(f.id)&&this.storage.statement('SELECT available FROM history_catalogue WHERE source=?').get(f.id)?.available===0;}})&&now<this.storage.nextClosure()&&now-this.lastMaintenance<3600000)return;
  this.busy=true;this.total=files.length;this.processed=0;this.failed=0;
  try{this.storage.migrate(0);while(!this.closed&&this.storage.statement('SELECT 1 FROM threads LIMIT 1').get()){this.storage.migrate(1);await new Promise<void>(r=>setImmediate(r));}for(const f of files){if(this.closed)break;try{let result;do{result=importHistory(this.storage,home,f,historyBasis,{now,maxMs:40,maxBytes:4*1024*1024});await new Promise<void>(r=>setImmediate(r));}while(!this.closed&&!result.complete&&!result.waiting&&(result.bytes||result.changed));if(result.complete)while(!this.closed&&this.storage.pruneReplay(f.id,now))await new Promise<void>(r=>setImmediate(r));this.processed++;}catch{this.failed++;}}
   await this.repriceRecent(now);
   if(!this.closed&&(now-this.lastMaintenance>=3600000||now>=this.storage.nextClosure())){do{this.storage.maintenance(now);await new Promise<void>(r=>setImmediate(r));}while(!this.closed&&this.storage.hasExpired(now));this.lastMaintenance=now;}
  }catch(error){this.failed++;throw error;}finally{this.importComplete=complete&&!this.failed;if(!this.closed)this.scannedRevision=this.storage.revision();this.busy=false;if(this.closed)this.storage.close();}
 }
 private async repriceSource(id:string,now:number){
  const db=this.storage,count=Number(db.statement('SELECT COUNT(*) AS n FROM history_samples WHERE source=?').get(id)!.n),calls=db.buckets(id).reduce((n,b)=>n+b.calls,0);
  if(!count||count!==calls)return false;
  const boundaries=Number(db.statement("SELECT COUNT(*) AS n FROM history_boundaries WHERE source=? AND kind='context-limit'").get(id)!.n);
  const compactions=Number(db.statement("SELECT COUNT(*) AS n FROM history_boundaries WHERE source=? AND kind='compaction'").get(id)!.n),outcomes=db.outcomes(id).reduce((n,p)=>n+(p.events??1),0);
  if(boundaries!==count||compactions!==outcomes||compactions!==Number(db.statement('SELECT COUNT(*) AS n FROM history_compactions WHERE source=?').get(id)!.n))return false;
  const revision=db.revision(),builder=new HistoryBuilder();let position=-1;
  for(;;){const rows=db.statement(`SELECT * FROM (
    SELECT position,0 AS sort,'call' AS kind,timestamp,dimension,input,cached,cacheWrite,output,reasoning,total,ordinal,cachedRecorded,cacheWriteRecorded,outputRecorded,reasoningRecorded,NULL AS tokens FROM history_samples WHERE source=?
    UNION ALL SELECT position,1 AS sort,kind,timestamp,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,tokens FROM history_boundaries WHERE source=? AND kind IN ('compaction','retained')
   ) WHERE position>? ORDER BY position,sort LIMIT 1000`).all(id,id,position) as any[];
   if(!rows.length)break;
   for(const r of rows){position=r.position;if(r.kind==='compaction'){const raw=db.statement('SELECT data FROM history_compactions WHERE source=? AND timestamp=?').get(id,r.timestamp);const c:CompactionDetail|undefined=raw?JSON.parse(String(raw.data)):undefined;builder.compact(r.timestamp,c?.source==='recorded'?c.usage:undefined,c?.callPosition,c?.reason);}else if(r.kind==='retained')builder.retainedContext(r.tokens);else {const d=db.statement('SELECT model,effort,serviceTier,regionalProcessing FROM history_dimensions WHERE id=?').get(r.dimension) as any;const context=db.statement("SELECT tokens FROM history_boundaries WHERE source=? AND position=? AND kind='context-limit'").get(id,r.position);builder.call({...r,...d,model:d.model??undefined,effort:d.effort??undefined,serviceTier:d.serviceTier??undefined,regionalProcessing:d.regionalProcessing==null?undefined:!!d.regionalProcessing,cachedRecorded:!!r.cachedRecorded,cacheWriteRecorded:!!r.cacheWriteRecorded,outputRecorded:!!r.outputRecorded,reasoningRecorded:!!r.reasoningRecorded},context?.tokens==null?undefined:Number(context.tokens));}}
   await new Promise<void>(r=>setImmediate(r));if(this.closed)return false;
  }
  const activity=db.statement('SELECT activity FROM history_sources WHERE id=?').get(id)?.activity;if(activity)builder.activity(String(activity));const cursor=db.statement('SELECT state FROM history_cursors WHERE source=?').get(id) as any,state=cursor?JSON.parse(cursor.state):undefined;
  const end=state?.builder?.epoch?.reason==='session-end'?state.builder.epoch.completed:undefined,data=builder.finish(now,end);
  if(db.revision()!==revision)return false;
  let applied=false;db.transaction(()=>{if(db.revision()!==revision)return;
   db.statement('DELETE FROM history_daily WHERE source=?').run(id);for(const b of data.buckets)db.addBucket(id,b);
   db.statement('DELETE FROM history_outcomes WHERE source=?').run(id);db.statement('DELETE FROM history_paybacks WHERE source=?').run(id);for(const p of data.paybacks)db.updatePayback(id,p);
   for(const c of data.compactions??[])db.saveCompaction(id,0,c,now);
   db.statement('DELETE FROM history_charges WHERE source=?').run(id);data.charges.forEach((b,i)=>{const keys=['cacheInput','cacheRead','input','cached','cacheWrite','output','calls','priced','inputPriced','inputCost','cost','overhead'] as const;db.statement(`INSERT INTO history_charges VALUES(${Array(16).fill('?').join(',')})`).run(id,i,db.dimension(b),b.timestamp,...keys.map(k=>b[k]));});
   db.statement('UPDATE history_day_basis SET basis=? WHERE source=?').run(this.basisKey,id);db.statement('UPDATE history_sources SET basis=? WHERE id=?').run(this.basisKey,id);
   if(state){state.builder=builder.checkpoint();db.statement('UPDATE history_cursors SET state=? WHERE source=?').run(JSON.stringify(state),id);}db.changed();applied=true;
  });return applied;
 }
 private async repriceRecent(now:number){
  const db=this.storage,cutoff=new Date(now-89*864e5).toISOString().slice(0,10);let after='';
  while(!this.closed){const row=db.statement("SELECT s.id,b.definition FROM history_sources s LEFT JOIN history_basis b ON s.basis=b.id WHERE s.id>? AND s.id NOT LIKE '~%' AND s.basis<>? ORDER BY s.id LIMIT 1").get(after,this.basisKey) as any;if(!row)break;after=row.id;
   try{if(JSON.parse(row.definition).version!==JSON.parse(historyBasis).version)continue;}catch{continue;}
   if(await this.repriceSource(row.id,now))continue;
   const days=db.statement('SELECT day,SUM(calls) AS calls,SUM(overhead) AS overhead FROM history_daily WHERE source=? AND day>=? AND day IN (SELECT day FROM history_day_basis WHERE source=? AND basis<>?) GROUP BY day').all(row.id,cutoff,row.id,this.basisKey) as any[];
   for(const day of days){if(this.closed)return;if(day.overhead||!day.calls)continue;
    // Compaction outcomes require their complete counterfactual sequence; retain that original basis.
    if(db.statement("SELECT 1 FROM history_boundaries WHERE source=? AND kind='compaction' AND timestamp>=? AND timestamp<? LIMIT 1").get(row.id,day.day,new Date(Date.parse(day.day)+864e5).toISOString().slice(0,10)))continue;
    const revision=db.revision(),groups=new Map<string,Bucket>();let timestamp=day.day,position=-1,count=0;
    for(;;){const samples=db.statement(`SELECT t.*,d.model,d.effort,d.serviceTier,d.regionalProcessing FROM history_samples t JOIN history_dimensions d ON t.dimension=d.id WHERE source=? AND timestamp>=? AND timestamp<? AND (timestamp>? OR timestamp=? AND position>?) ORDER BY timestamp,position LIMIT 1000`).all(row.id,day.day,new Date(Date.parse(day.day)+864e5).toISOString().slice(0,10),timestamp,timestamp,position) as any[];
     if(!samples.length)break;for(const raw of samples){const sample:NumericCall={...raw,model:raw.model??undefined,effort:raw.effort??undefined,serviceTier:raw.serviceTier??undefined,regionalProcessing:raw.regionalProcessing==null?undefined:!!raw.regionalProcessing,cachedRecorded:!!raw.cachedRecorded,cacheWriteRecorded:!!raw.cacheWriteRecorded,outputRecorded:!!raw.outputRecorded,reasoningRecorded:!!raw.reasoningRecorded};const b=callBucket(sample),key=JSON.stringify([b.model,b.effort,b.serviceTier,b.regionalProcessing,b.rateBand]),old=groups.get(key);if(old){for(const k of ['cacheInput','cacheRead','input','cached','cacheWrite','output','calls','priced','inputPriced','inputCost','cost','overhead'] as const)old[k]+=b[k];}else groups.set(key,b);count++;timestamp=raw.timestamp;position=raw.position;}
     await new Promise<void>(r=>setImmediate(r));if(this.closed)return;
    }
    if(count!==day.calls||db.revision()!==revision)continue;
    db.transaction(()=>{if(db.revision()!==revision)return;db.statement('DELETE FROM history_daily WHERE source=? AND day=?').run(row.id,day.day);for(const b of groups.values())db.addBucket(row.id,b);db.statement('UPDATE history_day_basis SET basis=? WHERE source=? AND day=?').run(this.basisKey,row.id,day.day);db.changed();});
   }
   if(!db.statement('SELECT 1 FROM history_day_basis WHERE source=? AND basis<>? LIMIT 1').get(row.id,this.basisKey)&&!db.statement('SELECT 1 FROM history_outcomes WHERE source=? AND events>0 LIMIT 1').get(row.id))db.transaction(()=>{db.statement('UPDATE history_sources SET basis=? WHERE id=?').run(this.basisKey,row.id);db.changed();});
   await new Promise<void>(r=>setImmediate(r));
  }
 }
 snapshot(id?:string,now=Date.now()):Efficiency {
  const db=this.storage,key=JSON.stringify([db.revision(),id,Math.floor(now/864e5),this.importComplete,this.busy,this.failed,this.processed,this.total]);
  const cached=this.snapshots.get(key);if(cached&&now<cached.expires){this.snapshots.delete(key);this.snapshots.set(key,cached);return cached.value;}
  const frozenThreads=this.frozenThreads(),ready=this.importComplete&&!this.failed&&!frozenThreads;
  const all=db.buckets(),threadBuckets=id?db.buckets(id):[];
  const threadPays=id?db.outcomes(id):[];
  const periods:Efficiency['periods']={};
  const models=(bs:Bucket[])=>[...new Set(bs.map(b=>b.model??'Unknown model'))].map(model=>({model,summary:summarize(bs.filter(b=>(b.model??'Unknown model')===model))}));
  for(const days of ['7','30','all']){
   const start=days==='all'?undefined:new Date(now-(Number(days)-1)*864e5).toISOString().slice(0,10);
   const previousStart=start?new Date(Date.parse(start)-Number(days)*864e5).toISOString().slice(0,10):undefined;
   const buckets=start?db.buckets(undefined,start):all,earlier=start?db.buckets(undefined,previousStart,start):[];
   periods[days]={summary:summarize(buckets,db.outcomes(undefined,start)),previousSummary:start?summarize(earlier):undefined,models:models(buckets),weeks:[]};
  }
  const last=db.recent(),threadLast=id?db.recent(id):[];
  const withCharges=(calls:NumericCall[],source?:string)=>{if(!calls.length)return [];const where=source?'AND source=?':"AND source NOT LIKE '~%'";
   const overhead=Number(db.statement(`SELECT COALESCE(SUM(overhead),0) AS overhead FROM history_charges WHERE timestamp>=? AND timestamp<=? ${where}`).get(calls[0].timestamp,new Date(now).toISOString(),...(source?[source]:[]))!.overhead);
   const charge={...callBucket(calls[0]),calls:0,priced:0,inputPriced:0,cost:0,inputCost:0,overhead};return [...calls.map(callBucket),charge];};

  const paybacks=id?(db.statement('SELECT timestamp,completed,reason,calls,breakEven,net,valid FROM history_paybacks WHERE source=? ORDER BY timestamp DESC LIMIT 100').all(id) as any[]).reverse().map(p=>({...p,completed:p.completed??undefined,reason:p.reason??undefined,valid:!!p.valid})):[];
  const result:Efficiency={threadCompactions:id?db.compactionDetails(id):[],history:{retentionDays:90,frozenThreads,detailCalls:id?Number(db.statement('SELECT COUNT(*) AS n FROM history_samples WHERE source=?').get(id)!.n):0,sourceAvailable:id?db.statement('SELECT available FROM history_catalogue WHERE source=?').get(id)?.available!==0:undefined},threadSamples:threadLast,activation:String(db.statement('SELECT value FROM meta WHERE key=?').get('activation')!.value),
   turns:{other:db.turns(id)},comparisonReady:ready,
   thread:summarize(threadBuckets,threadPays),threadWeeks:[],paybacks,periods,
   rolling:summarize(withCharges(last)),threadRolling:summarize(withCharges(threadLast,id)),progress:{processed:this.processed,total:this.total,running:this.busy,failed:this.failed},pricingBasis:`Current bundled rates · verified ${pricingMetadata.verifiedAt} · effective ${pricingMetadata.configurationEffectiveDate}${frozenThreads?` · ${frozenThreads} saved chats retain their original calculation basis`:''}`};
  const bytes=Buffer.byteLength(JSON.stringify(result));if(bytes<=16*1024*1024){const prior=this.snapshots.get(key);if(prior)this.snapshotBytes-=prior.bytes;this.snapshots.set(key,{value:result,bytes,expires:Math.min((Math.floor(now/864e5)+1)*864e5,db.nextClosure())});this.snapshotBytes+=bytes;}
  while(this.snapshots.size>64||this.snapshotBytes>16*1024*1024){const oldest=this.snapshots.keys().next().value!;this.snapshotBytes-=this.snapshots.get(oldest)!.bytes;this.snapshots.delete(oldest);}return result;
 }
 close(){this.closed=true;if(!this.busy)this.storage.close();}
}
