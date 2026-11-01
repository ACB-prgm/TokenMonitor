import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const bundle=await build({entryPoints:[new URL('../server/src/history-database.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',write:false});const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const {HistoryDatabase}=mod.exports;
function fixture(fn){const root=mkdtempSync(path.join(tmpdir(),'tm-durable-'));try{return fn(path.join(root,'efficiency.sqlite'),root);}finally{rmSync(root,{recursive:true,force:true});}}
const timestamp=new Date().toISOString();
const sample={timestamp,input:100,cached:50,cacheWrite:0,output:10,reasoning:2,model:'gpt-6.1-sol',effort:'high',cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true};
const bucket={timestamp,model:sample.model,effort:'high',cacheInput:100,cacheRead:50,input:100,cached:50,cacheWrite:0,output:10,calls:1,priced:1,inputPriced:1,inputCost:.01,cost:.02,overhead:0};
const data={first:[sample],last:[sample],buckets:[bucket],paybacks:[],charges:[],turns:[{model:sample.model,turns:1,calls:1}],activity:timestamp};
test('legacy migration preserves orphaned pricing bases exactly once without backup files',()=>fixture((file,root)=>{
 let db=new DatabaseSync(file);db.exec('CREATE TABLE threads(id TEXT PRIMARY KEY,signature TEXT,basis TEXT,data TEXT)');db.prepare('INSERT INTO threads VALUES(?,?,?,?)').run('missing','old-signature','old-basis',JSON.stringify(data));db.close();
 let history=new HistoryDatabase(file);assert.equal(history.histories()[0].basis,'old-basis');assert.equal(history.histories()[0].data.buckets[0].calls,1);assert.equal(history.db.prepare('SELECT COUNT(*) AS n FROM threads').get().n,0);history.close();
 history=new HistoryDatabase(file);assert.equal(history.histories().length,1);assert.equal(history.histories()[0].data.last.length,1);history.close();assert.deepEqual(readdirSync(root),['efficiency.sqlite']);
}));
test('retention removes numeric detail without removing permanent totals or importing private text',()=>fixture(file=>{
 const history=new HistoryDatabase(file);history.replace('a','signature','basis',data,[{...sample,activity:{text:'DO NOT STORE PRIVATE CONTENT'}}]);
 const revision=history.revision();assert.equal(history.histories()[0].data.last.length,1);
 assert.equal(history.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE sql LIKE '%activity%'").get().n,1);
 history.prune(Date.now()+91*864e5);assert.equal(history.histories()[0].data.last.length,0);assert.equal(history.histories()[0].data.buckets[0].calls,1);assert.notEqual(history.revision(),revision);
 assert.equal(history.diagnostics().retentionDays,90);history.close();
}));
test('failed replacements roll back the prior history and signature together',()=>fixture(file=>{
 const history=new HistoryDatabase(file);history.replace('a','good','basis',data);
 assert.throws(()=>history.replace('a','bad','basis',{...data,buckets:[{...bucket,calls:null}]}));
 assert.equal(history.signature('a').signature,'good');assert.equal(history.histories()[0].data.buckets[0].calls,1);history.close();
}));
test('dimensions are interned and duplicate replacement does not multiply rows',()=>fixture(file=>{
 const history=new HistoryDatabase(file);for(let i=0;i<10;i++)history.replace('a','same','basis',data);
 assert.equal(history.db.prepare('SELECT COUNT(*) AS n FROM history_dimensions').get().n,1);
 assert.equal(history.db.prepare('SELECT COUNT(*) AS n FROM history_samples').get().n,1);
 assert.equal(history.db.prepare('SELECT COUNT(*) AS n FROM history_buckets').get().n,1);history.close();
}));
