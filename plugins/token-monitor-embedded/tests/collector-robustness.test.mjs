import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {TelemetryParser} from '../server/dist/parser.mjs';
import {TelemetryStore} from '../server/dist/collector.mjs';
import {cleanTitle} from '../server/dist/metrics.mjs';

const temp=mkdtempSync(path.join(tmpdir(),'tm-collector-robustness-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
const usage={input_tokens:100,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:10,reasoning_output_tokens:2};
const call=(timestamp,extra={})=>({type:'event_msg',timestamp,payload:{type:'token_count',info:{model:'gpt-6.1-sol',last_token_usage:{...usage,...extra}}}});

test('deeply nested JSON telemetry stays parseable and preserves canonical replay detection',()=>{
  const p=new TelemetryParser(),stamp='2026-10-20T00:00:00Z';
  const nested='{"nested":'.repeat(8000)+'null'+'}'.repeat(8000);
  const first=`{"type":"event_msg","timestamp":"${stamp}","payload":{"type":"token_count","info":{"model":"gpt-6.1-sol","last_token_usage":${JSON.stringify(usage)},"extra":${nested}}}}`;
  const replay=`{"type":"event_msg","timestamp":"${stamp}","payload":{"type":"token_count","info":{"extra":${nested},"last_token_usage":${JSON.stringify(usage)},"model":"gpt-6.1-sol"}}}`;
  assert.doesNotThrow(()=>p.consume(first));
  p.consume(replay);
  p.consume(call('2026-10-20T00:00:01Z'));
  assert.equal(p.callCount,2);
  assert.equal(p.usage.input,200);
});

test('missing or malformed cache counters remain unavailable while recorded zero remains valid',()=>{
  for(const cached_input_tokens of [undefined,null,'invalid',false,{},[]]){
    const p=new TelemetryParser();
    p.consume(call('2026-10-20T00:00:00Z',{cached_input_tokens}));
    assert.equal(p.callCount,1);
    assert.equal(p.samples[0].cachedRecorded,false);
    assert.equal(p.samples[0].price.total,undefined);
    assert.equal(p.usage.cacheComplete,false);
    assert.equal(p.usage.pricedCalls,0);
    const unknown=p.snapshot({id:'task',title:'Task'});
    assert.equal(unknown.cached,undefined);
    assert.equal(unknown.fresh,undefined);
    p.consume(call('2026-10-20T00:00:01Z'));
    const recorded=p.snapshot({id:'task',title:'Task'});
    assert.equal(recorded.cached,0);
    assert.equal(recorded.fresh,100);
  }
});

test('invalid cwd metadata cannot make catalogue or snapshots throw',()=>{
  const home=mkdtempSync(path.join(temp,'home-')),file=path.join(home,'task.jsonl');
  writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'task',source:'cli'}})+'\n');
  const db=new DatabaseSync(path.join(home,'state_5.sqlite'));
  db.exec('CREATE TABLE threads(id TEXT,title TEXT,rollout_path TEXT,cwd,archived INTEGER)');
  db.prepare('INSERT INTO threads VALUES(?,?,?,?,0)').run('task','',file,42);db.close();
  const store=new TelemetryStore(home);
  assert.deepEqual(store.tasks(),[{id:'task',title:'Task · task',workspace:undefined}]);
  assert.equal(store.snapshot('task').task.title,'Task · task');
  const state=path.join(home,'token-monitor-embedded');mkdirSync(path.join(state,'tasks'),{recursive:true});
  writeFileSync(path.join(state,'tasks/task.json'),JSON.stringify({sequence:'test',session:{session_id:'task',transcript_path:file,cwd:{bad:true}}}));
  assert.deepEqual(store.taskMetadata('task'),{id:'task',title:'Task · task',workspace:undefined});
  assert.equal(store.snapshot('task').task.workspace,undefined);
  store.close();
});

test('title truncation preserves graphemes on long input',()=>{
  const grapheme='👩🏽‍💻';
  assert.equal(cleanTitle('  '+grapheme.repeat(100000)+'  '),grapheme.repeat(90));
  assert.equal(cleanTitle('  a\n\tb  '),'a b');
  assert.equal(cleanTitle('<environment_context>hidden'),undefined);
});
