import type {CompactionDetail} from './compaction.js';
import {DatabaseSync,type StatementSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {chmodSync,existsSync,statSync} from 'node:fs';
import type {Bucket,NumericCall,Payback,ThreadHistory} from './efficiency.js';

export const bucketNumbers=['cacheInput','cacheRead','input','cached','cacheWrite','output','calls','priced','inputPriced','inputCost','cost','overhead'] as const;
const sampleNumbers=['input','cached','cacheWrite','output','reasoning','total','ordinal'] as const;
const flags=['outputRecorded','reasoningRecorded','cachedRecorded','cacheWriteRecorded'] as const;
/** Durable numeric history. SQL owns numeric facts; source availability never controls retention. */
export class HistoryDatabase {
 readonly db:DatabaseSync;
 private statements=new Map<string,StatementSync>();
 statement(sql:string){let s=this.statements.get(sql);if(!s){s=this.db.prepare(sql);this.statements.set(sql,s);}return s;}
 private bump(){this.db.exec("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='history_revision'");}
 constructor(readonly file:string,options:{migrate?:boolean}={}){
  const fresh=!existsSync(file);this.db=new DatabaseSync(file);const [major,minor,patch]=String(this.db.prepare('SELECT sqlite_version() AS version').get()!.version).split('.').map(Number);if(major<3||major===3&&(minor<51||minor===51&&patch<3)&&!(minor===50&&patch>=7)&&!(minor===44&&patch>=6)){this.db.close();throw Error('Durable history requires SQLite 3.51.3 or a fixed backport; use the bundled runtime');}if(Number(this.db.prepare('PRAGMA user_version').get()!.user_version)>4){this.db.close();throw Error('Historical database requires a newer TokenMonitor version');}chmodSync(file,0o600);
  this.db.exec(`PRAGMA busy_timeout=100; ${fresh?'PRAGMA auto_vacuum=INCREMENTAL;':''} PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=1000; PRAGMA journal_size_limit=4194304;
   CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
   CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,signature TEXT,basis TEXT,data TEXT);
   CREATE TABLE IF NOT EXISTS history_basis(id TEXT PRIMARY KEY,definition TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS history_sources(id TEXT PRIMARY KEY,signature TEXT NOT NULL,basis TEXT NOT NULL,activity TEXT);
   CREATE TABLE IF NOT EXISTS history_dimensions(id INTEGER PRIMARY KEY,identity TEXT UNIQUE NOT NULL,model TEXT,effort TEXT,rateBand TEXT,serviceTier TEXT,regionalProcessing INTEGER);
   CREATE TABLE IF NOT EXISTS history_buckets(source TEXT NOT NULL,position INTEGER NOT NULL,dimension INTEGER NOT NULL,timestamp TEXT NOT NULL,${bucketNumbers.map(k=>`${k} REAL NOT NULL`).join(',')},PRIMARY KEY(source,position));
   CREATE INDEX IF NOT EXISTS history_buckets_date ON history_buckets(timestamp,dimension);
   CREATE TABLE IF NOT EXISTS history_samples(source TEXT NOT NULL,position INTEGER NOT NULL,dimension INTEGER NOT NULL,timestamp TEXT NOT NULL,${sampleNumbers.map(k=>`${k} INTEGER`).join(',')},${flags.map(k=>`${k} INTEGER NOT NULL`).join(',')},PRIMARY KEY(source,position));
   CREATE INDEX IF NOT EXISTS history_samples_date ON history_samples(timestamp);
   CREATE INDEX IF NOT EXISTS history_samples_source_date ON history_samples(source,timestamp,position);
   CREATE TABLE IF NOT EXISTS history_paybacks(source TEXT NOT NULL,position INTEGER NOT NULL,timestamp TEXT NOT NULL,completed TEXT,reason TEXT,calls INTEGER NOT NULL,breakEven INTEGER,net REAL NOT NULL,valid INTEGER NOT NULL,PRIMARY KEY(source,position));
   CREATE TABLE IF NOT EXISTS history_turns(source TEXT NOT NULL,model TEXT NOT NULL,turns INTEGER NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(source,model));
   CREATE TABLE IF NOT EXISTS history_charges(source TEXT NOT NULL,position INTEGER NOT NULL,dimension INTEGER NOT NULL,timestamp TEXT NOT NULL,${bucketNumbers.map(k=>`${k} REAL NOT NULL`).join(',')},PRIMARY KEY(source,position));
   INSERT OR IGNORE INTO meta VALUES ('history_revision','0');`);
  const pageSize=Number(this.statement('PRAGMA page_size').get()!.page_size);this.db.exec(`PRAGMA wal_autocheckpoint=${Math.max(1,Math.floor(4194304/pageSize))}`);
  if(options.migrate!==false)this.migrate();
  this.upgrade();
  this.db.exec(`CREATE TABLE IF NOT EXISTS history_compactions(source TEXT NOT NULL,timestamp TEXT NOT NULL,position INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(source,timestamp));CREATE INDEX IF NOT EXISTS history_compactions_date ON history_compactions(timestamp); PRAGMA user_version=4;`);
 }
 internBasis(definition:string){const id=createHash('sha256').update(definition).digest('hex');this.statement('INSERT OR IGNORE INTO history_basis VALUES(?,?)').run(id,definition);return id;}
 dimension(b:Partial<Bucket>){const values=[b.model??null,b.effort??null,b.rateBand??null,b.serviceTier??null,b.regionalProcessing==null?null:Number(b.regionalProcessing)];const key=JSON.stringify(values);this.statement('INSERT OR IGNORE INTO history_dimensions(identity,model,effort,rateBand,serviceTier,regionalProcessing) VALUES(?,?,?,?,?,?)').run(key,...values);return Number(this.statement('SELECT id FROM history_dimensions WHERE identity=?').get(key)!.id);}
 transaction(work:()=>void){this.db.exec('BEGIN IMMEDIATE');try{work();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 migrate(limit=Infinity){
  // Each legacy row is its own resumable transaction. Preserve old pricing bases, too.
  for(const row of this.statement('SELECT id,signature,basis,data FROM threads LIMIT ?').all(Number.isFinite(limit)?limit:-1) as {id:string;signature:string;basis:string;data:string}[]){
   const data=JSON.parse(row.data) as ThreadHistory;
   this.transaction(()=>{if(!this.statement('SELECT 1 FROM history_sources WHERE id=?').get(row.id))this.save(row.id,row.signature,row.basis,data);this.statement('DELETE FROM threads WHERE id=?').run(row.id);});
  }
  const baseline=this.statement("SELECT value FROM meta WHERE key='baseline'").get()?.value;if(typeof baseline==='string'){try{const samples=JSON.parse(baseline);if(Array.isArray(samples)&&samples.every(s=>s&&typeof s.timestamp==='string'&&typeof s.input==='number')){const summary={samples:samples.length,start:samples[0]?.timestamp??null,end:samples.at(-1)?.timestamp??null,input:0,cached:0,cacheWrite:0,output:0,reasoning:0};for(const sample of samples)for(const key of ['input','cached','cacheWrite','output','reasoning'] as const)if(Number.isFinite(sample[key])&&sample[key]>=0)summary[key]+=sample[key];this.transaction(()=>{this.statement("INSERT OR REPLACE INTO meta VALUES('legacy_baseline_summary',?)").run(JSON.stringify(summary));this.statement("DELETE FROM meta WHERE key='baseline'").run();});}}catch{/* Preserve unrecognized metadata rather than treating it as numeric detail. */}}
 }
 private save(id:string,signature:string,basis:string,d:ThreadHistory,detail:NumericCall[]=[...d.first,...d.last]){
  for(const table of ['history_buckets','history_samples','history_paybacks','history_turns','history_charges'])this.statement(`DELETE FROM ${table} WHERE source=?`).run(id);
  this.statement('INSERT OR REPLACE INTO history_sources VALUES(?,?,?,?)').run(id,signature,this.internBasis(basis),d.activity??null);
  if(this.hasRollups())this.statement('INSERT OR IGNORE INTO history_catalogue(source,available) VALUES(?,0)').run(id);
  for(const [table,bs] of [['history_buckets',d.buckets],['history_charges',d.charges??[]]] as const){const insert=this.statement(`INSERT INTO ${table} VALUES(${Array(4+bucketNumbers.length).fill('?').join(',')})`);bs.forEach((b,i)=>insert.run(id,i,this.dimension(b),b.timestamp,...bucketNumbers.map(k=>b[k])));}
  const cutoff=new Date(Date.now()-89*864e5).toISOString().slice(0,10),seen=new Set<string>();
  const insert=this.statement(`INSERT INTO history_samples VALUES(${Array(4+sampleNumbers.length+flags.length).fill('?').join(',')})`);
  detail.filter(s=>s.timestamp.slice(0,10)>=cutoff).forEach((s,i)=>{const identity=JSON.stringify([s.timestamp,s.input,s.cached,s.output,s.ordinal]);if(seen.has(identity))return;seen.add(identity);insert.run(id,i,this.dimension(s),s.timestamp,...sampleNumbers.map(k=>s[k]??null),...flags.map(k=>Number(s[k]===true)));});
  const pay=this.statement('INSERT INTO history_paybacks VALUES(?,?,?,?,?,?,?,?,?)');d.paybacks.forEach((p,i)=>pay.run(id,i,p.timestamp,p.completed??null,p.reason??null,p.calls,p.breakEven,p.net,Number(p.valid)));
  const turn=this.statement('INSERT INTO history_turns VALUES(?,?,?,?)');for(const t of d.turns??[])turn.run(id,t.model,t.turns,t.calls);
  if(this.hasRollups()){this.rebuildRollups(id);this.statement('DELETE FROM history_buckets WHERE source=?').run(id);}
  this.bump();
 }
 replace(id:string,signature:string,basis:string,d:ThreadHistory,detail?:NumericCall[]){this.transaction(()=>this.save(id,signature,basis,d,detail));}
 signature(id:string){return this.statement('SELECT signature,COALESCE(b.definition,s.basis) AS basis FROM history_sources s LEFT JOIN history_basis b ON b.id=s.basis WHERE s.id=?').get(id) as {signature:string;basis:string}|undefined;}
 revision(){return String(this.statement("SELECT value FROM meta WHERE key='history_revision'").get()!.value);}
 histories():{id:string;basis:string;data:ThreadHistory}[]{
  const sources=this.statement('SELECT s.id,COALESCE(b.definition,s.basis) AS basis,s.activity FROM history_sources s LEFT JOIN history_basis b ON b.id=s.basis').all() as {id:string;basis:string;activity:string|null}[];
  const map=new Map(sources.map(r=>[r.id,{id:r.id,basis:r.basis,data:{first:[],last:[],buckets:[],charges:[],paybacks:[],turns:[],activity:r.activity??undefined} as ThreadHistory}]));
  for(const table of ['history_buckets','history_charges','history_samples']){
   for(const row of this.statement(`SELECT t.*,${table==='history_buckets'?'t.day AS timestamp,':''}d.model,d.effort,d.rateBand,d.serviceTier,d.regionalProcessing FROM ${table==='history_buckets'?'history_daily':table} t JOIN history_dimensions d ON d.id=t.dimension ORDER BY t.source,${table==='history_buckets'?'t.day':'t.position'}`).iterate() as Iterable<Record<string,any>>){
    const target=map.get(row.source);if(!target)continue;
    const b:any={timestamp:row.timestamp};for(const k of ['model','effort','rateBand','serviceTier'])if(row[k]!=null)b[k]=row[k];if(row.regionalProcessing!=null)b.regionalProcessing=!!row.regionalProcessing;
    if(table==='history_samples'){for(const k of sampleNumbers)if(row[k]!=null)b[k]=row[k];for(const k of flags)b[k]=!!row[k];target.data.last.push(b);if(target.data.last.length>100)target.data.last.shift();}
    else {for(const k of bucketNumbers)b[k]=row[k];target.data[table==='history_buckets'?'buckets':'charges'].push(b);}
   }
  }
  for(const row of this.statement('SELECT * FROM history_paybacks ORDER BY source,position').iterate() as Iterable<Record<string,any>>){const p:Payback={timestamp:row.timestamp,calls:row.calls,breakEven:row.breakEven,net:row.net,valid:!!row.valid};if(row.completed)p.completed=row.completed;if(row.reason)p.reason=row.reason;map.get(row.source)?.data.paybacks.push(p);}
  for(const row of this.statement('SELECT * FROM history_turns').iterate() as Iterable<Record<string,any>>)map.get(row.source)?.data.turns!.push({model:row.model,calls:row.calls,turns:row.turns});
  return [...map.values()];
 }
 prune(now=Date.now()) {const cutoff=new Date(now-89*864e5).toISOString().slice(0,10);this.transaction(()=>{
  let changed=false;for(const table of ['history_samples','history_turn_events','history_boundaries','history_charges','history_compactions']){this.statement(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE timestamp<? LIMIT 1000)`).run(cutoff);changed||=Number(this.statement('SELECT changes() AS n').get()!.n)>0;}
  this.statement('DELETE FROM history_paybacks WHERE rowid IN (SELECT rowid FROM history_paybacks WHERE completed IS NOT NULL AND completed<? LIMIT 1000)').run(cutoff);changed||=Number(this.statement('SELECT changes() AS n').get()!.n)>0;
  this.statement('DELETE FROM history_replay WHERE (source,kind,digest) IN (SELECT source,kind,digest FROM history_replay WHERE timestamp<? LIMIT 1000)').run(cutoff);
  if(changed)this.bump();
 });}

 nextClosure(){const row=this.statement('SELECT MIN(s.activity) AS activity FROM history_sources s JOIN history_paybacks p ON p.source=s.id WHERE p.completed IS NULL').get();return row?.activity?Date.parse(String(row.activity))+7*864e5:Infinity;}
 maintenance(now=Date.now()){this.transaction(()=>{const cutoff=new Date(now-7*864e5).toISOString();const rows=this.statement('SELECT p.*,s.activity FROM history_paybacks p JOIN history_sources s ON s.id=p.source WHERE p.completed IS NULL AND s.activity<=? LIMIT 1000').all(cutoff) as any[];for(const p of rows){const completed=new Date(Date.parse(p.activity)+7*864e5).toISOString();this.updatePayback(p.source,{...p,valid:!!p.valid,completed,reason:'inactivity'});const cursor=this.statement('SELECT state FROM history_cursors WHERE source=?').get(p.source) as any;if(cursor){const state=JSON.parse(cursor.state);if(state.builder.epoch?.timestamp===p.timestamp){state.builder.epoch.completed=completed;state.builder.epoch.reason='inactivity';this.statement('UPDATE history_cursors SET state=? WHERE source=?').run(JSON.stringify(state),p.source);}}}if(rows.length)this.bump();});this.prune(now);this.db.exec('PRAGMA wal_checkpoint(PASSIVE)');if(this.diagnostics().journalBytes>4194304)this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');if(Number(this.statement('PRAGMA auto_vacuum').get()!.auto_vacuum)===2)this.db.exec('PRAGMA incremental_vacuum(64)');}
 diagnostics(){const bytes=(file:string)=>{try{return statSync(file).size;}catch{return 0;}};return {retentionDays:90,databaseBytes:bytes(this.file),journalBytes:bytes(this.file+'-wal'),reusableBytes:Number(this.statement('PRAGMA freelist_count').get()!.freelist_count)*Number(this.statement('PRAGMA page_size').get()!.page_size)};}

 private hasRollups(){return !!this.statement("SELECT 1 FROM sqlite_master WHERE name='history_daily'").get();}
 private upgrade(){
  if(this.statement("SELECT 1 FROM meta WHERE key='history_schema_v3'").get())return;
  this.db.exec(`
   CREATE TABLE IF NOT EXISTS history_day_basis(source TEXT NOT NULL,day TEXT NOT NULL,basis TEXT NOT NULL,PRIMARY KEY(source,day)) WITHOUT ROWID;
   CREATE TABLE IF NOT EXISTS history_daily(source TEXT NOT NULL,day TEXT NOT NULL,dimension INTEGER NOT NULL,${bucketNumbers.map(k=>`${k} REAL NOT NULL`).join(',')},PRIMARY KEY(source,day,dimension)) WITHOUT ROWID;
   CREATE INDEX IF NOT EXISTS history_daily_date ON history_daily(day,dimension);
   CREATE TABLE IF NOT EXISTS history_totals(source TEXT NOT NULL,dimension INTEGER NOT NULL,${bucketNumbers.map(k=>`${k} REAL NOT NULL`).join(',')},PRIMARY KEY(source,dimension)) WITHOUT ROWID;
   CREATE TABLE IF NOT EXISTS history_cursors(source TEXT PRIMARY KEY,target TEXT NOT NULL,identity TEXT NOT NULL,offset INTEGER NOT NULL,anchor TEXT NOT NULL,head TEXT NOT NULL,state TEXT NOT NULL,discard INTEGER NOT NULL,complete INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS history_replay(source TEXT NOT NULL,kind TEXT NOT NULL,digest BLOB NOT NULL,timestamp TEXT NOT NULL,sequence INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(source,kind,digest)) WITHOUT ROWID;
   CREATE INDEX IF NOT EXISTS history_replay_date ON history_replay(timestamp);
   CREATE TABLE IF NOT EXISTS history_turn_events(source TEXT NOT NULL,position INTEGER NOT NULL,timestamp TEXT NOT NULL,model TEXT NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(source,position));
   CREATE INDEX IF NOT EXISTS history_turn_events_date ON history_turn_events(timestamp);
   CREATE INDEX IF NOT EXISTS history_paybacks_date ON history_paybacks(timestamp);
   CREATE INDEX IF NOT EXISTS history_charges_date ON history_charges(timestamp);
   CREATE TABLE IF NOT EXISTS history_outcomes(source TEXT NOT NULL,day TEXT NOT NULL,completed INTEGER NOT NULL,valid INTEGER NOT NULL,profitable INTEGER NOT NULL,reason TEXT NOT NULL,events INTEGER NOT NULL,net REAL NOT NULL,PRIMARY KEY(source,day,completed,valid,profitable,reason)) WITHOUT ROWID;
   CREATE TABLE IF NOT EXISTS history_boundaries(source TEXT NOT NULL,position INTEGER NOT NULL,timestamp TEXT NOT NULL,kind TEXT NOT NULL,turnId TEXT,tokens INTEGER,model TEXT,user INTEGER,PRIMARY KEY(source,position,kind));
   CREATE INDEX IF NOT EXISTS history_boundaries_date ON history_boundaries(timestamp);
   CREATE TABLE IF NOT EXISTS history_turn_daily(source TEXT NOT NULL,day TEXT NOT NULL,model TEXT NOT NULL,turns INTEGER NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(source,day,model)) WITHOUT ROWID;
   CREATE TABLE IF NOT EXISTS history_catalogue(source TEXT PRIMARY KEY,title TEXT,workspace TEXT,archived INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 1);
   CREATE INDEX IF NOT EXISTS history_outcomes_date ON history_outcomes(day);
  `);
  for(const row of this.statement('SELECT DISTINCT basis FROM history_sources WHERE basis NOT IN (SELECT id FROM history_basis)').all() as {basis:string}[]){const key=this.internBasis(row.basis);this.statement('UPDATE history_sources SET basis=? WHERE basis=?').run(key,row.basis);}
  if(!(this.statement('PRAGMA table_info(history_replay)').all() as any[]).some(c=>c.name==='sequence'))this.db.exec('ALTER TABLE history_replay ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0');
  this.db.exec('DROP INDEX IF EXISTS history_replay_order');
  const columns=bucketNumbers.join(','),sum=bucketNumbers.map(k=>`SUM(${k})`).join(',');
  const update=bucketNumbers.map(k=>`${k}=${k}+excluded.${k}`).join(',');
  for(const [event,ref,sign] of [['INSERT','NEW',1],['DELETE','OLD',-1]] as const){
   this.db.exec(`CREATE TRIGGER IF NOT EXISTS history_daily_${event.toLowerCase()} AFTER ${event} ON history_daily BEGIN
    INSERT INTO history_totals VALUES(${ref}.source,${ref}.dimension,${bucketNumbers.map(k=>`${sign}*${ref}.${k}`).join(',')}) ON CONFLICT(source,dimension) DO UPDATE SET ${update};
    INSERT INTO history_totals SELECT '',${ref}.dimension,${bucketNumbers.map(k=>`${sign}*${ref}.${k}`).join(',')} WHERE ${ref}.source NOT LIKE '~%' ON CONFLICT(source,dimension) DO UPDATE SET ${update}; END;`);
  }
  // An UPDATE applies its numeric delta to both materialized total levels.
  this.db.exec(`CREATE TRIGGER IF NOT EXISTS history_daily_update AFTER UPDATE ON history_daily BEGIN
   UPDATE history_totals SET ${bucketNumbers.map(k=>`${k}=${k}+NEW.${k}-OLD.${k}`).join(',')} WHERE dimension=NEW.dimension AND (source=NEW.source OR source='' AND NEW.source NOT LIKE '~%'); END;`);
  if(!this.statement("SELECT 1 FROM meta WHERE key='history_schema_v2'").get())this.transaction(()=>{
   this.db.exec(`INSERT OR IGNORE INTO history_daily SELECT source,substr(timestamp,1,10),dimension,${sum} FROM history_buckets GROUP BY source,substr(timestamp,1,10),dimension;`);
   for(const r of this.statement('SELECT id FROM history_sources').all() as {id:string}[])this.rebuildOutcomes(r.id);
   this.db.exec("INSERT OR REPLACE INTO meta VALUES('history_schema_v2','1'); PRAGMA user_version=2;");
  });
  if(!this.statement("SELECT 1 FROM meta WHERE key='history_provenance_v1'").get())this.transaction(()=>{this.db.exec("INSERT OR IGNORE INTO history_day_basis SELECT d.source,d.day,s.basis FROM history_daily d JOIN history_sources s ON d.source=s.id; DELETE FROM history_buckets; INSERT OR IGNORE INTO history_catalogue(source,available) SELECT id,0 FROM history_sources WHERE id NOT LIKE '~%'; INSERT INTO meta VALUES('history_provenance_v1','1');");});
  this.db.exec("INSERT OR REPLACE INTO meta VALUES('history_schema_v3','1'); PRAGMA user_version=3;");
 }
 private rebuildOutcomes(id:string){
  this.statement('DELETE FROM history_outcomes WHERE source=?').run(id);
  for(const r of this.statement('SELECT * FROM history_paybacks WHERE source=?').all(id) as any[])this.outcome(id,r,1);
 }
 private rebuildRollups(id:string){
  this.statement('DELETE FROM history_daily WHERE source=?').run(id);
  const sum=bucketNumbers.map(k=>`SUM(${k})`).join(',');
  this.statement(`INSERT INTO history_daily SELECT source,substr(timestamp,1,10),dimension,${sum} FROM history_buckets WHERE source=? GROUP BY source,substr(timestamp,1,10),dimension`).run(id);
  this.rebuildOutcomes(id);
 }
 addBucket(id:string,b:Bucket){this.statement('INSERT OR IGNORE INTO history_day_basis SELECT ?,?,basis FROM history_sources WHERE id=?').run(id,b.timestamp.slice(0,10),id);const dimension=this.dimension(b),columns=bucketNumbers.join(',');
  this.statement(`INSERT INTO history_daily(source,day,dimension,${columns}) VALUES(${Array(3+bucketNumbers.length).fill('?').join(',')}) ON CONFLICT(source,day,dimension) DO UPDATE SET ${bucketNumbers.map(k=>`${k}=${k}+excluded.${k}`).join(',')}`).run(id,b.timestamp.slice(0,10),dimension,...bucketNumbers.map(k=>b[k]));
 }
 addSample(id:string,position:number,s:NumericCall,now:number){if(s.timestamp.slice(0,10)<new Date(now-89*864e5).toISOString().slice(0,10))return;
  this.statement(`INSERT OR IGNORE INTO history_samples VALUES(${Array(4+sampleNumbers.length+flags.length).fill('?').join(',')})`).run(id,position,this.dimension(s),s.timestamp,...sampleNumbers.map(k=>s[k]??null),...flags.map(k=>Number(s[k]===true)));
 }
 private outcome(id:string,p:any,sign:number){const day=(p.completed||p.timestamp).slice(0,10);this.statement(`INSERT INTO history_outcomes VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source,day,completed,valid,profitable,reason) DO UPDATE SET events=events+excluded.events,net=net+excluded.net`).run(id,day,Number(!!p.completed),Number(!!p.valid),Number(p.breakEven!=null),p.reason??'',sign,sign*p.net);}
 updatePayback(id:string,p:Payback,prior?:Payback){
  const old=this.statement('SELECT * FROM history_paybacks WHERE source=? AND timestamp=?').get(id,p.timestamp) as any;
  if(old||prior)this.outcome(id,old??prior,-1);
  const position=old?.position??Number(this.statement('SELECT COALESCE(MAX(position),-1)+1 AS n FROM history_paybacks WHERE source=?').get(id)!.n);
  this.statement('INSERT OR REPLACE INTO history_paybacks VALUES(?,?,?,?,?,?,?,?,?)').run(id,position,p.timestamp,p.completed??null,p.reason??null,p.calls,p.breakEven,p.net,Number(p.valid));this.outcome(id,p,1);
 }
 addTurn(id:string,position:number,timestamp:string,model:string,calls:number,now:number){this.statement(`INSERT INTO history_turns VALUES(?,?,1,?) ON CONFLICT(source,model) DO UPDATE SET turns=turns+1,calls=calls+excluded.calls`).run(id,model,calls);
  this.statement(`INSERT INTO history_turn_daily VALUES(?,?,?,1,?) ON CONFLICT(source,day,model) DO UPDATE SET turns=turns+1,calls=calls+excluded.calls`).run(id,timestamp.slice(0,10),model,calls);
  if(timestamp.slice(0,10)>=new Date(now-89*864e5).toISOString().slice(0,10))this.statement('INSERT OR IGNORE INTO history_turn_events VALUES(?,?,?,?,?)').run(id,position,timestamp,model,calls);
 }
 clearSource(id:string){for(const table of ['history_buckets','history_samples','history_paybacks','history_turns','history_charges','history_daily','history_outcomes','history_turn_events','history_boundaries','history_turn_daily','history_day_basis','history_replay','history_compactions'])this.statement(`DELETE FROM ${table} WHERE source=?`).run(id);this.statement('DELETE FROM history_totals WHERE source=?').run(id);this.statement('DELETE FROM history_sources WHERE id=?').run(id);}
 publish(source:string,target:string){if(source===target)return;this.clearSource(source);
  // Totals' global rows deliberately exclude staging sources. Reinsert daily rows to activate them.
  const rows=this.statement('SELECT * FROM history_daily WHERE source=?').all(target) as any[];
  this.statement('DELETE FROM history_daily WHERE source=?').run(target);
  for(const r of rows)this.statement(`INSERT INTO history_daily VALUES(${Array(3+bucketNumbers.length).fill('?').join(',')})`).run(source,r.day,r.dimension,...bucketNumbers.map(k=>r[k]));
  for(const table of ['history_buckets','history_samples','history_paybacks','history_turns','history_charges','history_outcomes','history_turn_events','history_boundaries','history_turn_daily','history_day_basis','history_replay','history_compactions'])this.statement(`UPDATE ${table} SET source=? WHERE source=?`).run(source,target);
  this.statement('DELETE FROM history_totals WHERE source=?').run(target);this.statement('UPDATE history_sources SET id=? WHERE id=?').run(source,target);
 }
 buckets(source?:string,start?:string,end?:string,exclude?:string):Bucket[]{
  const daily=start!=null||end!=null,table=daily?'history_daily':'history_totals';
  const where:string[]=[],args:any[]=[];
  if(daily){where.push("t.source NOT LIKE '~%'");if(source){where.push('t.source=?');args.push(source);}else if(exclude){where.push('t.source<>?');args.push(exclude);}if(start){where.push('t.day>=?');args.push(start);}if(end){where.push('t.day<?');args.push(end);}}
  else {where.push('t.source=?');args.push(source??'');}
  const sums=bucketNumbers.map(k=>`SUM(t.${k}) AS ${k}`).join(',');
  const rows=this.statement(`SELECT ${sums},d.model,d.effort,d.rateBand,d.serviceTier,d.regionalProcessing FROM ${table} t JOIN history_dimensions d ON d.id=t.dimension WHERE ${where.join(' AND ')} GROUP BY t.dimension`).all(...args) as any[];
  if(!daily&&exclude){const own=this.buckets(exclude);for(const r of rows){const b=own.find(o=>JSON.stringify([o.model,o.effort,o.rateBand,o.serviceTier,o.regionalProcessing])===JSON.stringify([r.model??undefined,r.effort??undefined,r.rateBand??undefined,r.serviceTier??undefined,r.regionalProcessing==null?undefined:!!r.regionalProcessing]));if(b)for(const k of bucketNumbers)r[k]-=b[k];}}
  return rows.filter(r=>r.calls||r.overhead).map(r=>{const b:any={timestamp:start??''};for(const k of bucketNumbers)b[k]=r[k];for(const k of ['model','effort','rateBand','serviceTier'])if(r[k]!=null)b[k]=r[k];if(r.regionalProcessing!=null)b.regionalProcessing=!!r.regionalProcessing;return b;});
 }
 outcomes(source?:string,start?:string,end?:string,exclude?:string):Payback[]{const where=["source NOT LIKE '~%'",'events>0'],args:any[]=[];if(source){where.push('source=?');args.push(source);}if(exclude){where.push('source<>?');args.push(exclude);}if(start){where.push('day>=?');args.push(start);}if(end){where.push('day<?');args.push(end);}
  return (this.statement(`SELECT day,completed,valid,profitable,reason,SUM(events) AS events,SUM(net) AS net FROM history_outcomes WHERE ${where.join(' AND ')} GROUP BY day,completed,valid,profitable,reason`).all(...args) as any[]).map(r=>({timestamp:r.day,completed:r.completed?r.day:undefined,valid:!!r.valid,breakEven:r.profitable?1:null,reason:r.reason||undefined,calls:0,net:r.net,events:r.events}));
 }
 saveCompaction(source:string,position:number,c:CompactionDetail,now:number){if(c.timestamp.slice(0,10)<new Date(now-89*864e5).toISOString().slice(0,10))return;this.statement('INSERT OR REPLACE INTO history_compactions VALUES(?,?,?,?)').run(source,c.timestamp,position,JSON.stringify(c));}
 compactionDetails(source:string):CompactionDetail[]{return (this.statement('SELECT data FROM history_compactions WHERE source=? ORDER BY timestamp DESC LIMIT 120').all(source) as {data:string}[]).reverse().map(r=>JSON.parse(r.data));}
 recent(source?:string):NumericCall[]{const rows=this.statement(`SELECT t.*,d.model,d.effort,d.serviceTier,d.regionalProcessing FROM history_samples t JOIN history_dimensions d ON t.dimension=d.id WHERE ${source?'source=?':"source NOT LIKE '~%'"} ORDER BY timestamp DESC,position DESC LIMIT 100`).all(...(source?[source]:[])) as any[];return rows.reverse().map(r=>{const b:any={timestamp:r.timestamp};for(const k of sampleNumbers)if(r[k]!=null)b[k]=r[k];for(const k of flags)b[k]=!!r[k];for(const k of ['model','effort','serviceTier'])if(r[k]!=null)b[k]=r[k];if(r.regionalProcessing!=null)b.regionalProcessing=!!r.regionalProcessing;return b;});}
 turns(exclude?:string){return this.statement(`SELECT model,SUM(turns) AS turns,SUM(calls) AS calls FROM history_turns WHERE source NOT LIKE '~%' ${exclude?'AND source<>?':''} GROUP BY model`).all(...(exclude?[exclude]:[])) .map(r=>({...r})) as {model:string;turns:number;calls:number}[];}
 changed(){this.bump();}
 trimOldReplay(source:string,now:number){const cutoff=new Date(now-89*864e5).toISOString().slice(0,10);for(const kind of ['record','call','cumulative','turn-start','turn-message','turn-end']){const row=this.statement('SELECT sequence FROM history_replay WHERE source=? AND kind=? AND timestamp<? ORDER BY sequence DESC LIMIT 1 OFFSET 32767').get(source,kind,cutoff);if(row)this.statement('DELETE FROM history_replay WHERE source=? AND kind=? AND timestamp<? AND sequence<?').run(source,kind,cutoff,row.sequence);}}
 pruneReplay(source:string,now=Date.now()){const cutoff=new Date(now-89*864e5).toISOString().slice(0,10);this.statement('DELETE FROM history_replay WHERE (source,kind,digest) IN (SELECT source,kind,digest FROM history_replay INDEXED BY history_replay_date WHERE source=? AND timestamp<? LIMIT 1000)').run(source,cutoff);return Number(this.statement('SELECT changes() AS n').get()!.n);}
 hasExpired(now=Date.now()){const cutoff=new Date(now-89*864e5).toISOString().slice(0,10);return ['history_samples','history_turn_events','history_boundaries','history_charges','history_compactions','history_replay'].some(t=>!!this.statement(`SELECT 1 FROM ${t} WHERE timestamp<? LIMIT 1`).get(cutoff))||!!this.statement('SELECT 1 FROM history_paybacks WHERE completed<? LIMIT 1').get(cutoff);}
 boundary(source:string,position:number,timestamp:string,kind:string,now:number,tokens?:number,model?:string,turnId?:string,user?:boolean){if(timestamp.slice(0,10)<new Date(now-89*864e5).toISOString().slice(0,10))return;this.statement('INSERT OR IGNORE INTO history_boundaries VALUES(?,?,?,?,?,?,?,?)').run(source,position,timestamp,kind,turnId??null,tokens??null,model??null,user==null?null:Number(user));}
 savedTasks(query='',includeArchived=false){const q='%'+query.trim().toLowerCase()+'%',where=`${includeArchived?'1':'c.archived=0'} AND (lower(COALESCE(c.title,'')) LIKE ? ESCAPE '\\' OR lower(c.source) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.workspace,'')) LIKE ? ESCAPE '\\')`;
  const literal='%'+query.trim().toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';const rows=this.statement(`SELECT c.source AS id,c.title,c.workspace,c.archived,c.available FROM history_catalogue c WHERE ${where} ORDER BY c.source LIMIT 100`).all(literal,literal,literal) as any[];
  return rows.map(r=>({id:r.id,title:r.title??`Saved chat · ${r.id.slice(-8)}`,workspace:r.workspace??undefined,archived:!!r.archived,saved:true,sourceAvailable:!!r.available}));
 }
 syncCatalogue(f:{id:string;title?:string;workspace?:string;archived?:boolean},available?:boolean){
  const row=this.statement('SELECT title,workspace,archived,available FROM history_catalogue WHERE source=?').get(f.id);
  if(!row)return;
  const values=[f.title??row.title,f.workspace??row.workspace,f.archived===undefined?row.archived:Number(f.archived),available===undefined?row.available:Number(available)];
  if(values.every((v,i)=>v===row[['title','workspace','archived','available'][i]]))return;
  this.transaction(()=>{this.statement('UPDATE history_catalogue SET title=COALESCE(?,title),workspace=COALESCE(?,workspace),archived=COALESCE(?,archived),available=COALESCE(?,available) WHERE source=?').run(f.title??null,f.workspace??null,f.archived===undefined?null:Number(f.archived),available===undefined?null:Number(available),f.id);this.changed();});
 }
 syncAvailability(files:{id:string}[]){const ids=new Set(files.map(f=>f.id)),changed=this.statement('SELECT source,available FROM history_catalogue').all().filter(row=>row.available!==Number(ids.has(String(row.source))));if(changed.length)this.transaction(()=>{for(const row of changed)this.statement('UPDATE history_catalogue SET available=? WHERE source=?').run(Number(ids.has(String(row.source))),row.source);this.changed();});}
 close(){this.db.close();}
}
