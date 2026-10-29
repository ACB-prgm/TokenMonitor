import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Panels} from '../server/dist/panels.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const temp=await mkdtemp(path.join(tmpdir(),'embedded-telemetry-'));
after(()=>rm(temp,{recursive:true,force:true}));
async function fixture(){
 const home=await mkdtemp(path.join(temp,'home-'));
 const db=new DatabaseSync(path.join(home,'state_5.sqlite'));
 db.exec('CREATE TABLE threads (id TEXT, title TEXT, rollout_path TEXT, cwd TEXT, archived INTEGER, updated_at INTEGER)');
 for(const id of ['a','b']){
  const file=path.join(home,`${id}.jsonl`);
  const records=[{type:'session_meta',payload:{id,source:'cli'}},{type:'turn_context',payload:{model:'gpt-test',effort:'high'}},{type:'event_msg',timestamp:'2026-10-19T14:00:00Z',payload:{type:'token_count',rate_limits:{primary:{used_percent:25,window_minutes:300,resets_at:1900000000}},info:{model_context_window:200000,last_token_usage:{input_tokens:100000,cached_input_tokens:80000,output_tokens:100,reasoning_output_tokens:40},total_token_usage:{output_tokens:1000000,reasoning_output_tokens:400000}}}}];
  await writeFile(file,records.map(JSON.stringify).join('\n')+'\n');
  db.prepare('INSERT INTO threads VALUES (?,?,?,?,0,1)').run(id,`Task ${id}`,file,'/SECRET/workspace');
 }db.close();
 const client=new Client({name:'telemetry-integration',version:'1'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'server/dist/index.mjs')],cwd:root,env:{...process.env,CODEX_HOME:home},stderr:'pipe'}));
 const call=(name,args={},host)=>client.callTool({name,arguments:args,...(host?{_meta:{threadId:host}}:{})});
 const open=async(host)=>(await call('open_monitor',{},host))._meta.monitor;
 const refresh=async(panelId,args={},host)=>(await call('get_monitor_state',{panelId,...args},host))._meta?.monitor;
 const hook=(id,event='Stop')=>execFileSync(process.execPath,[path.join(root,'server/dist/hook.mjs')],{env:{...process.env,CODEX_HOME:home},input:JSON.stringify({hook_event_name:event,session_id:id,transcript_path:path.join(home,`${id}.jsonl`)})});
 return {home,client,call,open,refresh,hook};
}
test('real TypeScript metrics bind exactly to the host, stay UI-only, and return only changed revisions',async()=>{
 const f=await fixture();try{
  const s=await f.open('a');assert.equal(s.followingMode,'host-chat');assert.equal(s.selectedId,'a');
  assert.equal(s.input,100000);assert.equal(s.cached,80000);assert.equal(s.fresh,20000);assert.equal(s.model,'gpt-test');assert.equal(s.contextPercent,50);assert.equal(s.fiveHour.used,25);
  assert.equal(s.usage.unpricedCalls,1);assert.equal(s.usage.pricedCalls,0);assert.equal(s.usage.input,100000);assert.equal(s.usage.cumulativeMismatch,true);assert.equal(s.samples[0].price.total,undefined);assert.equal(s.compactionValue.status,'unavailable');assert.match(s.compactionValue.limitation,/pricing unavailable/);assert.equal('apiCompactionBreakEven' in s,false);
  assert.equal(s.outputTotals.total,1000000);assert.equal(s.outputTotals.reasoning,400000);assert.equal(s.callCount,1);assert.match(s.samples[0].timestamp,/Z$/);
  assert.doesNotMatch(JSON.stringify(s),/SECRET|transcriptPath|transcript_path|\.jsonl/);
  assert.equal((await f.refresh(s.panelId,{revision:s.revision},'a')).unchanged,true);
  assert.equal((await f.call('get_monitor_state',{panelId:s.panelId,action:'select',taskId:'/etc/passwd'},'a')).isError,true);
  const unknown=await f.open('not-a-local-thread');assert.equal(unknown.followingMode,'latest-hook');assert.equal(unknown.selectedId,undefined);
  assert.equal((await f.call('list_tasks',{panelId:s.panelId},'a'))._meta.tasks.length,2);
 }finally{await f.client.close();}
});
test('simultaneous panels inspect independently and resume on relevant host hooks',async()=>{
 const f=await fixture();try{
  const a=await f.open('a'),b=await f.open('b');
  const selected=await f.refresh(a.panelId,{action:'select',taskId:'b'},'a');assert.equal(selected.selectedId,'b');assert.equal('locked' in selected,false);
  assert.equal((await f.refresh(a.panelId,{},'a')).selectedId,'b');
  f.hook('b');assert.equal((await f.refresh(a.panelId,{},'a')).selectedId,'b');
  assert.equal((await f.refresh(b.panelId,{},'b')).selectedId,'b');
  f.hook('a');assert.equal((await f.refresh(a.panelId,{},'a')).selectedId,'a');
  assert.equal((await f.refresh(b.panelId,{},'b')).selectedId,'b');
  const fresh=await f.open('a');assert.equal(fresh.selectedId,'a');assert.notEqual(fresh.panelId,a.panelId);
  for(const action of ['lock','unlock'])assert.equal((await f.call('get_monitor_state',{panelId:a.panelId,action},'a')).isError,true);
 }finally{await f.client.close();}
});
test('fallback follows background completion and compaction clears cached/fresh until the next call',async()=>{
 const f=await fixture();try{
  f.hook('a');const s=await f.open();assert.equal(s.selectedId,'a');assert.equal(s.followingMode,'latest-hook');
  f.hook('b','SessionEnd');const next=await f.refresh(s.panelId);assert.equal(next.selectedId,'b');assert.match(next.status,/Session ended/);
  f.hook('a','PreCompact');const compacting=await f.refresh(s.panelId);assert.equal(compacting.selectedId,'a');assert.equal(compacting.isCompacting,true);assert.equal(compacting.compactionValue.status,'unavailable');
  const file=path.join(f.home,'a.jsonl');const original=await readFile(file,'utf8');
  await writeFile(file,original+JSON.stringify({type:'compacted',timestamp:new Date(Date.now()+1000).toISOString(),payload:{}})+'\n'+JSON.stringify({type:'event_msg',timestamp:new Date(Date.now()+2000).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0,total_tokens:40000}}}})+'\n');
  const completed=await f.refresh(s.panelId);assert.equal(completed.isCompacting,false);assert.equal(completed.awaitingPostCompactionCall,true);assert.equal(completed.input,40000);assert.equal(completed.cached,undefined);assert.equal(completed.compactions.length,1);assert.equal(completed.compactionValue.score,null);assert.match(completed.compactionValue.limitation,/post-compaction/);
 }finally{await f.client.close();}
});
test('disconnect retains metrics and recovery reconstructs a host-bound panel',async()=>{
 let broken=false;const backend={request:async(method)=>{
  if(broken)throw new Error('offline');if(method==='catalog')return {hostMatched:true,tasks:[{id:'a',title:'A'}]};
  return {revision:'r1',state:{task:{id:'a',title:'A'},input:123,available:true,status:'Monitoring selected task'}};
 }};
 const panels=new Panels(backend),id=panels.create('a');assert.equal((await panels.state(id)).input,123);
 broken=true;const offline=await panels.state(id);assert.equal(offline.input,123);assert.equal(offline.disconnected,true);
 broken=false;const online=await panels.state(id,{revision:offline.revision});assert.equal(online.disconnected,false);assert.equal(online.input,123);
 const recovered=await new Panels(backend).state(id,{},'a');assert.equal('locked' in recovered,false);assert.equal(recovered.selectedId,'a');
});

test('concurrent task switches cannot label a stale snapshot as the newly selected task',async()=>{
 const backend={request:async(method,p)=>{
  if(method==='catalog')return {hostMatched:false,tasks:[{id:'a',title:'A'},{id:'b',title:'B'}]};
  if(p.taskId==='a')await new Promise(resolve=>setTimeout(resolve,35));
  return {revision:p.taskId,state:{task:{id:p.taskId,title:p.taskId},status:'Monitoring selected task',input:p.taskId==='a'?100:200}};
 }};
 const panels=new Panels(backend),id=panels.create();
 const [a,b]=await Promise.all([panels.state(id,{action:'select',taskId:'a'}),panels.state(id,{action:'select',taskId:'b'})]);
 assert.equal(a.selectedId,'a');assert.equal(a.task.id,'a');assert.equal(b.selectedId,'b');assert.equal(b.task.id,'b');
 const last=await panels.state(id);assert.equal(last.task.id,last.selectedId);assert.equal(last.input,200);
});

for(const manual of [false,true])test(`${manual?'manual':'hook'} task switch failure never reuses another task's snapshot or revision`,async()=>{
 let selected='a',broken=false;
 const requests=[];
 const backend={request:async(method,input)=>{
  if(method==='catalog')return {hostMatched:false,tasks:[{id:'a',title:'A'},{id:'b',title:'B'}],latestHook:{id:selected,sequence:selected}};
  requests.push({...input});
  if(broken)throw new Error('offline');
  return {revision:input.taskId,state:{task:{id:input.taskId},input:input.taskId==='a'?100:200}};
 }};
 const panels=new Panels(backend),id=panels.create();
 assert.equal((await panels.state(id)).task.id,'a');
 selected='b';broken=true;
 if(manual)await assert.rejects(panels.state(id,{action:'select',taskId:'b'}),/offline/);
 const offline=await panels.state(id);
 assert.equal(offline.selectedId,'b');assert.equal(offline.disconnected,true);
 assert.equal(offline.task,undefined);assert.equal(offline.input,undefined);
 assert.equal(requests.at(-1).revision,undefined);
 broken=false;const recovered=await panels.state(id,{revision:offline.revision});
 assert.equal(recovered.selectedId,'b');assert.equal(recovered.task.id,'b');assert.equal(recovered.input,200);
});

