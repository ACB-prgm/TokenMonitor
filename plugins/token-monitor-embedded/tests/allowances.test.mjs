import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtempSync,writeFileSync,appendFileSync,rmSync,renameSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {AccountLimits,CatalogueAllowances,normalizeAllowances,liveAllowances,transcriptAllowances,chooseAllowances,resolveCodex} from '../server/dist/allowances.mjs';
import {Collector} from '../server/dist/collector.mjs';
import {TelemetryParser} from '../server/dist/parser.mjs';
const temp=mkdtempSync(path.join(tmpdir(),'tm-allowances-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const at='2026-10-28T12:00:00.000Z',now=Date.parse(at);
const window=(used=25,minutes=300)=>({usedPercent:used,windowDurationMins:minutes,resetsAt:(now+3600000)/1000});
const response=(primary=window(),secondary=window(40,10080))=>({rateLimits:{limitId:'codex',primary,secondary}});
const record=(used=25,time=at,minutes=300)=>({type:'event_msg',timestamp:time,payload:{type:'token_count',rate_limits:{primary:{used_percent:used,window_minutes:minutes,resets_at:(now+3600000)/1000}}}});
const line=(...records)=>records.map(r=>JSON.stringify(r)+'\n').join('');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fakeSpawn(handler){
 const children=[],sent=[];
 const spawn=(command,args,options)=>{
   const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.signalCode=null;child.kills=0;
   child.stdin=new Writable({write(chunk,encoding,done){const message=JSON.parse(chunk.toString());sent.push(message);queueMicrotask(()=>handler(message,child));done();}});
   child.kill=()=>{child.kills++;child.signalCode='SIGTERM';child.emit('exit',null,'SIGTERM');return true;};
   child.reply=(id,result)=>child.stdout.write(JSON.stringify({id,result})+'\n');
   children.push({child,command,args,options});return child;
 };
 return {spawn,children,sent};
}
function initialized(message,child){if(message.method==='initialize')child.reply(message.id,{});}
test('shared validator preserves unknown, zero, fractional, over-100 and independent window durations',()=>{
 assert.deepEqual(liveAllowances({},at),{});
 assert.deepEqual(normalizeAllowances({primary:{used_percent:0,window_minutes:300}},'catalogue',at).fiveHour,{used:0,source:'catalogue',observedAt:at});
 const values=liveAllowances(response(window(101.25,10080),window(3.5,300)),at);assert.equal(values.fiveHour.used,3.5);assert.equal(values.weekly.used,101.25);
 for(const used of [-1,NaN,Infinity,'2',null])assert.equal(normalizeAllowances({primary:{usedPercent:used,windowDurationMins:300}},'live',at).fiveHour,undefined);
 assert.deepEqual(transcriptAllowances(record(25,'bad date')),{});
 const other=record();other.payload.rate_limits.limit_id='codex_other';assert.deepEqual(transcriptAllowances(other),{});
 const invalid=liveAllowances(response({...window(),resetsAt:Infinity}),at);assert.equal(invalid.fiveHour.reset,undefined);
});
test('multi-bucket map takes precedence and never substitutes another bucket',()=>{
 const r={...response(window(99)),rateLimitsByLimitId:{codex:{primary:window(12)},other:{primary:window(88)}}};
 assert.equal(liveAllowances(r,at).fiveHour.used,12);delete r.rateLimitsByLimitId.codex;assert.deepEqual(liveAllowances(r,at),{});
 assert.deepEqual(liveAllowances({rateLimits:{limitId:'other',primary:window()}},at),{});
 assert.deepEqual(liveAllowances({...response(),rateLimitsByLimitId:null},at),{});
});
test('fresh live wins; stale live competes by timestamp and expired windows await refresh',()=>{
 const live=liveAllowances(response(),at),local=transcriptAllowances(record(35,new Date(now+10000).toISOString()));
 assert.equal(chooseAllowances(live,local,now+20000).fiveHour.used,25);
 assert.equal(chooseAllowances(live,local,now+61000).fiveHour.used,35);
 assert.equal(chooseAllowances(live,{},now+61000).fiveHour.stale,true);
 assert.equal(chooseAllowances(live,{},now+3600001).fiveHour.awaitingRefresh,true);
 assert.equal(chooseAllowances(live,{},now+3600001).fiveHour.used,25);
});
test('catalogue sorts by each event timestamp, handles partials and invalid records, and caches for five seconds',()=>{
 const a=path.join(temp,'a.jsonl'),b=path.join(temp,'b.jsonl'),c=new CatalogueAllowances();
 writeFileSync(a,line(record(70,new Date(now-1000).toISOString()),record(10,at),record(30,at,10080),record(80,new Date(now-2000).toISOString()))+'{bad}\n'+JSON.stringify(record(99)));
 writeFileSync(b,line(record(12,new Date(now+1000).toISOString())));
 let calls=0;const files=()=>{calls++;return [a,b];};
 assert.equal(c.read(files,now).fiveHour.used,12);assert.equal(c.read(files,now).weekly.used,30);assert.equal(calls,1);
 appendFileSync(b,line(record(5,new Date(now+2000).toISOString())));assert.equal(c.read(files,now+4999).fiveHour.used,12);
 assert.equal(c.read(files,now+5000).fiveHour.used,5);assert.equal(calls,2);
 writeFileSync(b+'.new',line(record(2,new Date(now+3000).toISOString())));renameSync(b+'.new',b);assert.equal(c.read(files,now+10000).fiveHour.used,2);
 writeFileSync(b,'');assert.equal(c.read(files,now+15000).fiveHour.used,10);c.close();
});
test('catalogue suffix bounds ignore partial first/last records and retain valid allowance-only events',()=>{
 const file=path.join(temp,'large.jsonl'),c=new CatalogueAllowances();
 writeFileSync(file,line(record(99))+'x'.repeat(1024*1024+20)+'\n'+line(record(4))+JSON.stringify(record(90)));
 assert.equal(c.read(()=>[file],now).fiveHour.used,4);
 writeFileSync(file,'x'.repeat(1024*1024+20));assert.deepEqual(c.read(()=>[file],now+5000),{});
});
test('allowance events update before call deduplication without inventing calls',()=>{
 const p=new TelemetryParser();p.consume(record(20));p.consume(record(8,new Date(now+1000).toISOString()));assert.equal(p.callCount,0);assert.equal(p.fiveHour.used,8);
});
test('collector shares newest catalogue allowance across selected chats and detects changes in another chat',t=>{
 t.mock.timers.enable({apis:['Date'],now});
 const home=mkdtempSync(path.join(temp,'home-')),a=path.join(home,'a.jsonl'),b=path.join(home,'b.jsonl');
 for(const [id,file,used,time]of [['a',a,60,at],['b',b,25,new Date(now+1000).toISOString()]])writeFileSync(file,line({type:'session_meta',payload:{id,source:'cli'}},record(used,time)));
 const db=new DatabaseSync(path.join(home,'state_5.sqlite'));db.exec('CREATE TABLE threads(id TEXT,title TEXT,rollout_path TEXT,archived INTEGER,updated_at INTEGER)');
 db.prepare('INSERT INTO threads VALUES(?,?,?,0,?)').run('a','A',a,100);db.prepare('INSERT INTO threads VALUES(?,?,?,0,?)').run('b','B',b,1);db.close();
 const account=new AccountLimits(home,{resolve:()=>undefined}),collector=new Collector(home,account);
 return (async()=>{try{
   const first=await collector.request('state',{taskId:'a'}),second=await collector.request('state',{taskId:'b'});assert.equal(first.state.fiveHour.used,25);assert.deepEqual(first.state.fiveHour,second.state.fiveHour);
   appendFileSync(b,line(record(12,new Date(now+2000).toISOString())));
   t.mock.timers.tick(5000);const updated=await collector.request('state',{taskId:'a',revision:first.revision});assert.equal(updated.state.fiveHour.used,12);assert.notEqual(updated.revision,first.revision);
   assert.equal(first.state.callCount,0);assert.equal(collector.store.activeCollectorCount,2);
 }finally{collector.close();}})();
});
test('live subprocess initializes once, shares requests, polls and cleans up',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now});
 const f=fakeSpawn((m,c)=>{initialized(m,c);if(m.method==='account/rateLimits/read')c.reply(m.id,response());});
 const service=new AccountLimits(temp,{spawn:f.spawn,resolve:()=>'/fake/codex'});
 try{
   service.touch();service.touch();await flush();assert.equal(f.children.length,1);assert.deepEqual(f.sent.map(m=>m.method),['initialize','initialized','account/rateLimits/read']);assert.equal(service.snapshot().fiveHour.used,25);
   assert.equal(f.children[0].options.env.CODEX_HOME,temp);assert.deepEqual(f.children[0].args,['app-server','--listen','stdio://']);
   t.mock.timers.tick(29999);service.touch();await flush();assert.equal(f.sent.length,3);
   t.mock.timers.tick(1);await flush();assert.equal(f.sent.filter(m=>m.method==='account/rateLimits/read').length,2);
   t.mock.timers.tick(60000);await flush();assert.equal(f.children[0].child.kills,1);
 }finally{service.close();}
});
test('initialization timeout kills child and backs off without overlapping refreshes',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now});const f=fakeSpawn(()=>{}),s=new AccountLimits(temp,{spawn:f.spawn,resolve:()=>'/fake/codex'});
 try{s.touch();await flush();t.mock.timers.tick(5000);await flush();assert.equal(f.children[0].child.kills,1);s.touch();await flush();assert.equal(f.children.length,1);t.mock.timers.tick(30000);await flush();assert.equal(f.children.length,2);}finally{s.close();}
});
test('read timeout, RPC errors, process failures, notifications and partial responses',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now});let mode='success';
 const f=fakeSpawn((m,c)=>{initialized(m,c);if(m.method==='account/rateLimits/read'){
   if(mode==='success')c.reply(m.id,response());else if(mode==='partial')c.reply(m.id,response(null,window(7,10080)));else if(mode==='error')c.stdout.write(JSON.stringify({id:m.id,error:{code:1,message:'private'}})+'\n');
 }}),s=new AccountLimits(temp,{spawn:f.spawn,resolve:()=>'/fake/codex'});
 try{
   s.touch();await flush();t.mock.timers.tick(1);const c=f.children[0].child;
   c.stdout.write(JSON.stringify({method:'account/rateLimits/updated',params:response(window(8))})+'\n');assert.equal(s.snapshot().fiveHour.used,8);
   c.stdout.write(JSON.stringify({method:'account/rateLimits/updated',params:{rateLimits:{limitId:'other',primary:window(99)}}})+'\n');assert.equal(s.snapshot().fiveHour.used,8);
   mode='partial';t.mock.timers.tick(29999);await flush();assert.equal(s.snapshot().fiveHour,undefined);assert.equal(s.snapshot().weekly.used,7);
   s.touch();mode='timeout';t.mock.timers.tick(30000);await flush();t.mock.timers.tick(5000);await flush();assert.equal(c.kills,1);
   s.touch();mode='error';t.mock.timers.tick(30000);await flush();assert.equal(f.children[1].child.kills,1);
   s.touch();mode='success';t.mock.timers.tick(60000);await flush();s.touch();await flush();
   const last=f.children.at(-1).child;last.emit('error',new Error('spawn failure'));assert.equal(last.kills,1);
 }finally{s.close();}
});
test('missing executable retries with bounded backoff and close prevents new children',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now});let attempts=0;const s=new AccountLimits(temp,{resolve:()=>{attempts++;return undefined;}});
 try{
   s.touch();await flush();assert.equal(attempts,1);s.touch();await flush();assert.equal(attempts,1);
   for(const delay of [30000,60000,120000,240000,300000]){t.mock.timers.tick(delay);s.touch();await flush();}
   assert.equal(attempts,6);s.close();t.mock.timers.tick(300000);s.touch();await flush();assert.equal(attempts,6);
 }finally{s.close();}
});
test('Codex resolver honors executable host override and PATH without invoking a shell',()=>{
 const file=path.join(temp,process.platform==='win32'?'codex.exe':'codex');writeFileSync(file,'test');chmodSync(file,0o755);
 assert.equal(resolveCodex({CODEX_CLI_PATH:file,PATH:''}),file);assert.equal(resolveCodex({PATH:temp}),file);
});

test('synchronous spawn failure returns to retryable state',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now});let attempts=0;const s=new AccountLimits(temp,{resolve:()=>'/missing/codex',spawn:()=>{attempts++;throw new Error('ENOENT');}});
 try{s.touch();await flush();assert.equal(attempts,1);t.mock.timers.tick(30000);await flush();assert.equal(attempts,2);}finally{s.close();}
});
