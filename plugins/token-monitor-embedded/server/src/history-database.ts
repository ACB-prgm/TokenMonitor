import {DatabaseSync} from 'node:sqlite';
import {chmodSync,existsSync,statSync} from 'node:fs';
import type {Bucket,NumericCall,Payback,ThreadHistory} from './efficiency.js';

const bucketNumbers=['cacheInput','cacheRead','input','cached','cacheWrite','output','calls','priced','inputPriced','inputCost','cost','overhead'] as const;
const sampleNumbers=['input','cached','cacheWrite','output','reasoning','total','ordinal'] as const;
const flags=['outputRecorded','reasoningRecorded','cachedRecorded','cacheWriteRecorded'] as const;
/** Durable numeric history. SQL owns numeric facts; source availability never controls retention. */
export class HistoryDatabase {
 readonly db:DatabaseSync;
 constructor(readonly file:string){
  const fresh=!existsSync(file);this.db=new DatabaseSync(file);chmodSync(file,0o600);
  this.db.exec(`PRAGMA busy_timeout=100; ${fresh?'PRAGMA auto_vacuum=INCREMENTAL;':''} PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=1000; PRAGMA journal_size_limit=4194304;
   CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
   CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,signature TEXT,basis TEXT,data TEXT);
   CREATE TABLE IF NOT EXISTS history_sources(id TEXT PRIMARY KEY,signature TEXT NOT NULL,basis TEXT NOT NULL,activity TEXT);
   CREATE TABLE IF NOT EXISTS history_dimensions(id INTEGER PRIMARY KEY,identity TEXT UNIQUE NOT NULL,model TEXT,effort TEXT,rateBand TEXT,serviceTier TEXT,regionalProcessing INTEGER);
   CREATE TABLE IF NOT EXISTS history_buckets(source TEXT NOT NULL,position INTEGER NOT NULL,dimension INTEGER NOT NULL,timestamp TEXT NOT NULL,${bucketNumbers.map(k=>`${k} REAL NOT NULL`).join(',')},PRIMARY KEY(source,position));
   CREATE INDEX IF NOT EXISTS history_buckets_date ON history_buckets(timestamp,dimension);
   CREATE TABLE IF NOT EXISTS history_samples(source TEXT NOT NULL,position INTEGER NOT NULL,dimension INTEGER NOT NULL,timestamp TEXT NOT NULL,${sampleNumbers.map(k=>`${k} INTEGER`).join(',')},${flags.map(k=>`${k} INTEGER NOT NULL`).join(',')},PRIMARY KEY(source,position));
   CREATE INDEX IF NOT EXISTS history_samples_date ON history_samples(timestamp);
   CREATE TABLE IF NOT EXISTS history_paybacks(source TEXT NOT NULL,position INTEGER NOT NULL,timestamp TEXT NOT NULL,completed TEXT,reason TEXT,calls INTEGER NOT NULL,breakEven INTEGER,net REAL NOT NULL,valid INTEGER NOT NULL,PRIMARY KEY(source,position));
   CREATE TABLE IF NOT EXISTS history_turns(source TEXT NOT NULL,model TEXT NOT NULL,turns INTEGER NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(source,model));
   CREATE TABLE IF NOT EXISTS history_charges(source TEXT NOT NULL,position INTEGER NOT NULL,dimension INTEGER NOT NULL,timestamp TEXT NOT NULL,${bucketNumbers.map(k=>`${k} REAL NOT NULL`).join(',')},PRIMARY KEY(source,position));
   INSERT OR IGNORE INTO meta VALUES ('history_revision','0');`);
  this.migrate();
 }
 private dimension(b:Partial<Bucket>){const values=[b.model??null,b.effort??null,b.rateBand??null,b.serviceTier??null,b.regionalProcessing==null?null:Number(b.regionalProcessing)];const key=JSON.stringify(values);this.db.prepare('INSERT OR IGNORE INTO history_dimensions(identity,model,effort,rateBand,serviceTier,regionalProcessing) VALUES(?,?,?,?,?,?)').run(key,...values);return Number(this.db.prepare('SELECT id FROM history_dimensions WHERE identity=?').get(key)!.id);}
 private transaction(work:()=>void){this.db.exec('BEGIN IMMEDIATE');try{work();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private migrate(){
  // Each legacy row is its own resumable transaction. Preserve old pricing bases, too.
  for(const row of this.db.prepare('SELECT id,signature,basis,data FROM threads').all() as {id:string;signature:string;basis:string;data:string}[]){
   const data=JSON.parse(row.data) as ThreadHistory;
   this.transaction(()=>{if(!this.db.prepare('SELECT 1 FROM history_sources WHERE id=?').get(row.id))this.save(row.id,row.signature,row.basis,data);this.db.prepare('DELETE FROM threads WHERE id=?').run(row.id);});
  }
 }
 private save(id:string,signature:string,basis:string,d:ThreadHistory,detail:NumericCall[]=[...d.first,...d.last]){
  for(const table of ['history_buckets','history_samples','history_paybacks','history_turns','history_charges'])this.db.prepare(`DELETE FROM ${table} WHERE source=?`).run(id);
  this.db.prepare('INSERT OR REPLACE INTO history_sources VALUES(?,?,?,?)').run(id,signature,basis,d.activity??null);
  for(const [table,bs] of [['history_buckets',d.buckets],['history_charges',d.charges??[]]] as const){const insert=this.db.prepare(`INSERT INTO ${table} VALUES(${Array(4+bucketNumbers.length).fill('?').join(',')})`);bs.forEach((b,i)=>insert.run(id,i,this.dimension(b),b.timestamp,...bucketNumbers.map(k=>b[k])));}
  const cutoff=new Date(Date.now()-89*864e5).toISOString().slice(0,10),seen=new Set<string>();
  const insert=this.db.prepare(`INSERT INTO history_samples VALUES(${Array(4+sampleNumbers.length+flags.length).fill('?').join(',')})`);
  detail.filter(s=>s.timestamp.slice(0,10)>=cutoff).forEach((s,i)=>{const identity=JSON.stringify([s.timestamp,s.input,s.cached,s.output,s.ordinal]);if(seen.has(identity))return;seen.add(identity);insert.run(id,i,this.dimension(s),s.timestamp,...sampleNumbers.map(k=>s[k]??null),...flags.map(k=>Number(s[k]===true)));});
  const pay=this.db.prepare('INSERT INTO history_paybacks VALUES(?,?,?,?,?,?,?,?,?)');d.paybacks.forEach((p,i)=>pay.run(id,i,p.timestamp,p.completed??null,p.reason??null,p.calls,p.breakEven,p.net,Number(p.valid)));
  const turn=this.db.prepare('INSERT INTO history_turns VALUES(?,?,?,?)');for(const t of d.turns??[])turn.run(id,t.model,t.turns,t.calls);
  this.db.exec("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='history_revision'");
 }
 replace(id:string,signature:string,basis:string,d:ThreadHistory,detail?:NumericCall[]){this.transaction(()=>this.save(id,signature,basis,d,detail));}
 signature(id:string){return this.db.prepare('SELECT signature,basis FROM history_sources WHERE id=?').get(id) as {signature:string;basis:string}|undefined;}
 revision(){return String(this.db.prepare("SELECT value FROM meta WHERE key='history_revision'").get()!.value);}
 histories():{id:string;basis:string;data:ThreadHistory}[]{
  const sources=this.db.prepare('SELECT id,basis,activity FROM history_sources').all() as {id:string;basis:string;activity:string|null}[];
  const map=new Map(sources.map(r=>[r.id,{id:r.id,basis:r.basis,data:{first:[],last:[],buckets:[],charges:[],paybacks:[],turns:[],activity:r.activity??undefined} as ThreadHistory}]));
  for(const table of ['history_buckets','history_charges','history_samples']){
   for(const row of this.db.prepare(`SELECT t.*,d.model,d.effort,d.rateBand,d.serviceTier,d.regionalProcessing FROM ${table} t JOIN history_dimensions d ON d.id=t.dimension ORDER BY t.source,t.position`).iterate() as Iterable<Record<string,any>>){
    const target=map.get(row.source);if(!target)continue;
    const b:any={timestamp:row.timestamp};for(const k of ['model','effort','rateBand','serviceTier'])if(row[k]!=null)b[k]=row[k];if(row.regionalProcessing!=null)b.regionalProcessing=!!row.regionalProcessing;
    if(table==='history_samples'){for(const k of sampleNumbers)if(row[k]!=null)b[k]=row[k];for(const k of flags)b[k]=!!row[k];target.data.last.push(b);if(target.data.last.length>100)target.data.last.shift();}
    else {for(const k of bucketNumbers)b[k]=row[k];target.data[table==='history_buckets'?'buckets':'charges'].push(b);}
   }
  }
  for(const row of this.db.prepare('SELECT * FROM history_paybacks ORDER BY source,position').iterate() as Iterable<Record<string,any>>){const p:Payback={timestamp:row.timestamp,calls:row.calls,breakEven:row.breakEven,net:row.net,valid:!!row.valid};if(row.completed)p.completed=row.completed;if(row.reason)p.reason=row.reason;map.get(row.source)?.data.paybacks.push(p);}
  for(const row of this.db.prepare('SELECT * FROM history_turns').iterate() as Iterable<Record<string,any>>)map.get(row.source)?.data.turns!.push({model:row.model,calls:row.calls,turns:row.turns});
  return [...map.values()];
 }
 prune(now=Date.now()) {const cutoff=new Date(now-89*864e5).toISOString().slice(0,10);this.transaction(()=>{this.db.prepare('DELETE FROM history_samples WHERE rowid IN (SELECT rowid FROM history_samples WHERE timestamp<? LIMIT 1000)').run(cutoff);if(this.db.prepare('SELECT changes() AS n').get()!.n)this.db.exec("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='history_revision'");});}
 maintenance(now=Date.now()){this.prune(now);this.db.exec('PRAGMA wal_checkpoint(PASSIVE)');if(Number(this.db.prepare('PRAGMA auto_vacuum').get()!.auto_vacuum)===2)this.db.exec('PRAGMA incremental_vacuum(64)');}
 diagnostics(){const bytes=(file:string)=>{try{return statSync(file).size;}catch{return 0;}};return {retentionDays:90,databaseBytes:bytes(this.file),journalBytes:bytes(this.file+'-wal'),reusableBytes:Number(this.db.prepare('PRAGMA freelist_count').get()!.freelist_count)*Number(this.db.prepare('PRAGMA page_size').get()!.page_size)};}
 close(){this.db.close();}
}
