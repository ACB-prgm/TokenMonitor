import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {zipSync} from 'fflate';
import {AutoUpdater,installUpdate} from '../server/dist/auto-update.mjs';
import {detectedTarget} from '../server/dist/updates.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'tm-auto-update-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const version='1.7.0',target='macos-arm64',name=`token-monitor-${version}-${target}.zip`;
 const files={'.codex-plugin/plugin.json':JSON.stringify({name:'token-monitor-embedded',version,hooks:'./hooks/hooks.json',mcpServers:'./.mcp.json'}),'.mcp.json':'{}',
 'hooks/hooks.json':JSON.stringify({hooks:Object.fromEntries(['SessionStart','SessionEnd','UserPromptSubmit','Stop','PreCompact','PostCompact'].map(e=>[e,[{hooks:[{command:'fixture'}]}]]))}),
 'runtime/node.gz':gzipSync(Buffer.from('synthetic runtime')),'runtime/node.sha256':hash(Buffer.from('synthetic runtime')),'server/dist/index.mjs':'fixture','server/dist/install.mjs':'fixture','ui/dist/panel.html':'fixture','scripts/launch.sh':'fixture'};
 const release={version,target,dirty:false,commit:'a'.repeat(40),files:Object.entries(files).map(([p,bytes])=>({path:p,sha256:hash(Buffer.from(bytes))}))};
 const archiveFiles=Object.fromEntries(Object.entries(files).map(([p,b])=>['TokenMonitor/plugins/token-monitor-embedded/'+p,Buffer.from(b)]));
 archiveFiles['TokenMonitor/plugins/token-monitor-embedded/release.json']=Buffer.from(JSON.stringify(release));
 archiveFiles['TokenMonitor/.agents/plugins/marketplace.json']=Buffer.from(JSON.stringify({name:'tokenmonitor',plugins:[{name:'token-monitor-embedded',policy:{installation:'AVAILABLE'},source:{source:'local',path:'./plugins/token-monitor-embedded'}}]}));
 const value={id:'test',pid:process.pid,phase:'downloading',version,target,downloadURL:`https://github.com/ACB-prgm/TokenMonitor/releases/download/v${version}/${name}`,checksumURL:`https://github.com/ACB-prgm/TokenMonitor/releases/download/v${version}/${name}.sha256`};
 let archive=zipSync(archiveFiles),checksum;const calls=[],requests=[],phases=[];let active='/previous/release',fail=false;
 const run=args=>{calls.push(args);
  if(args[0]==='list')return JSON.stringify({installed:[{pluginId:'token-monitor-embedded@tokenmonitor',marketplaceSource:{sourceType:'local'}}]});
  if(args[0]==='marketplace'&&args[1]==='list')return JSON.stringify({marketplaces:active?[{name:'tokenmonitor',root:active,marketplaceSource:{sourceType:'local'}}]:[]});
  if(args[0]==='marketplace'&&args[1]==='add'){active=args[2];return '';}
  if(args[0]==='marketplace'&&args[1]==='remove'){active=undefined;return '';}
  if(args[0]==='add'&&fail){fail=false;throw Error('simulated CLI failure');}return '';
 };
 const options={root,target,releasesRoot:path.join(root,'releases'),dataRoot:path.join(root,'state'),run,onPhase:p=>phases.push(p),fetch:async(url,init)=>{requests.push([url,init]);return new Response(url.endsWith('.sha256')?(checksum??`${hash(archive)}  ${name}\n`):archive);}};
 return {root,value,options,calls,requests,phases,archiveFiles,release,active:()=>active,fail:()=>fail=true,setChecksum:s=>checksum=s,repack:()=>archive=zipSync(archiveFiles)};
}
test('verified download installs through existing CLI flow, retains rollback source and reports progress',async t=>{
 const f=await fixture(t);await installUpdate(f.value,f.options);
 assert.deepEqual(f.phases,['downloading','verifying','extracting','installing','installed']);
 assert.equal(f.requests.length,2);assert.ok(f.requests.every(([,init])=>init.redirect==='manual'));
 const journal=JSON.parse(await readFile(path.join(f.root,'state/installation.json'),'utf8'));assert.equal(journal.previous,'/previous/release');assert.equal(journal.version,'1.7.0');
 assert.equal((await new AutoUpdater(f.root).status()).phase,'installed');assert.ok(f.active().startsWith(await realpath(f.options.releasesRoot)));
});
test('checksum failure never extracts or mutates Codex installation',async t=>{
 const f=await fixture(t);f.setChecksum('0'.repeat(64)+'  token-monitor-1.7.0-macos-arm64.zip');
 await assert.rejects(installUpdate(f.value,f.options),/checksum mismatch/);assert.deepEqual(f.calls.map(a=>a[0]),['list']);assert.equal(f.active(),'/previous/release');
});
test('wrong checksum filename and oversized checksum stop before ZIP download',async t=>{
 const f=await fixture(t);f.setChecksum('0'.repeat(64)+'  other.zip');await assert.rejects(installUpdate(f.value,f.options),/checksum file/);assert.equal(f.requests.length,1);
 f.setChecksum('x'.repeat(4097));await assert.rejects(installUpdate(f.value,f.options),/size limit/);assert.equal(f.requests.length,2);
});
test('wrong platform, substituted URLs and unsupported source cannot install',async t=>{
 const f=await fixture(t);
 await assert.rejects(installUpdate({...f.value,target:'windows-x64'},f.options),/does not match/);
 await assert.rejects(installUpdate({...f.value,downloadURL:'https://evil.test/update.zip'},f.options),/download URLs/);
 assert.equal(f.calls.length,0);
 await assert.rejects(installUpdate(f.value,{...f.options,run:()=>JSON.stringify({installed:[]})}),/original plugin source/);assert.equal(f.requests.length,0);
});
test('untrusted redirects are rejected before contacting their destination',async t=>{
 const f=await fixture(t);let requests=0;
 await assert.rejects(installUpdate(f.value,{...f.options,fetch:async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://evil.test/update'}});}}),/Untrusted download/);assert.equal(requests,1);
});
for(const bad of ['TokenMonitor/../escape','TokenMonitor/C:/escape','TokenMonitor/ui/CON','TokenMonitor/ui/file.','TokenMonitor/ui/a\\b'])test(`unsafe ZIP path rejected: ${bad}`,async t=>{
 const f=await fixture(t);f.archiveFiles[bad]=Buffer.from('bad');f.repack();await assert.rejects(installUpdate(f.value,f.options),/Unsafe update archive path/);assert.deepEqual(f.calls.map(a=>a[0]),['list']);assert.deepEqual(await readdir(f.options.releasesRoot),[]);
});
test('package version mismatch and tampered inventory never invoke installer mutations',async t=>{
 const f=await fixture(t);f.release.version='9.0.0';f.archiveFiles['TokenMonitor/plugins/token-monitor-embedded/release.json']=Buffer.from(JSON.stringify(f.release));f.repack();
 await assert.rejects(installUpdate(f.value,f.options),/identity mismatch|version does not match/);assert.deepEqual(f.calls.map(a=>a[0]),['list']);
});
test('failed install restores prior registration and preserves extracted recovery files',async t=>{
 const f=await fixture(t);f.fail();await assert.rejects(installUpdate(f.value,f.options),/previous source restored/);assert.equal(f.active(),'/previous/release');assert.equal((await readdir(f.options.releasesRoot)).length,1);
});
test('background process failure is reported and concurrent panel starts are excluded',{skip:!detectedTarget()},async t=>{
 const f=await fixture(t),worker=path.join(f.root,'worker.mjs');await writeFile(worker,'setTimeout(()=>process.exit(1),200);');
 const updater=new AutoUpdater(path.join(f.root,'jobs'),worker),status={status:'available',installedVersion:'1.6.0',latestVersion:'1.7.0',target:detectedTarget(),downloadURL:f.value.downloadURL,checksumURL:f.value.checksumURL};
 const results=await Promise.allSettled([updater.start(status,'1.7.0'),updater.start(status,'1.7.0')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 for(let i=0;i<100;i++){if((await updater.status())?.phase==='failed')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal((await updater.status()).phase,'failed');assert.match((await updater.status()).error,/stopped unexpectedly/);
});
test('interrupted background work is visible and cannot be mistaken for an installed update',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'job.json'),JSON.stringify({...f.value,pid:2147483647}));assert.match((await new AutoUpdater(f.root).status()).error,/interrupted/);
});
test('failed downloads cancel unread response bodies before returning',async t=>{
 const f=await fixture(t);let cancelled=false;
 await assert.rejects(installUpdate(f.value,{...f.options,fetch:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:500})}),/Unable to download/);
 assert.equal(cancelled,true);assert.deepEqual(f.calls.map(a=>a[0]),['list']);assert.equal(f.active(),'/previous/release');
});
