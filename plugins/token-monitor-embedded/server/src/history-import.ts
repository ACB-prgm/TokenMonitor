import {createHash} from 'node:crypto';
import {openSync,closeSync,readSync,fstatSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {TelemetryParser} from './parser.js';
import {HistoryBuilder} from './efficiency.js';
import {HistoryDatabase} from './history-database.js';
import {acceptedTranscript} from './platform.js';
export type HistoryFile={id:string;file:string;end?:string;title?:string;workspace?:string;archived?:boolean};
export type ImportResult={bytes:number;complete:boolean;changed:boolean;unavailable?:boolean;waiting?:boolean};
type State={version:1;parser:ReturnType<TelemetryParser['numericCheckpoint']>;builder:ReturnType<HistoryBuilder['checkpoint']>};
type Cursor={target:string;identity:string;offset:number;anchor:string;head:string;state:string;discard:number;complete:number};
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
/** One bounded transaction. Its byte cursor and numeric contributions always commit together. */
export function importHistory(db:HistoryDatabase,home:string,f:HistoryFile,basis:string,options:{now?:number;maxBytes?:number;maxMs?:number}={}):ImportResult{
 const now=options.now??Date.now(),deadline=performance.now()+(options.maxMs??500),maxBytes=options.maxBytes??4*1024*1024;
 if(!acceptedTranscript(f.file,f.id,home)){db.statement('UPDATE history_catalogue SET available=0 WHERE source=? AND available<>0').run(f.id);return {bytes:0,complete:true,changed:false,unavailable:true};}
 const fd=openSync(f.file,'r');let result:ImportResult={bytes:0,complete:false,changed:false};
 try{
  const st=fstatSync(fd),identity=JSON.stringify([st.dev,st.ino,st.birthtimeMs]),signature=JSON.stringify([st.dev,st.ino,st.size,st.mtimeMs,f.end]);
  const old=db.signature(f.id),cursor=db.statement('SELECT * FROM history_cursors WHERE source=?').get(f.id) as Cursor|undefined;
  // Stat-only fast path: no transcript body reads, transactions, or writes.
  if(old?.signature===signature&&old.basis===basis&&cursor?.complete)return {...result,complete:true};
  if(cursor){const saved=JSON.parse(cursor.state);if(saved.observed===signature&&saved.waiting)return {...result,waiting:true};}
  const read=(at:number,n:number)=>{const b=Buffer.alloc(n);return b.subarray(0,readSync(fd,b,0,n,at));};
  const head=hash(read(0,Math.min(128,st.size)));
  let reset=!cursor||cursor.identity!==identity||cursor.offset>st.size||cursor.head!==head;
  if(cursor?.complete&&old?.signature){try{const sig=JSON.parse(old.signature);if(st.size===cursor.offset&&sig[3]!==st.mtimeMs)reset=true;}catch{reset=true;}}
  if(cursor&&!reset&&cursor.offset)reset=hash(read(Math.max(0,cursor.offset-128),Math.min(cursor.offset,128)))!==cursor.anchor;
  // A pricing/parser version change rebuilds from the source; missing sources keep frozen estimates.
  if(old&&old.basis!==basis&&(!cursor||db.signature(cursor.target)?.basis!==basis))reset=true;
  let offset=reset?0:cursor!.offset,discard=reset?false:!!cursor!.discard;
  let target=reset?(old?'~'+f.id:f.id):cursor!.target;
  db.transaction(()=>{
   // Another hook/worker may have progressed this cursor after the outside reads.
   const current=db.statement('SELECT offset,identity,state FROM history_cursors WHERE source=?').get(f.id) as any;
   if((current?.offset??null)!==(cursor?.offset??null)||(current?.identity??null)!==(cursor?.identity??null)||(current?.state??null)!==(cursor?.state??null))throw Error('History cursor changed; retry later');
   if(reset){db.clearSource(target);db.statement('INSERT INTO history_sources VALUES(?,?,?,NULL)').run(target,'',db.internBasis(basis));}
   const builder=new HistoryBuilder();let currentTime=now;
   const parser=new TelemetryParser(e=>{
    if(e.kind==='activity'){currentTime=Date.parse(e.timestamp);builder.activity(e.timestamp);}
    else if(e.kind==='compaction'){builder.compact(e.timestamp);db.boundary(target,offset,e.timestamp,'compaction',now);}
    else if(e.kind==='retained'){builder.retainedContext(e.tokens);db.boundary(target,offset,new Date(currentTime).toISOString(),'retained',now,e.tokens);}
    else if(e.kind==='turn'){builder.turn(e.turn);db.addTurn(target,offset,e.timestamp??new Date(currentTime).toISOString(),e.turn.model,e.turn.calls,now);}
    else {builder.call(e.sample,e.contextLimit);db.addSample(target,offset,e.sample,now);db.boundary(target,offset,e.sample.timestamp,'context-limit',now,e.contextLimit);}
   },{numericOnly:true,replay:(kind,key)=>{
    const digest=hash(key);db.statement('INSERT OR IGNORE INTO history_replay VALUES(?,?,?,?)').run(target,kind,Buffer.from(digest,'hex'),new Date(currentTime).toISOString());return Number(db.statement('SELECT changes() AS n').get()!.n)>0;
   }});
   let previousEpoch:ReturnType<HistoryBuilder['checkpoint']>['epoch'];
   if(!reset){const state=JSON.parse(cursor!.state) as State;if(state.version!==1)throw Error('Unsupported history checkpoint');parser.restoreNumeric(state.parser);previousEpoch=structuredClone(state.builder.epoch);builder.restore(state.builder);}
   const start=offset;let pending=Buffer.alloc(0),readAt=offset,committedOffset=offset;
   while(readAt<st.size&&result.bytes<maxBytes&&(performance.now()<deadline||pending.length>0||committedOffset===start)){
    const block=read(readAt,Math.min(65536,st.size-readAt,maxBytes-result.bytes));if(!block.length)break;
    readAt+=block.length;result.bytes+=block.length;pending=Buffer.concat([pending,block]);let end:number;
    while((end=pending.indexOf(10))>=0){offset=readAt-pending.length+end+1;const line=pending.subarray(0,end);pending=Buffer.from(pending.subarray(end+1));if(!discard&&line.length<=4*1024*1024){try{const record=JSON.parse(line.toString());const p=record?.payload,timestamp=typeof record?.timestamp==='string'&&Number.isFinite(Date.parse(record.timestamp))?new Date(record.timestamp).toISOString():undefined;
      if(timestamp&&p){const kind=record.type==='turn_context'?'turn_context':record.type==='response_item'&&p.type==='message'&&p.role==='user'?'user_message':record.type==='event_msg'&&['task_started','task_complete','task_aborted','turn_aborted','user_message'].includes(p.type)?p.type:undefined;if(kind)db.boundary(target,offset,timestamp,kind,now,undefined,typeof p.model==='string'?p.model:undefined,typeof p.turn_id==='string'?hash(p.turn_id):undefined,kind==='user_message'||p.turn_attribution?.turn_trigger==='composer');}
      parser.consume(record);
     }catch(error){if(error instanceof SyntaxError){/* malformed source record */}else throw error;}}discard=false;committedOffset=offset;
     if(performance.now()>=deadline)break;
    }
    // Oversized records are skipped without storing their content. Discard state is durable.
    if(pending.length>=4*1024*1024){discard=true;pending=Buffer.alloc(0);committedOffset=readAt;}
    if(performance.now()>=deadline&&(!pending.length||committedOffset>start))break;
   }
   offset=committedOffset;const complete=offset===st.size;
   // A partial final line stays on disk and is reread only once more bytes arrive.
   const data=builder.finish(now,complete?f.end:undefined);
   for(const b of data.buckets)db.addBucket(target,b);
   for(const p of data.paybacks)db.updatePayback(target,p,p.timestamp===previousEpoch?.timestamp?previousEpoch:undefined);
   for(const b of data.charges){const oldCharge=db.statement('SELECT position FROM history_charges WHERE source=? AND timestamp=?').get(target,b.timestamp) as any;
    const pos=oldCharge?.position??offset;const fields=['cacheInput','cacheRead','input','cached','cacheWrite','output','calls','priced','inputPriced','inputCost','cost','overhead'] as const;
    if(b.timestamp.slice(0,10)>=new Date(now-89*864e5).toISOString().slice(0,10))db.statement(`INSERT OR REPLACE INTO history_charges VALUES(${Array(16).fill('?').join(',')})`).run(target,pos,db.dimension(b),b.timestamp,...fields.map(k=>b[k]));
   }
   const waiting=!complete&&readAt===st.size&&pending.indexOf(10)<0;const state:State&{observed:string;waiting:boolean}={version:1,parser:parser.numericCheckpoint(),builder:builder.checkpoint(),observed:signature,waiting};result.waiting=waiting;
   if(Buffer.byteLength(JSON.stringify(state))>64*1024)throw Error('Numeric checkpoint exceeded size budget');
   db.statement('UPDATE history_sources SET signature=?,activity=? WHERE id=?').run(complete?signature:'',data.activity??null,target);
   if(complete){db.publish(f.id,target);target=f.id;}
   db.statement('INSERT OR REPLACE INTO history_cursors VALUES(?,?,?,?,?,?,?,?,?)').run(f.id,target,identity,offset,hash(read(Math.max(0,offset-128),Math.min(offset,128))),head,JSON.stringify(state),Number(discard),Number(complete));
   db.statement('INSERT INTO history_catalogue(source,title,workspace,archived,available) VALUES(?,?,?,?,1) ON CONFLICT(source) DO UPDATE SET title=COALESCE(excluded.title,title),workspace=COALESCE(excluded.workspace,workspace),archived=excluded.archived,available=1').run(f.id,f.title??null,f.workspace??null,Number(!!f.archived));
   if(offset!==start||reset){db.changed();result.changed=true;}
   result.complete=complete;
  });
  return result;
 }finally{closeSync(fd);}
}
