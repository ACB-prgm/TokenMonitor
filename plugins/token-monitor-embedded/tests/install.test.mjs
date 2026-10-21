import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {verifyPackage,installRelease} from '../server/dist/install.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'tm-installer-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=path.join(root,'release with spaces','TokenMonitor'),plugin=path.join(source,'plugins/token-monitor-embedded'),dataRoot=path.join(root,'state');
 const files={'.codex-plugin/plugin.json':JSON.stringify({name:'token-monitor-embedded',version:'1.5.0',hooks:'./hooks/hooks.json',mcpServers:'./.mcp.json'}),'.mcp.json':'{}',
 'hooks/hooks.json':JSON.stringify({hooks:Object.fromEntries(['SessionStart','SessionEnd','UserPromptSubmit','Stop','PreCompact','PostCompact'].map(e=>[e,[{hooks:[{command:'fixture'}]}]]))}),
 'runtime/node.gz':gzipSync(Buffer.from('synthetic runtime')),'runtime/node.sha256':hash(Buffer.from('synthetic runtime')),'server/dist/index.mjs':'fixture','server/dist/install.mjs':'fixture','ui/dist/panel.html':'fixture','scripts/launch.sh':'fixture'};
 const release={version:'1.5.0',target:'macos-arm64',dirty:false,commit:'a'.repeat(40),files:[]};
 for(const [name,bytes]of Object.entries(files)){await mkdir(path.dirname(path.join(plugin,name)),{recursive:true});await writeFile(path.join(plugin,name),bytes);release.files.push({path:name,sha256:hash(Buffer.from(bytes))});}
 await writeFile(path.join(plugin,'release.json'),JSON.stringify(release));await mkdir(path.join(source,'.agents/plugins'),{recursive:true});await writeFile(path.join(source,'.agents/plugins/marketplace.json'),JSON.stringify({name:'tokenmonitor',plugins:[{name:'token-monitor-embedded',policy:{installation:'AVAILABLE'},source:{source:'local',path:'./plugins/token-monitor-embedded'}}]}));
 const calls=[];let active,fail=false;
 const run=args=>{calls.push(args);if(args[0]==='marketplace'&&args[1]==='list')return JSON.stringify({marketplaces:active?[{name:'tokenmonitor',root:active,marketplaceSource:{sourceType:'local'}}]:[]});
  if(args[0]==='marketplace'&&args[1]==='add'){active=args[2];return '';}
  if(args[0]==='marketplace'&&args[1]==='remove'){if(!active)throw Error('not registered');active=undefined;return '';}
  if(args[0]==='add'&&fail){fail=false;throw Error('simulated CLI failure');}return '';};
 return {root,plugin,source,calls,dataRoot,release,options:{target:'macos-arm64',dataRoot,run},active:()=>active,setActive:s=>{active=s;},fail:()=>{fail=true;},journal:async()=>JSON.parse(await readFile(path.join(dataRoot,'installation.json'),'utf8'))};
}
test('verify-only validates complete package without invoking Codex',async t=>{const f=await fixture(t);assert.equal((await verifyPackage(f.plugin,'macos-arm64')).version,'1.5.0');await installRelease(f.plugin,{...f.options,verifyOnly:true});assert.equal(f.calls.length,0);});
test('first install and repeated install use supported CLI commands',async t=>{const f=await fixture(t);await installRelease(f.plugin,f.options);assert.equal(f.active(),await import('node:fs/promises').then(fs=>fs.realpath(f.source)));assert.equal((await f.journal()).phase,'installed');await installRelease(f.plugin,f.options);assert.equal(f.calls.filter(a=>a[1]==='remove').length,0);assert.equal(f.calls.filter(a=>a[0]==='add').length,2);});
test('update retains previous source and user state',async t=>{const f=await fixture(t);f.setActive('/previous/release');await mkdir(f.dataRoot);await writeFile(path.join(f.dataRoot,'preferences.json'),'keep');await installRelease(f.plugin,f.options);assert.equal((await f.journal()).previous,'/previous/release');assert.equal(await readFile(path.join(f.dataRoot,'preferences.json'),'utf8'),'keep');assert.deepEqual(f.calls[1],['marketplace','remove','tokenmonitor']);});
test('CLI failure restores previous source and releases installation lock',async t=>{const f=await fixture(t);f.setActive('/previous/release');f.fail();await assert.rejects(installRelease(f.plugin,f.options),/previous source restored/);assert.equal(f.active(),'/previous/release');assert.equal((await f.journal()).recovered,true);await installRelease(f.plugin,f.options);assert.equal((await f.journal()).phase,'installed');});
test('interrupted registration can retry while retaining original rollback source',async t=>{const f=await fixture(t);f.setActive(await import('node:fs/promises').then(fs=>fs.realpath(f.source)));await mkdir(f.dataRoot);await writeFile(path.join(f.dataRoot,'installation.json'),JSON.stringify({phase:'registered',source:f.active(),previous:'/old/release'}));await installRelease(f.plugin,f.options);assert.equal((await f.journal()).previous,'/old/release');});
for(const mutation of [r=>r.dirty=true,r=>r.target='windows-x64',r=>r.version='bad',r=>r.commit='unknown',r=>r.files.push(r.files[0]),r=>r.files[0].path='../outside',r=>r.files[0].sha256='0'.repeat(64),r=>r.files=r.files.filter(x=>x.path!=='.mcp.json')]){
 test('invalid or incompatible package is rejected before Codex mutation',async t=>{const f=await fixture(t);mutation(f.release);await writeFile(path.join(f.plugin,'release.json'),JSON.stringify(f.release));await assert.rejects(installRelease(f.plugin,f.options));assert.equal(f.calls.length,0);});
}
test('symlink escape is rejected before installation',async t=>{const f=await fixture(t);const target=path.join(f.plugin,'ui/dist/panel.html');await rm(target);await writeFile(path.join(f.root,'outside'),'fixture');await symlink(path.join(f.root,'outside'),target);await assert.rejects(installRelease(f.plugin,f.options),/symlinks/);assert.equal(f.calls.length,0);});
test('live installer lock prevents concurrent installation; dead owner can recover',async t=>{const f=await fixture(t);await mkdir(f.dataRoot);const lock=path.join(f.dataRoot,'install.lock');await writeFile(lock,String(process.pid));await assert.rejects(installRelease(f.plugin,f.options),/installation is running/);assert.equal(f.calls.length,0);await writeFile(lock,'2147483647');await installRelease(f.plugin,f.options);assert.equal((await f.journal()).phase,'installed');});
test('Codex npm entry point runs on the bundled Node without shell interpretation',async t=>{
 const f=await fixture(t),entry=path.join(f.root,'codex.js');await writeFile(entry,'#!/usr/bin/env node\n');
 const {codexCommand}=await import('../server/dist/install-platform.mjs');
 const result=codexCommand({CODEX_CLI_PATH:entry});assert.equal(result.command,process.execPath);assert.deepEqual(result.prefix,[await import('node:fs/promises').then(fs=>fs.realpath(entry))]);
 await assert.rejects(async()=>codexCommand({PATH:''}),/Codex CLI not found/);
 const shim=path.join(f.root,'codex.cmd');await writeFile(shim,'fixture');assert.throws(()=>codexCommand({CODEX_CLI_PATH:shim}),/native codex.exe/);
});
test('installer refuses an unavailable development catalog',async t=>{
 const f=await fixture(t),file=path.join(f.source,'.agents/plugins/marketplace.json'),catalog=JSON.parse(await readFile(file,'utf8'));
 catalog.plugins[0].policy.installation='NOT_AVAILABLE';await writeFile(file,JSON.stringify(catalog));
 await assert.rejects(installRelease(f.plugin,f.options),/Invalid release marketplace/);assert.equal(f.calls.length,0);
});
