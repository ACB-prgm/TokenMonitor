import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {TelemetryStore} from '../server/dist/collector.mjs';
const roots=[];after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
async function home(){const root=await mkdtemp(path.join(tmpdir(),'discovery-'));roots.push(root);return root;}
async function transcript(root,id,{archived=false,source='cli',name=`rollout-2026-01-01T00-00-00-${id}.jsonl`}={}){
 const dir=path.join(root,archived?'archived_sessions':'sessions','2026','01','01');await mkdir(dir,{recursive:true});const file=path.join(dir,name);
 await writeFile(file,JSON.stringify({type:'session_meta',payload:{id,source,cwd:'/private/workspace'}})+'\n'+JSON.stringify({type:'event_msg',timestamp:'2026-01-01T00:00:00Z',payload:{type:'token_count',info:{last_token_usage:{input_tokens:1234,output_tokens:10}}}})+'\n');return file;
}
async function complete(store){await store.catalogue();for(let i=0;i<300&&store.discovery.status.state==='scanning';i++)await new Promise(r=>setTimeout(r,5));assert.notEqual(store.discovery.status.state,'scanning');return store.catalogue();}
test('cold discovery finds historical usage without SQLite, hooks or full usage parsing',async()=>{
 const root=await home();await transcript(root,'old');const store=new TelemetryStore(root);
 try{const first=await store.catalogue();assert.equal(first.discovery.state,'scanning');const list=await complete(store);assert.equal(list.tasks[0].id,'old');assert.equal(store.activeCollectorCount,0);assert.equal(store.snapshot('old').input,1234);assert.doesNotMatch(JSON.stringify(list),/transcript_path|\.jsonl|\/private/);}finally{store.close();}
});
test('search reaches beyond 100 results and archive toggle preserves selected thread',async()=>{
 const root=await home();for(let i=0;i<110;i++)await transcript(root,`old-${i}`);await transcript(root,'archived',{archived:true});
 const store=new TelemetryStore(root);try{const list=await complete(store);assert.equal(list.tasks.length,100);assert.equal(list.matchCount,110);assert.equal((await store.catalogue({query:'old-109'})).tasks[0].id,'old-109');assert.equal((await store.catalogue({includeArchived:true})).matchCount,111);assert.ok((await store.catalogue({selectedId:'archived'})).tasks.some(t=>t.id==='archived'));}finally{store.close();}
});
test('warm cache avoids full scans; manual rescan finds restored transcripts',async()=>{
 const root=await home();await transcript(root,'old');const first=new TelemetryStore(root);await complete(first);first.close();
 await transcript(root,'restored');const store=new TelemetryStore(root);try{const warm=await store.catalogue();assert.equal(warm.discovery.state,'complete');assert.equal(warm.tasks.length,1);await store.catalogue({rescan:true});const next=await complete(store);assert.equal(next.tasks.length,2);}finally{store.close();}
});
test('targeted lookup validates exact IDs without cataloguing unrelated files or triggering full scan',async()=>{
 const root=await home();const store=new TelemetryStore(root);await complete(store);
 await transcript(root,'target');await transcript(root,'other');await transcript(root,'wrong',{name:'rollout-test-false.jsonl'});
 try{await store.discovery.target('target');assert.deepEqual([...store.discovery.entries.keys()],['target']);await store.discovery.target('false');assert.equal(store.discovery.entries.has('false'),false);assert.equal(store.discovery.status.state,'complete');}finally{store.close();}
});
test('discovery rejects subagents, oversized headers, malformed records and symlink escapes',async()=>{
 const root=await home(),outside=await home();await transcript(root,'sub',{source:{subagent:{}}});const file=await transcript(root,'large');await writeFile(file,'x'.repeat(65537)+'\n');const external=await transcript(outside,'escape');await mkdir(path.join(root,'sessions'),{recursive:true});await symlink(external,path.join(root,'sessions','escape.jsonl'));
 const store=new TelemetryStore(root);try{const list=await complete(store);assert.equal(list.tasks.length,0);assert.ok(list.discovery.excluded>=2);assert.ok(list.discovery.malformed>=1);}finally{store.close();}
});
test('corrupt cache and database do not prevent discovery; removed files are hidden',async()=>{
 const root=await home();const file=await transcript(root,'old');await mkdir(path.join(root,'token-monitor-embedded'));await writeFile(path.join(root,'token-monitor-embedded','discovery.json'),'broken');await writeFile(path.join(root,'state_5.sqlite'),'broken');const store=new TelemetryStore(root);
 try{assert.equal((await complete(store)).tasks.length,1);await rm(file);assert.equal((await store.catalogue()).tasks.length,0);}finally{store.close();}
});

test('concurrent discovery caches merge and closing interrupts scans safely',async()=>{
 const root=await home();const a=new TelemetryStore(root),b=new TelemetryStore(root);await Promise.all([complete(a),complete(b)]);
 const first=await transcript(root,'one'),second=await transcript(root,'two');
 await Promise.all([a.discovery.target('one',first),b.discovery.target('two',second)]);
 // A lock contender may retain its entry in memory; the next update retries persistence.
 await b.discovery.target('three',await transcript(root,'three'));
 a.close();b.close();
 const cache=JSON.parse(await readFile(path.join(root,'token-monitor-embedded','discovery.json'),'utf8'));
 assert.ok(cache.entries.some(e=>e.id==='one'));assert.ok(cache.entries.some(e=>e.id==='two'));
 const c=new TelemetryStore(root);await c.catalogue({rescan:true});c.close();await new Promise(r=>setTimeout(r,20));
});

test('healthy but incomplete SQLite is supplemented and missing indexed logs are counted',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const root=await home();const indexed=await transcript(root,'indexed');await transcript(root,'orphan');
 const db=new DatabaseSync(path.join(root,'state_5.sqlite'));db.exec('CREATE TABLE threads(id TEXT,title TEXT,rollout_path TEXT,archived INTEGER,updated_at INTEGER)');
 db.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('indexed','Named thread',indexed,1,1);
 db.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('absent','Unavailable thread',path.join(root,'sessions','absent.jsonl'),0,2);db.close();
 const store=new TelemetryStore(root);try{const list=await complete(store);assert.equal(list.discovery.index,'available');assert.equal(list.discovery.missing,1);assert.deepEqual(list.tasks.map(t=>t.id),['orphan']);const archive=await store.catalogue({includeArchived:true,query:'Named thread'});assert.equal(archive.tasks[0].id,'indexed');assert.equal(archive.tasks[0].archived,true);}finally{store.close();}
});

test('session title index names orphaned threads without inventing transcript entries',async()=>{
 const root=await home();await transcript(root,'old');await writeFile(path.join(root,'session_index.jsonl'),[{id:'old',thread_name:'Restored work'},{id:'absent',thread_name:'No local file'}].map(JSON.stringify).join('\n'));
 const store=new TelemetryStore(root);try{const list=await complete(store);assert.equal(list.tasks.length,1);assert.equal(list.tasks[0].title,'Restored work');}finally{store.close();}
});
