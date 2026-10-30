import test from 'node:test';
import assert from 'node:assert/strict';
import {TelemetryParser} from '../server/dist/parser.mjs';
const record=(p,payload)=>p.consume({type:'response_item',payload});
const tokens=(p,n=1,input=100)=>p.consume({type:'event_msg',timestamp:`2026-10-24T12:00:0${n}Z`,payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,output_tokens:10}}}});

test('activity associates visible response and explicit tool/file targets with one usage record',()=>{
 const p=new TelemetryParser();
 record(p,{type:'message',role:'user',content:[{type:'input_text',text:'PRIVATE PROMPT'}]});
 record(p,{type:'reasoning',summary:[{text:'PRIVATE REASONING'}]});
 record(p,{type:'message',role:'assistant',content:[{type:'output_text',text:'Updated the chart.'}]});
 const patch={type:'custom_tool_call',name:'apply_patch',call_id:'patch',input:'*** Begin Patch\n*** Update File: ui/view.tsx\n+PRIVATE PATCH\n*** Move to: ui/renamed.tsx\n*** Add File: ui/new.ts\n*** Delete File: ui/old.ts\n*** End Patch'};
 record(p,patch);record(p,patch);
 record(p,{type:'custom_tool_call_output',call_id:'patch',output:'PRIVATE TOOL RESULT'});
 record(p,{type:'function_call',name:'exec_command',call_id:'test',arguments:JSON.stringify({cmd:'npm test'})});
 tokens(p);
 assert.deepEqual(p.samples[0].activity,{response:'Updated the chart.',tools:[{name:'apply_patch'},{name:'exec_command',detail:'npm test'}],files:['ui/view.tsx','ui/renamed.tsx','ui/new.ts','ui/old.ts']});
 assert.doesNotMatch(JSON.stringify(p.samples),/PRIVATE/);
 record(p,{type:'function_call',name:'search',arguments:'{"query":"chart styles"}'});tokens(p,2);
 assert.deepEqual(p.samples[1].activity,{tools:[{name:'search',detail:'chart styles'}],files:[]});
 tokens(p,3);assert.equal(p.samples[2].activity,undefined);
});

test('activity survives duplicate and allowance-only usage events without leaking across turns or compaction',()=>{
 const p=new TelemetryParser();tokens(p);
 record(p,{type:'message',role:'assistant',content:[{type:'output_text',text:'Second call.'}]});
 tokens(p); // duplicate record for the previous call
 p.consume({type:'event_msg',payload:{type:'token_count',info:{}}});
 tokens(p,2);assert.equal(p.samples[1].activity.response,'Second call.');
 for(const boundary of [{type:'turn_context',payload:{}},{type:'compacted',timestamp:'2026-10-24T12:01:00Z',payload:{}},{type:'event_msg',payload:{type:'user_message'}},{type:'event_msg',payload:{type:'task_aborted'}}]){
  record(p,{type:'message',role:'assistant',content:[{type:'output_text',text:'Stale activity'}]});
  p.consume(boundary);tokens(p,p.samples.length+1);assert.equal(p.samples.at(-1).activity,undefined);
 }
});

test('activity bounds excerpts, tools and file paths and handles malformed arguments',()=>{
 const p=new TelemetryParser();
 record(p,{type:'message',role:'assistant',content:[{type:'output_text',text:'<script>\u0000'+ 'x'.repeat(2000)}]});
 record(p,{type:'function_call',name:'write_file',arguments:'not json'});
 for(let i=0;i<20;i++)record(p,{type:'function_call',call_id:String(i),name:'write_file',arguments:JSON.stringify({path:'long/'+i+'x'.repeat(300),description:'d'.repeat(500)})});
 tokens(p);const a=p.samples[0].activity;
 assert.equal(a.response.length,600);assert.doesNotMatch(a.response,/\u0000/);assert.equal(a.tools.length,6);assert.equal(a.files.length,8);assert.equal(a.tools[1].detail.length,240);assert.equal(a.files[0].length,240);
});

test('call activity records deduplicated skill reads without carrying them to later calls',()=>{
 const p=new TelemetryParser();
 for(let i=0;i<2;i++)record(p,{type:'function_call',name:'exec_command',call_id:String(i),arguments:JSON.stringify({cmd:'cat /skills/pdf/SKILL.md /skills/documents/SKILL.md'})});
 tokens(p);assert.deepEqual(p.samples[0].activity.skills,['pdf','documents']);
 record(p,{type:'function_call',name:'exec_command',arguments:JSON.stringify({cmd:'npm test'})});
 tokens(p,2);assert.equal(p.samples[1].activity.skills,undefined);
});
