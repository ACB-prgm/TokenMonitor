import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,appendFileSync,rmSync,renameSync,mkdirSync,symlinkSync,openSync,closeSync,ftruncateSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {TelemetryParser} from '../server/dist/parser.mjs';
import {TelemetryStore,Collector} from '../server/dist/collector.mjs';
import {JSONLTail} from '../server/dist/tail.mjs';
import {contained,acceptedTranscript} from '../server/dist/platform.mjs';
import {rates,price,compactionValue,cacheTemperature,health,AttributionEstimator,estimateTokens} from '../server/dist/metrics.mjs';
const temp=mkdtempSync(path.join(tmpdir(),'tm-collector-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const normalized=x=>JSON.parse(JSON.stringify(x).replaceAll('.000Z','Z'));
const fixtures=JSON.parse(readFileSync(new URL('fixtures/collector-parity.json',import.meta.url)));
for(const f of fixtures)test('reference parity: '+f.id,()=>{const p=new TelemetryParser();for(const r of f.records)p.consume(r);const actual=p.snapshot(f.expected.task,{}, {},true,Date.UTC(2026,9,20));assert.deepEqual(normalized(actual),normalized(f.expected));});
function fixture(id='task'){
 const home=mkdtempSync(path.join(temp,'home-')),file=path.join(home,id+'.jsonl');
 writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id,source:'cli'}})+'\n');
 const db=new DatabaseSync(path.join(home,'state_5.sqlite'));db.exec('CREATE TABLE threads(id TEXT,title TEXT,rollout_path TEXT,cwd TEXT,archived INTEGER,updated_at INTEGER, model TEXT, reasoning_effort TEXT)');db.prepare('INSERT INTO threads VALUES(?,?,?,?,0,1,?,?)').run(id,'Task',file,path.join(home,'workspace'),'gpt-6.1-sol','high');db.close();return {home,file,id};
}
const usage=(input=100,stamp='2026-10-19T01:00:00Z',extra={})=>JSON.stringify({type:'event_msg',timestamp:stamp,payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:10,reasoning_output_tokens:2,...extra}}}});
test('tail preserves partial UTF-8, ignores oversized lines and detects truncation/regrowth and replacement',()=>{
 const file=path.join(temp,'tail.jsonl'),tail=new JSONLTail();let lines=[],resets=0;const read=()=>tail.read(file,()=>{lines=[];resets++;},r=>lines.push(r.toString()));
 const utf=Buffer.from('héllo🙂');writeFileSync(file,utf.subarray(0,3));read();assert.deepEqual(lines,[]);appendFileSync(file,Buffer.concat([utf.subarray(3),Buffer.from('\n')]));read();assert.deepEqual(lines,['héllo🙂']);read();assert.equal(lines.length,1);
 const fd=openSync(file,'r+');ftruncateSync(fd,0);closeSync(fd);writeFileSync(file,'replacement longer than previous\n');read();assert.deepEqual(lines,['replacement longer than previous']);
 writeFileSync(file+'.new','new\n');renameSync(file+'.new',file);read();assert.deepEqual(lines,['new']);assert.equal(resets,3);
 appendFileSync(file,'x'.repeat(4*1024*1024+100)+'\nvalid\n');read();assert.deepEqual(lines,['new','valid']);
});
test('Windows drive, UNC, traversal and case paths; POSIX containment',()=>{
 for(const p of ['C:\\Users\\A\\.codex\\sessions\\a.jsonl','c:\\users\\a\\.CODEX\\sessions\\a.jsonl'])assert.equal(contained('C:\\Users\\A\\.codex',p,'win32'),true);
 for(const p of ['C:\\Users\\A\\.codex-evil\\a','D:\\a','C:\\Users\\A\\.codex\\..\\secret','C:relative'])assert.equal(contained('C:\\Users\\A\\.codex',p,'win32'),false);
 assert.equal(contained('\\\\host\\share\\.codex','\\\\host\\share\\.codex\\sessions\\a','win32'),true);assert.equal(contained('\\\\host\\share\\.codex','\\\\other\\share\\.codex\\a','win32'),false);
 assert.equal(contained('/home/.codex','/home/.codex/sessions/a','posix'),true);assert.equal(contained('/home/.codex','/home/.codex-evil/a','posix'),false);
});
test('header rejects unrelated sessions, subagents and symlink escapes',()=>{
 const f=fixture();assert.equal(acceptedTranscript(f.file,'task',f.home),true);assert.equal(acceptedTranscript(f.file,'other',f.home),false);
 writeFileSync(f.file,JSON.stringify({type:'session_meta',payload:{id:'task',source:{subagent:{}}}})+'\n');assert.equal(acceptedTranscript(f.file,'task',f.home),false);
 if(process.platform!=='win32'){const outside=path.join(temp,'outside');writeFileSync(outside,JSON.stringify({type:'session_meta',payload:{id:'task',source:'cli'}})+'\n');symlinkSync(outside,path.join(f.home,'escape'));assert.equal(acceptedTranscript(path.join(f.home,'escape'),'task',f.home),false);}
});
test('SQLite metadata fallback and contention never modify source or throw',()=>{
 const f=fixture(),store=new TelemetryStore(f.home);assert.equal(store.metadata('task')[0].model,'gpt-6.1-sol');const before=readFileSync(path.join(f.home,'state_5.sqlite'));
 const db=new DatabaseSync(path.join(f.home,'state_5.sqlite'));db.exec('BEGIN EXCLUSIVE');assert.deepEqual(store.metadata(),[]);db.exec('ROLLBACK');db.close();assert.deepEqual(readFileSync(path.join(f.home,'state_5.sqlite')),before);
 writeFileSync(path.join(f.home,'state_99.sqlite'),'corrupt');assert.equal(store.metadata().length,1);store.close();
});
test('snapshots retain unavailable transcript, recover replacement and prune idle entries',()=>{
 const f=fixture(),store=new TelemetryStore(f.home);appendFileSync(f.file,usage()+'\n');assert.equal(store.snapshot('task').input,100);rmSync(f.file);const lost=store.snapshot('task');assert.equal(lost.input,100);assert.equal(lost.available,false);
 writeFileSync(f.file,JSON.stringify({type:'session_meta',payload:{id:'task',source:'cli'}})+'\n'+usage(200)+'\n');assert.equal(store.snapshot('task').input,200);assert.equal(store.activeCollectorCount,1);store.prune(Date.now()+61000);assert.equal(store.activeCollectorCount,0);store.close();
});
test('hooks serialize concurrent Node processes without partial records or transcript persistence',async()=>{
 const f=fixture();const hook=new URL('../server/dist/hook.mjs',import.meta.url);
 const run=i=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[fileURLToPath(hook)],{env:{...process.env,CODEX_HOME:f.home},stdio:['pipe','pipe','pipe']});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(new Error('hook exit '+c)));p.stdin.end(JSON.stringify({session_id:f.id,hook_event_name:i%2?'Stop':'UserPromptSubmit',transcript_path:f.file,prompt:'PRIVATE_TRANSCRIPT'}));});
 await Promise.all(Array.from({length:12},(_,i)=>run(i)));const store=new TelemetryStore(f.home);assert.equal(store.hook().session.session_id,f.id);const saved=readFileSync(path.join(f.home,'token-monitor-embedded/latest-hook.json'),'utf8');assert.doesNotMatch(saved,/PRIVATE_TRANSCRIPT|prompt/);assert.equal(await store.record({session_id:'../escape',hook_event_name:'Stop'}),false);
});
test('cumulative replay at another timestamp is not another call; incomplete counters remain distinct',()=>{
 const p=new TelemetryParser();const r=JSON.parse(usage());r.payload.info.total_token_usage={input_tokens:100,output_tokens:10};p.consume(r);r.timestamp='2026-10-19T01:00:01Z';p.consume(r);assert.equal(p.callCount,1);r.payload.info.total_token_usage={output_tokens:10};r.timestamp='2026-10-19T01:00:02Z';p.consume(r);assert.equal(p.callCount,2);
});
test('pricing categories, threshold, tier and unavailable accounting match baseline',()=>{
 const s={input:100000,cached:60000,cacheWrite:10000,output:10000,reasoning:4000,model:'gpt-6.1-sol',cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true};
 assert.ok(Math.abs(price(s).total-.191)<1e-12);assert.ok(Math.abs(price(s).cacheSavings-.109)<1e-12);assert.equal(rates(s.model,'priority',272001).input,8);assert.equal(rates('gpt-5.5','fast',300000),undefined);assert.equal(price({...s,cacheWriteRecorded:false}).total,undefined);assert.equal(price({...s,model:'unknown'}).total,undefined);assert.equal(price({...s,reasoningRecorded:false}).categories[5],.1);
});
test('compaction strict break-even and cache boundary parity',()=>{
 for(const [input,calls]of [[60000,23],[77000,13],[100000,9],[120000,7],[150000,6],[83600,12],[83601,11]])assert.equal(compactionValue(input).breakEvenCalls,calls);
 assert.equal(compactionValue(40000).breakEvenCalls,undefined);const last='2026-10-19T00:00:00Z',t=Date.parse(last);assert.equal(cacheTemperature(last,t+1800000-1),'WARM');assert.equal(cacheTemperature(last,t+1800000),'UNCERTAIN');assert.equal(cacheTemperature(last,t+7200000),'UNCERTAIN');assert.equal(cacheTemperature(last,t+7200001),'PRES. COLD');assert.equal(health(65,[40,50,65,75]),2);
});
test('attribution deduplicates text and rebuilds surviving compaction history',()=>{
 const e=new AttributionEstimator();const call={type:'function_call',call_id:'a',name:'exec',arguments:'cat pdf/SKILL.md'};e.consume('response_item',call);e.consume('response_item',call);e.consume('response_item',{type:'function_call_output',call_id:'a',output:'abcd'.repeat(100)});assert.equal(e.snapshot().skillCount,1);assert.equal(e.snapshot().callCount,1);assert.equal(e.snapshot(10).contributors[0].tokens,10);assert.equal(estimateTokens('abcde'),2);
 e.consume('compacted',{replacement_history:[{type:'function_call',call_id:'kept',name:'search',arguments:''},{type:'function_call_output',call_id:'kept',output:'12345678'}]});assert.equal(e.snapshot().contributors[0].tokens,2);assert.equal(e.snapshot().afterCompaction,true);
});
test('collector is in-process and close releases all entries',async()=>{const f=fixture(),c=new Collector(f.home);await c.request('state',{taskId:f.id});assert.equal(c.store.activeCollectorCount,1);assert.equal('child' in c,false);c.close();assert.equal(c.store.activeCollectorCount,0);});
