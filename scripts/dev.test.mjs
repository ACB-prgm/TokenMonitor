import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildDev,installDev,selector} from './dev.mjs';

const require=createRequire(new URL('../plugins/token-monitor-embedded/package.json',import.meta.url));
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const json=async file=>JSON.parse(await readFile(file,'utf8'));

test('DEV builds have isolated identity/state and serve the real panel over MCP',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'tokenmonitor-dev-'));
  const marketplaceRoot=path.join(temp,'marketplace with spaces');
  const home=path.join(temp,'codex');await mkdir(home);
  const stableManifest=new URL('../plugins/token-monitor-embedded/.codex-plugin/plugin.json',import.meta.url);
  const original=await readFile(stableManifest,'utf8');
  let client;
  try {
    const first=await buildDev({marketplaceRoot});
    const manifest=await json(path.join(first.pluginRoot,'.codex-plugin/plugin.json'));
    assert.equal(manifest.name,'token-monitor-dev');assert.equal(manifest.interface.displayName,'Token Monitor DEV');
    assert.match(manifest.version,/^\d+\.\d+\.\d+-dev\.\d+\.\d+$/);
    const config=await json(path.join(first.pluginRoot,'.mcp.json'));
    assert.deepEqual(Object.keys(config.mcpServers),['token-monitor-dev']);
    assert.equal(config.mcpServers['token-monitor-dev'].command,process.execPath);
    const {hooks}=await json(path.join(first.pluginRoot,'hooks/hooks.json'));
    assert.equal(hooks.UserPromptSubmit,undefined);assert.equal(Object.keys(hooks).length,5);
    const {stateRoot}=await import(pathToFileURL(path.join(first.pluginRoot,'server/dist/platform.mjs')));
    assert.equal(stateRoot(home),path.join(home,'token-monitor-dev'));
    execFileSync(process.execPath,[path.join(first.pluginRoot,'server/dist/startup-hook.mjs')],{
      env:{...process.env,CODEX_HOME:home},input:JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'test-session'})
    });
    await readFile(path.join(home,'token-monitor-dev/startup/test-session.json'));
    await assert.rejects(readFile(path.join(home,'token-monitor-embedded/startup/test-session.json')));
    client=new Client({name:'dev-test',version:'1'});
    await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(first.pluginRoot,'server/dist/index.mjs')],cwd:first.pluginRoot,env:{...process.env,CODEX_HOME:home},stderr:'pipe'}));
    assert.equal(client.getServerVersion().name,'token-monitor-dev');
    assert.equal(client.getServerVersion().version,first.version);
    const tools=await client.listTools();const open=tools.tools.find(tool=>tool.name==='open_monitor');
    assert.equal(open.title,'Token Monitor DEV');
    assert.match(open._meta.ui.resourceUri,/^ui:\/\/token-monitor-dev\//);
    const result=await client.callTool({name:'open_monitor',arguments:{}});
    assert.ok(result._meta.monitor.panelId);
    const panel=await client.readResource({uri:open._meta.ui.resourceUri});
    assert.match(panel.contents[0].text,/<title>Token Monitor DEV<\/title>/);
    assert.match(panel.contents[0].text,/Token Monitor DEV/);
    assert.doesNotMatch(panel.contents[0].text,/process\.env\.TOKEN_MONITOR/);
    const second=await buildDev({marketplaceRoot});
    assert.notEqual(first.version,second.version);
    await readFile(path.join(first.pluginRoot,'ui/dist/panel.html'));
    const catalog=await json(path.join(marketplaceRoot,'.agents/plugins/marketplace.json'));
    assert.equal(catalog.name,'tokenmonitor-dev');
    assert.equal(path.resolve(marketplaceRoot,catalog.plugins[0].source.path),second.pluginRoot);
    assert.equal(await readFile(stableManifest,'utf8'),original);
  } finally {await client?.close();await rm(temp,{recursive:true,force:true});}
});

test('DEV installation and refresh only address the DEV marketplace and plugin',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'tokenmonitor-dev-install-'));
  try {
    const calls=[];
    const run=existing=>args=>{calls.push(args);return args.includes('--json')?JSON.stringify({marketplaces:existing}):'Installed';};
    await installDev({marketplaceRoot:temp},run([{name:'tokenmonitor',root:'/release'}]));
    assert.deepEqual(calls,[['marketplace','list','--json'],['marketplace','add',temp],['add',selector]]);
    calls.length=0;
    await installDev({marketplaceRoot:temp},run([{name:'tokenmonitor-dev',root:temp}]));
    assert.deepEqual(calls,[['marketplace','list','--json'],['add',selector]]);
    calls.length=0;
    await assert.rejects(installDev({marketplaceRoot:temp},run([{name:'tokenmonitor-dev',root:path.dirname(temp)}])),/another checkout/);
    assert.equal(calls.length,1);
  } finally {await rm(temp,{recursive:true,force:true});}
});

test('fresh DEV MCP discovers historical JSONL without database or hooks',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'tokenmonitor-dev-cold-'));let client;
 try{
  const built=await buildDev({marketplaceRoot:path.join(temp,'marketplace')}),home=path.join(temp,'codex');
  const directory=path.join(home,'sessions','2026','01','01');await mkdir(directory,{recursive:true});
  const {writeFile}=await import('node:fs/promises');
  await writeFile(path.join(directory,'rollout-2026-01-01T00-00-00-historical.jsonl'),[
   {type:'session_meta',payload:{id:'historical',source:'cli'}},
   {type:'event_msg',timestamp:'2026-01-01T00:00:00Z',payload:{type:'token_count',info:{last_token_usage:{input_tokens:4321,output_tokens:10}}}}
  ].map(JSON.stringify).join('\n')+'\n');
  client=new Client({name:'cold-test',version:'1'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(built.pluginRoot,'server/dist/index.mjs')],cwd:built.pluginRoot,env:{...process.env,CODEX_HOME:home,CODEX_CLI_PATH:path.join(temp,'absent')},stderr:'pipe'}));
  let state=(await client.callTool({name:'open_monitor',arguments:{}}))._meta.monitor;
  for(let i=0;i<100&&!state.tasks.some(t=>t.id==='historical');i++){
   await new Promise(r=>setTimeout(r,10));state=(await client.callTool({name:'get_monitor_state',arguments:{panelId:state.panelId}}))._meta.monitor;
  }
  assert.ok(state.tasks.some(t=>t.id==='historical'));assert.equal(state.selectedId,undefined);
  const selected=(await client.callTool({name:'get_monitor_state',arguments:{panelId:state.panelId,action:'select',taskId:'historical'}}))._meta.monitor;
  assert.equal(selected.input,4321);assert.doesNotMatch(JSON.stringify(state),/transcript_path|\.jsonl/);
  await assert.rejects(readFile(path.join(home,'token-monitor-dev','latest-hook.json')));
 }finally{await client?.close();await rm(temp,{recursive:true,force:true});}
});
