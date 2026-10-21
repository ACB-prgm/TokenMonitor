#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm,readdir,stat} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';
const repo=fileURLToPath(new URL('..',import.meta.url)),version=(await readFile(path.join(repo,'VERSION'),'utf8')).trim();
const host=`${process.platform==='darwin'?'macos':process.platform==='win32'?'windows':process.platform}-${process.arch}`,target=process.argv.includes('--target')?process.argv[process.argv.indexOf('--target')+1]:host;
const digest=x=>createHash('sha256').update(x).digest('hex');
const archive=path.join(repo,'dist',`token-monitor-embedded-${version}-${target}.zip`);assert.equal(digest(await readFile(archive)),(await readFile(archive+'.sha256','utf8')).split(/\s/)[0]);
const temp=await mkdtemp(path.join(tmpdir(),'TokenMonitor package test '));
try{
 execFileSync(process.platform==='win32'?'python':'python3',['-c',`import pathlib,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n for n in z.namelist():\n  assert not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts\n z.extractall(sys.argv[2])`,archive,temp]);
 const plugin=path.join(temp,'token-monitor-embedded'),release=JSON.parse(await readFile(path.join(plugin,'release.json'),'utf8'));assert.equal(release.version,version);assert.equal(release.target,target);
 for(const entry of release.files){assert.equal(digest(await readFile(path.join(plugin,entry.path))),entry.sha256);assert.doesNotMatch(entry.path,/\.swift$|TokenMonitorCollector|CodexUsageMonitor|node_modules/);}
 const compressed=await readFile(path.join(plugin,'runtime/node.gz'));const {gunzipSync}=await import('node:zlib');const binary=gunzipSync(compressed);const expected=(await readFile(path.join(plugin,'runtime/node.sha256'),'utf8')).trim();assert.equal(digest(binary),expected);
 // Verify executable format and CPU type even when it cannot run on this host.
 if(target.startsWith('macos')){assert.equal(binary.readUInt32LE(0),0xfeedfacf);assert.equal(binary.readUInt32LE(4),target.endsWith('arm64')?0x100000c:0x1000007);}else{assert.equal(binary.subarray(0,2).toString(),'MZ');const pe=binary.readUInt32LE(0x3c);assert.equal(binary.readUInt32LE(pe),0x4550);assert.equal(binary.readUInt16LE(pe+4),target.endsWith('arm64')?0xaa64:0x8664);}
 const hooks=JSON.parse(await readFile(path.join(plugin,'hooks/hooks.json'),'utf8')).hooks;assert.equal(Object.keys(hooks).length,6);const config=JSON.parse(await readFile(path.join(plugin,'.mcp.json'),'utf8')).mcpServers['token-monitor-embedded'];assert.equal(config.command,target.startsWith('windows')?'powershell.exe':'/bin/sh');
 if(target!==host){console.log('Inspected foreign package '+target+'; execution requires matching OS/CPU');process.exitCode=0;}else{
  const home=path.join(temp,'codex home');const {mkdir}=await import('node:fs/promises');await mkdir(home);const id='archive-chat',transcript=path.join(home,'archive.jsonl');
  await writeFile(transcript,[{type:'session_meta',payload:{id,source:'cli'}},{type:'turn_context',payload:{model:'gpt-6.1-sol'}},{type:'event_msg',timestamp:'2026-10-19T12:00:00Z',payload:{type:'token_count',info:{model_context_window:200000,last_token_usage:{input_tokens:100000,cached_input_tokens:80000,cache_write_input_tokens:0,output_tokens:100,reasoning_output_tokens:40}}}}].map(JSON.stringify).join('\n')+'\n');
  const env={...process.env,CODEX_HOME:home,PLUGIN_ROOT:plugin,NODE_PATH:'',PATH:process.platform==='win32'?[path.join(process.env.SystemRoot,'System32'),path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0')].join(path.delimiter): '/usr/bin:/bin'};
  const args=config.args.map(a=>a.startsWith('./')?path.join(plugin,a):a),launcher=mode=>[...args,...(mode?(process.platform==='win32'?['-Mode',mode.replace('--','')]:[mode]):[])];
  const run=(mode,input='',extra={})=>new Promise((resolve,reject)=>{const child=spawn(config.command,launcher(mode),{cwd:temp,env:{...env,...extra},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(new Error('Launcher timeout '+mode));},15000);child.on('error',reject);child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('exit',code=>{clearTimeout(timer);code===0?resolve({stdout,stderr}):reject(new Error('Launcher exit '+code+' '+stderr));});child.stdin.end(input);});
  const event=JSON.stringify({session_id:id,hook_event_name:'UserPromptSubmit',transcript_path:transcript,prompt:'PRIVATE_PROMPT'});
  // Probe the actual bootstrap pipe using synthetic bytes before invoking hooks.
  const hookEntry=path.join(plugin,'server/dist/startup-hook.mjs'),hookSource=await readFile(hookEntry);
  const probeInput='{"synthetic":"é 漢字"}';
  try {
   await writeFile(hookEntry,"const chunks=[];for await(const c of process.stdin)chunks.push(c);process.stdout.write(Buffer.concat(chunks).toString('base64'));\n");
   const probe=await run('--startup-hook',probeInput);assert.equal(probe.stderr,'');assert.equal(probe.stdout,Buffer.from(probeInput).toString('base64'),'bootstrap must preserve raw UTF-8 stdin');
  } finally { await writeFile(hookEntry,hookSource); }

  const startup=await run('--startup-hook',event);assert.equal(startup.stderr,'');assert.match(startup.stdout,/open_monitor/);assert.equal((await run('--startup-hook',event)).stdout,'');
  const cached=path.join(home,'token-monitor-embedded/runtime',expected,process.platform==='win32'?'node.exe':'node');assert.equal(digest(await readFile(cached)),expected);await writeFile(cached,'corrupt');assert.match((await run('--node-version')).stdout,/^v24\./);assert.equal(digest(await readFile(cached)),expected);
  await run('--node-version','',{PLUGIN_DATA:path.join(temp,'plugin data')});assert.equal(digest(await readFile(path.join(temp,'plugin data/runtime',expected,process.platform==='win32'?'node.exe':'node'))),expected);
  await run('--hook',JSON.stringify({session_id:id,hook_event_name:'SessionEnd',transcript_path:transcript}));
  const child=spawn(config.command,launcher(),{cwd:temp,env,stdio:['pipe','pipe','pipe']});let buffer='',errors='';const pending=new Map();let counter=0;
  child.stderr.on('data',x=>errors+=x);child.stdout.on('data',x=>{buffer+=x;let i;while((i=buffer.indexOf('\n'))>=0){const r=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);const item=pending.get(r.id);if(item){clearTimeout(item.timer);pending.delete(r.id);r.error?item.reject(new Error(JSON.stringify(r.error))):item.resolve(r.result);}}});
  const request=(method,params)=>new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>reject(new Error('MCP timeout '+method)),10000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  try{
   const init=await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'package-test',version:'1'}});assert.equal(init.serverInfo.version,version);child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
   const tools=(await request('tools/list',{})).tools;assert.equal(tools.length,5);assert.deepEqual(tools.find(t=>t.name==='manage_updates')._meta.ui.visibility,['app']);
   const result=await request('tools/call',{name:'open_monitor',arguments:{}});const s=result._meta.monitor;assert.equal(s.input,100000);assert.equal(s.usage.pricedCalls,1);assert.ok(Math.abs(s.usage.cost-.049)<1e-12);assert.match(s.status,/Session ended/);assert.deepEqual(result.content,[]);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROMPT|transcript_path|\.jsonl/);
   const next=await request('tools/call',{name:'get_monitor_state',arguments:{panelId:s.panelId,revision:s.revision}});assert.equal(next._meta.monitor.unchanged,true);
   const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();assert.equal(await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('MCP did not exit after stdin closure')),5000))]),0);
  }finally{if(child.exitCode===null)child.kill();for(const item of pending.values())clearTimeout(item.timer);}
  // SIGTERM lifecycle on POSIX; Windows termination follows pipe closure above.
  if(process.platform!=='win32'){const p=spawn(config.command,launcher(),{cwd:temp,env,stdio:['pipe','pipe','ignore']});const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);p.stdout.once('data',()=>{clearTimeout(timer);resolve();});});p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'signal-test',version:'1'}}})+'\n');await ready;const exited=new Promise(resolve=>p.once('exit',(code,signal)=>resolve({code,signal})));p.kill('SIGTERM');const result=await exited;assert.equal(result.code,0);}
  console.log('Offline runtime, hooks, cache repair, MCP metrics and shutdown passed: '+target);
 }
}finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
