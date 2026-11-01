import type {TurnAggregate} from './turns.js';
import {compareCohorts,type Comparisons} from './comparisons.js';
import {HistoryDatabase} from './history-database.js';
import type {DatabaseSync} from 'node:sqlite';
import {createReadStream,chmodSync,statSync} from 'node:fs';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {TelemetryParser} from './parser.js';
import {price,rates,pricingMetadata,pricingTableSignature,COMPACTION_DEFAULTS as D,type Sample} from './metrics.js';
import {acceptedTranscript,privateDirectory,stateRoot} from './platform.js';
export type NumericCall=Omit<Sample,'activity'|'price'>;
export type Bucket={timestamp:string;model?:string;effort?:string;rateBand?:string;cacheInput:number;cacheRead:number;serviceTier?:string;regionalProcessing?:boolean;input:number;cached:number;cacheWrite:number;output:number;calls:number;priced:number;inputPriced:number;inputCost:number;cost:number;overhead:number};
export type Payback={timestamp:string;completed?:string;reason?:string;calls:number;breakEven:number|null;net:number;valid:boolean};
export type ThreadHistory={first:NumericCall[];last:NumericCall[];buckets:Bucket[];paybacks:Payback[];activity?:string;charges:Bucket[];turns?:TurnAggregate[]};
const basis=JSON.stringify({version:4,table:pricingTableSignature,...pricingMetadata});
export function inputCost(s:NumericCall){const r=rates(s.model,s.serviceTier,s.input,s.regionalProcessing);if(!r||!s.cachedRecorded||!s.cacheWriteRecorded||s.cached<0||s.cacheWrite<0||s.cached+s.cacheWrite>s.input||s.cacheWrite>0&&r.write==null)return;return ((s.input-s.cached-s.cacheWrite)*r.input+s.cached*r.cached+s.cacheWrite*(r.write??0))/1e6;}
export function summarize(buckets:Bucket[],paybacks:Payback[]=[]){const total={calls:0,priced:0,inputPriced:0,cost:0,inputCost:0,overhead:0};for(const b of buckets)for(const k of Object.keys(total) as (keyof typeof total)[])total[k]+=b[k];const complete=paybacks.filter(p=>p.completed),valid=complete.filter(p=>p.valid);return {...total,costPerCall:total.priced?(total.cost+total.overhead)/total.priced:null,contextPerCall:total.inputPriced?total.inputCost/total.inputPriced:null,paybackRate:valid.length?valid.filter(p=>p.breakEven!=null).length/valid.length*100:null,netSavings:valid.reduce((s,p)=>s+p.net,0),evaluable:valid.length,profitable:valid.filter(p=>p.breakEven!=null).length,pending:paybacks.length-complete.length,excluded:complete.length-valid.length,inactivity:valid.filter(p=>p.reason==='inactivity').length};}
export type Summary=ReturnType<typeof summarize>;
export function callBucket(s:NumericCall):Bucket{const c=inputCost(s),p=price(s);return {timestamp:s.timestamp,model:s.model,effort:s.effort,rateBand:JSON.stringify(rates(s.model,s.serviceTier,s.input,s.regionalProcessing)),cacheInput:c!=null?s.input:0,cacheRead:c!=null?s.cached:0,serviceTier:s.serviceTier,regionalProcessing:s.regionalProcessing,input:s.input,cached:s.cached,cacheWrite:s.cacheWrite,output:s.output,calls:1,priced:p.total!=null?1:0,inputPriced:c!=null?1:0,cost:p.total??0,inputCost:c??0,overhead:0};}
export class HistoryBuilder {
 data:ThreadHistory={first:[],last:[],buckets:[],paybacks:[],charges:[]};private groups=new Map<string,Bucket>();private previous?:NumericCall;private epoch?:Payback;private retained?:number;private before?:NumericCall;private overheadBucket?:Bucket;private charge?:Bucket;private originalRead=0;private overhead=0;
 turn(turn:TurnAggregate){const groups=this.data.turns??=[];const old=groups.find(g=>g.model===turn.model);if(old){old.turns+=turn.turns;old.calls+=turn.calls;}else groups.push({...turn});}
 retainedContext(tokens:number){if(!this.epoch||!this.before)return;this.retained=tokens;const r=rates(this.before.model,this.before.serviceTier,tokens,this.before.regionalProcessing);if(r?.write==null){this.epoch.valid=false;return;}const old=rates(this.before.model,this.before.serviceTier,D.POST_COMPACTION_TOKENS,this.before.regionalProcessing);const delta=(tokens*r.write-D.POST_COMPACTION_TOKENS*(old?.write??0))/1e6;this.overhead+=delta;this.epoch.net-=delta;if(this.overheadBucket)this.overheadBucket.overhead+=delta;if(this.charge)this.charge.overhead+=delta;}
 activity(timestamp:string){this.data.activity=timestamp;}
 compact(timestamp:string){if(this.epoch)this.epoch.completed=timestamp,this.epoch.reason='compaction';this.before=this.previous;this.retained=undefined;this.epoch={timestamp,calls:0,breakEven:null,net:0,valid:!!this.before};this.data.paybacks.push(this.epoch);this.overhead=0;this.originalRead=0;
 if(this.before){const s=this.before,r=rates(s.model,s.serviceTier,s.input,s.regionalProcessing),replacement=rates(s.model,s.serviceTier,D.POST_COMPACTION_TOKENS,s.regionalProcessing);if(r&&replacement?.write!=null){this.overhead=(D.COMPACTION_OUTPUT_TOKENS*r.output+D.POST_COMPACTION_TOKENS*replacement.write)/1e6;this.originalRead=s.input*r.cached/1e6;this.epoch.net=-this.overhead-this.originalRead;const b={...callBucket(s),timestamp,calls:0,priced:0,inputPriced:0,cost:0,inputCost:0,input:0,cached:0,cacheInput:0,cacheRead:0,cacheWrite:0,output:0,overhead:this.overhead+this.originalRead};this.charge=b;this.data.charges.push(b);this.add(b);this.overheadBucket=this.groups.get(this.groupKey(b));}else this.epoch.valid=false;}}
 private groupKey(b:Bucket){return JSON.stringify([b.timestamp.slice(0,10),b.model,b.effort,b.serviceTier,b.regionalProcessing,b.rateBand]);}
 private add(b:Bucket){const key=this.groupKey(b);const old=this.groups.get(key);if(old){for(const k of ['calls','priced','inputPriced','cost','inputCost','overhead','input','cached','cacheWrite','output','cacheInput','cacheRead'] as const)old[k]+=b[k];}else {const copy={...b};this.groups.set(key,copy);this.data.buckets.push(copy);}}
 call(s:NumericCall,limit?:number){if(this.data.first.length<100)this.data.first.push(s);this.data.last.push(s);if(this.data.last.length>100)this.data.last.shift();this.add(callBucket(s));
 if(this.epoch&&this.before){const e=this.epoch;e.calls++;this.retained??=D.POST_COMPACTION_TOKENS;const removed=this.before.input-this.retained;const counter={...s,input:s.input+removed,cached:s.cached+removed};const a=price(counter).total,b=price(s).total;if(removed<0||a==null||b==null||limit!=null&&counter.input>limit)e.valid=false;else {let credit=0;if(e.calls===1){const r=rates(this.before.model,this.before.serviceTier,D.POST_COMPACTION_TOKENS,this.before.regionalProcessing);credit=Math.min(s.cacheWrite,this.retained)*(r?.write??0)/1e6;if(credit){if(this.overheadBucket)this.overheadBucket.overhead-=credit;if(this.charge)this.charge.overhead-=credit;}}e.net+=a-b+credit;if(e.breakEven==null&&e.net>=-1e-12)e.breakEven=e.calls;}}
 this.previous=s;}
 finish(now:number,end?:string){const e=this.epoch;if(e&&!e.completed){if(end&&end>=(this.data.activity??'')){e.completed=end;e.reason='session-end';}else if(this.data.activity&&now-Date.parse(this.data.activity)>=7*864e5){e.completed=new Date(Date.parse(this.data.activity)+7*864e5).toISOString();e.reason='inactivity';}}return this.data;}
}
export function weekly(buckets:Bucket[]){const weeks=new Map<string,Bucket[]>();for(const b of buckets){const d=new Date(b.timestamp.slice(0,10));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const key=d.toISOString().slice(0,10);weeks.set(key,[...(weeks.get(key)??[]),b]);}return [...weeks].sort().map(([week,b])=>({week,summary:summarize(b)}));}
// Historical chart references require cohort totals, not every chat/day bucket.
function cohortTotals(buckets:Bucket[]):Bucket[]{const groups=new Map<string,Bucket>();for(const b of buckets){const key=JSON.stringify([b.model,b.effort,b.serviceTier,b.regionalProcessing,b.rateBand]);const old=groups.get(key);if(!old)groups.set(key,{...b});else for(const k of ['cacheInput','cacheRead','input','cached','cacheWrite','output','calls','priced','inputPriced','inputCost','cost','overhead'] as const)old[k]+=b[k];}return [...groups.values()];}
export type Efficiency={history?:{retentionDays:number;frozenThreads:number};turns?:{other:TurnAggregate[]};reference?:{buckets:Bucket[];ready:boolean};comparisons?:{thread:Comparisons;periods:Record<string,Comparisons>};activation:string;baseline:Summary;baselineCalls:number;baselineProvisional:boolean;baselineStart?:string;baselineEnd?:string;thread:Summary;threadWeeks:ReturnType<typeof weekly>;threadModels:{model:string;summary:Summary;baseline:Summary}[];baselineModels:{model:string;summary:Summary}[];paybacks:Payback[];periods:Record<string,{summary:Summary;previousSummary?:Summary;models:{model:string;summary:Summary}[];weeks:{week:string;summary:Summary}[]}>;rolling:Summary;threadRolling:Summary;progress:{processed:number;total:number;running:boolean;failed:number};pricingBasis:string};
export class EfficiencyStore {
 private snapshots=new Map<string,{value:Efficiency;bytes:number;expires:number}>();private snapshotBytes=0;private storage:HistoryDatabase;private db:DatabaseSync;private cachedHistories?:{revision:string;rows:{id:string;basis:string;data:ThreadHistory}[]};private lastScan=-Infinity;private busy=false;private closed=false;private processed=0;private failed=0;private total=0;private importComplete=false;
 constructor(home:string){const root=stateRoot(home);privateDirectory(root);this.storage=new HistoryDatabase(path.join(root,'efficiency.sqlite'));this.db=this.storage.db;this.db.prepare('INSERT OR IGNORE INTO meta VALUES (?,?)').run('activation',new Date().toISOString());}
 storageDiagnostics(){return this.storage.diagnostics();}

 async scan(home:string,files:{id:string;file:string;end?:string}[],complete:boolean,now=Date.now()) {if(this.busy||this.closed||now-this.lastScan<5000)return;this.lastScan=now;this.busy=true;this.total=files.length;this.processed=0;this.failed=0;
 try{for(const f of files){if(this.closed)break;try{if(!acceptedTranscript(f.file,f.id,home))continue;const st=statSync(f.file),sig=JSON.stringify([st.dev,st.ino,st.size,st.mtimeMs,f.end]);const old=this.storage.signature(f.id);if(old?.signature===sig&&old.basis===basis){this.processed++;continue;}const detail:NumericCall[]=[],b=new HistoryBuilder(),p=new TelemetryParser(e=>{if(e.kind==='activity')b.activity(e.timestamp);else if(e.kind==='compaction')b.compact(e.timestamp);else if(e.kind==='retained')b.retainedContext(e.tokens);else if(e.kind==='turn')b.turn(e.turn);else {b.call(e.sample,e.contextLimit);if(e.sample.timestamp.slice(0,10)>=new Date(now-89*864e5).toISOString().slice(0,10))detail.push(e.sample);}});const lines=createInterface({input:createReadStream(f.file),crlfDelay:Infinity});for await(const line of lines){if(this.closed)break;if(line.length<=4*1024*1024)p.consume(line);}if(this.closed)break;this.storage.replace(f.id,sig,basis,b.finish(now,f.end),detail);this.processed++;}catch{this.failed++;}await new Promise<void>(r=>setImmediate(r));}}

 finally{if(!this.closed)try{this.storage.maintenance(now);}catch{this.failed++;}this.importComplete=complete&&!this.failed;this.busy=false;if(this.closed)this.db.close();}}
 private completeInactive(data:ThreadHistory,now:number){const e=data.paybacks.at(-1);if(e&&!e.completed&&data.activity&&now-Date.parse(data.activity)>=7*864e5){e.completed=new Date(Date.parse(data.activity)+7*864e5).toISOString();e.reason='inactivity';}return data;}
 private histories(now=Date.now()){const revision=this.storage.revision();if(this.cachedHistories?.revision!==revision)this.cachedHistories={revision,rows:this.storage.histories()};return this.cachedHistories.rows.map(r=>({id:r.id,data:this.completeInactive(structuredClone(r.data),now)}));}

 snapshot(id?:string,now=Date.now()):Efficiency {
  const key=JSON.stringify([this.storage.revision(),id,now-(now%864e5),this.importComplete,this.busy,this.failed,this.processed,this.total]);
  const cached=this.snapshots.get(key);if(cached&&now<cached.expires){this.snapshots.delete(key);this.snapshots.set(key,cached);return cached.value;}
  const rows=this.histories(now),all=rows.flatMap(r=>r.data.buckets),pays=rows.flatMap(r=>r.data.paybacks);
  const thread=rows.find(r=>r.id===id)?.data;
  const reference=rows.filter(r=>r.id!==id).flatMap(r=>r.data.buckets);
  const frozenThreads=this.cachedHistories?.rows.filter(r=>r.basis!==basis).length??0;
  const ready=this.importComplete&&!this.failed&&!frozenThreads;
  const other:TurnAggregate[]=[];for(const r of rows.filter(r=>r.id!==id))for(const g of r.data.turns??[]){const old=other.find(x=>x.model===g.model);if(old){old.turns+=g.turns;old.calls+=g.calls;}else other.push({...g});}
  const periods:Efficiency['periods']={},comparisonPeriods:Record<string,Comparisons>={};
  for(const days of ['7','30','all']){
    const start=days==='all'?'':new Date(now-(Number(days)-1)*864e5).toISOString().slice(0,10);
    const buckets=all.filter(b=>b.timestamp.slice(0,10)>=start);
    const previousStart=days==='all'?'':new Date(Date.parse(start)-Number(days)*864e5).toISOString().slice(0,10);
    const earlier=days==='all'?[]:all.filter(b=>b.timestamp.slice(0,10)>=previousStart&&b.timestamp.slice(0,10)<start);
    const events=pays.filter(p=>(p.completed??p.timestamp).slice(0,10)>=start);
    comparisonPeriods[days]={...compareCohorts(buckets,earlier,ready),referenceLabel:days==='all'?'No earlier reference exists when All history is selected.':`Previous ${days} days: ${previousStart} to before ${start} (UTC); excludes the selected period.`};
    if(days==='all')for(const metric of ['cost','context','cache'] as const)comparisonPeriods[days][metric].reason='All history has no earlier comparison period';
    periods[days]={summary:summarize(buckets,events),previousSummary:days==='all'?undefined:summarize(earlier),models:[...new Set(buckets.map(b=>b.model??'Unknown model'))].map(model=>({model,summary:summarize(buckets.filter(b=>(b.model??'Unknown model')===model))})),weeks:weekly(buckets)};
  }
  const last=rows.flatMap(r=>r.data.last).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).slice(-100);
  const charges=rows.flatMap(r=>r.data.charges??[]);
  const withCharges=(calls:NumericCall[],cs=charges)=>[...calls.map(callBucket),...cs.filter(c=>calls.length&&c.timestamp>=calls[0].timestamp&&c.timestamp<=calls.at(-1)!.timestamp)];
  const dates=reference.map(b=>b.timestamp).sort();
  const result:Efficiency={
    history:{retentionDays:90,frozenThreads},turns:{other},reference:{buckets:cohortTotals(reference),ready},
    comparisons:{thread:{...compareCohorts(thread?.buckets??[],reference,ready),referenceLabel:'All available calls from other chats; excludes the selected chat.'},periods:comparisonPeriods},
    activation:String(this.db.prepare('SELECT value FROM meta WHERE key=?').get('activation')!.value),
    // Retained payload fields now describe the other-chat reference. Saved legacy
    // baseline records are left intact, but no longer limit comparisons.
    baseline:summarize(reference),baselineCalls:reference.reduce((n,b)=>n+b.calls,0),baselineProvisional:!ready,
    baselineStart:dates[0],baselineEnd:dates.at(-1),
    thread:summarize(thread?.buckets??[],thread?.paybacks??[]),threadWeeks:weekly(thread?.buckets??[]),
    threadModels:[...new Set((thread?.buckets??[]).map(b=>b.model??'Unknown model'))].map(model=>({model,summary:summarize((thread?.buckets??[]).filter(b=>(b.model??'Unknown model')===model)),baseline:summarize(reference.filter(b=>b.model===model))})),
    baselineModels:[...new Set(reference.map(b=>b.model??'Unknown model'))].map(model=>({model,summary:summarize(reference.filter(b=>(b.model??'Unknown model')===model))})),
    paybacks:thread?.paybacks??[],periods,rolling:summarize(withCharges(last)),threadRolling:summarize(withCharges(thread?.last??[],thread?.charges??[])),
    progress:{processed:this.processed,total:this.total,running:this.busy,failed:this.failed},pricingBasis:`Current bundled rates · verified ${pricingMetadata.verifiedAt} · effective ${pricingMetadata.configurationEffectiveDate}${frozenThreads?` · ${frozenThreads} saved chats retain their original calculation basis`: ""}`
  };
  const bytes=Buffer.byteLength(JSON.stringify(result));const boundaries=rows.map(r=>Date.parse(r.data.activity??'')+7*864e5).filter(t=>t>now);const expires=Math.min(...boundaries,now-(now%864e5)+864e5);
  const prior=this.snapshots.get(key);if(prior)this.snapshotBytes-=prior.bytes;this.snapshots.delete(key);if(bytes<=16*1024*1024){this.snapshots.set(key,{value:result,bytes,expires});this.snapshotBytes+=bytes;}
  while(this.snapshots.size>64||this.snapshotBytes>16*1024*1024){const oldest=this.snapshots.keys().next().value!;this.snapshotBytes-=this.snapshots.get(oldest)!.bytes;this.snapshots.delete(oldest);}
  return result;
 }
 close(){this.closed=true;if(!this.busy)this.db.close();}
}
