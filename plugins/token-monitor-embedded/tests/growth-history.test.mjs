import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {PersonalGrowthHistory} from '../server/dist/growth-history.mjs';
import {TelemetryStore} from '../server/dist/collector.mjs';
const home=mkdtempSync(path.join(tmpdir(),'tm-growth-'));after(()=>rmSync(home,{recursive:true,force:true}));
const model='gpt-6.1-sol',now=Date.UTC(2026,9,21);
const context=m=>({type:'turn_context',payload:{model:m}});
const call=(i,input)=>({type:'event_msg',timestamp:new Date(Date.UTC(2026,9,20,0,0,i)).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,cached_input_tokens:0,output_tokens:100}}}});
const records=(delta=1000,m=model)=>[context(m),...Array.from({length:21},(_,i)=>call(i,10000+i*delta))];
const lines=rs=>rs.map(JSON.stringify).join('\n')+'\n';
function file(id,rs=records(),source='cli'){
 const file=path.join(home,id+'.jsonl');writeFileSync(file,lines([{type:'session_meta',payload:{id,source}},...rs]));return {id,file};
}
test('history uses same-model intervals, excludes subagents, deduplicates inherited history and counts zero',()=>{
 const a=file('main'),fork=file('fork'),other=file('other',records(9000,'other')),review=file('review',records(50000),{subagent:{other:'guardian'}});
 const h=new PersonalGrowthHistory(home);
 assert.deepEqual(h.read(()=>[a,fork,other,review],model,[],now),{observed:1000,sampleCount:20});
 assert.deepEqual(h.read(()=>[], 'other',[],now),{observed:9000,sampleCount:20});
 h.close();const zero=file('zero',records(0));
 assert.deepEqual(h.read(()=>[zero],model,[],now),{observed:0,sampleCount:20});
 assert.equal(h.read(()=>[],undefined,[],now),undefined);
});
test('history refreshes changed files, drops missing sources and resets when closed',()=>{
 const a=file('changing',records(1000).slice(0,-1)),h=new PersonalGrowthHistory(home);let reads=0;
 const files=()=>{reads++;return [a]};
 assert.equal(h.read(files,model,[],now),undefined);
 appendFileSync(a.file,lines([call(20,30000)]));
 assert.equal(h.read(files,model,[],now+4999),undefined);assert.equal(reads,1);
 assert.equal(h.read(files,model,[],now+5000).sampleCount,20);
 rmSync(a.file);assert.equal(h.read(files,model,[],now+10000),undefined);
 h.close();assert.equal(h.read(files,model,[],now),undefined);
});
test('history retains only the most recent 500 intervals and ignores future calls',()=>{
 const rs=[context(model),...Array.from({length:601},(_,i)=>call(i,10000+i*10))];
 const a=file('bounded',rs),h=new PersonalGrowthHistory(home);
 const actual=h.read(()=>[a],model,[],now);assert.equal(actual.sampleCount,500);assert.ok(Math.abs(actual.observed-10)<1e-9);
 const future=file('future',[context(model),...Array.from({length:21},(_,i)=>({...call(i,10000+i*9000),timestamp:new Date(now+1000+i*1000).toISOString()}))]);
 h.close();assert.equal(h.read(()=>[future],model,[],now),undefined);
});
test('bounded suffix discards partial lines and never assigns unknown history to a guessed model',()=>{
 const a=file('suffix',[{type:'response_item',payload:{text:'x'.repeat(4*1024*1024)}},...Array.from({length:21},(_,i)=>call(i,10000+i*9000)),...records(1000).map(r=>r.timestamp?{...r,timestamp:new Date(Date.parse(r.timestamp)+100000).toISOString()}:r)]);
 const h=new PersonalGrowthHistory(home);
 assert.deepEqual(h.read(()=>[a],model,[],now),{observed:1000,sampleCount:20});
 appendFileSync(a.file,'{"type":"event_msg"');
 assert.equal(h.read(()=>[a],model,[],now+5000).sampleCount,20);
});
test('collector uses archived personal history, switches at 20 thread intervals, and resets after compaction',()=>{
 const history=file('archived-history',records(750));const active=file('active',[context(model),call(100,100000)]);
 const db=new DatabaseSync(path.join(home,'state_5.sqlite'));
 db.exec('CREATE TABLE threads(id TEXT,title TEXT,rollout_path TEXT,archived INTEGER,updated_at INTEGER)');
 const insert=db.prepare('INSERT INTO threads VALUES(?,?,?,?,?)');
 insert.run(history.id,'History',history.file,1,1);insert.run(active.id,'Active',active.file,0,2);db.close();
 const store=new TelemetryStore(home),snapshot=()=>store.snapshot(active.id,now).compactionValue;
 let growth=snapshot().assumptions.growth;
 assert.equal(growth.source,'user');assert.equal(growth.effective,750);assert.equal(growth.userSampleCount,20);
 assert.equal(store.tasks().length,1);
 appendFileSync(active.file,lines(Array.from({length:20},(_,i)=>call(101+i,100000+(i+1)*100))));
 growth=snapshot().assumptions.growth;assert.equal(growth.source,'thread');assert.equal(growth.effective,100);assert.equal(growth.sampleCount,20);
 appendFileSync(active.file,lines([{type:'compacted',timestamp:new Date(Date.UTC(2026,9,20,0,3)).toISOString(),payload:{}},call(181,40000)]));
 growth=snapshot().assumptions.growth;assert.equal(growth.source,'user');assert.equal(growth.sampleCount,0);assert.equal(growth.userSampleCount,40);assert.equal(growth.effective,425);
 store.close();assert.equal(store.activeCollectorCount,0);
});
