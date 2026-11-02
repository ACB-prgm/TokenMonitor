import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
const plugin=fileURLToPath(new URL('..',import.meta.url));
test('real hooks durably collect only their chat with no panel or background service',()=>{
 const home=mkdtempSync(path.join(tmpdir(),'tm-hook-history-'));
 try{
  mkdirSync(path.join(home,'sessions'));const file=path.join(home,'sessions','hook-chat.jsonl'),timestamp=new Date().toISOString();
  writeFileSync(file,[{type:'session_meta',payload:{id:'hook-chat',source:'cli'}},{type:'turn_context',payload:{model:'gpt-6.1-sol',effort:'high'}},{type:'event_msg',timestamp,payload:{type:'token_count',info:{last_token_usage:{input_tokens:1000,cached_input_tokens:500,cache_write_input_tokens:0,output_tokens:10}}}}].map(JSON.stringify).join('\n')+'\n');
  writeFileSync(path.join(home,'sessions','unrelated.jsonl'),JSON.stringify({type:'session_meta',payload:{id:'unrelated',source:'cli'}})+'\n');
  const run=()=>execFileSync(process.execPath,[path.join(plugin,'server/dist/hook.mjs')],{env:{...process.env,CODEX_HOME:home},input:JSON.stringify({session_id:'hook-chat',transcript_path:file,hook_event_name:'Stop',prompt:'PRIVATE_HOOK_PROMPT'}),timeout:3000});
  const started=performance.now();assert.equal(run().toString(),'');assert.ok(performance.now()-started<2000,'bounded hook must finish well inside its host timeout');
  const database=path.join(home,'token-monitor-embedded','efficiency.sqlite');let db=new DatabaseSync(database,{readOnly:true});assert.equal(db.prepare("SELECT calls FROM history_totals WHERE source='' ").get().calls,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM history_sources').get().n,1);db.close();
  run();db=new DatabaseSync(database,{readOnly:true});assert.equal(db.prepare("SELECT calls FROM history_totals WHERE source='' ").get().calls,1);assert.equal(db.prepare('SELECT complete FROM history_cursors').get().complete,1);db.close();
  assert.ok(!readFileSync(database).includes(Buffer.from('PRIVATE_HOOK_PROMPT')));assert.ok(!readdirSync(path.dirname(database)).some(f=>/backup|\.bak|snapshot/.test(f)));
 }finally{rmSync(home,{recursive:true,force:true});}
});
