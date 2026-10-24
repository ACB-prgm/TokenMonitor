import {readFile,lstat,realpath,open,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {codexCommand} from './install-platform.js';
import {atomicJSON,stateRoot} from './platform.js';
import {detectedTarget,parseVersion,type Target} from './updates.js';
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function verifyPackage(pluginRoot:string,target:Target|undefined=detectedTarget()) {
 const root=await realpath(pluginRoot),release=JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));
 if(!target||release.target!==target||!parseVersion(release.version)||!Array.isArray(release.files)||release.dirty!==false||!/^[0-9a-f]{40}$/.test(release.commit))throw Error('Invalid, dirty, or incompatible release package');
 const seen=new Set<string>();
 for(const entry of release.files) {
  if(typeof entry?.path!=='string'||!/^[0-9a-f]{64}$/.test(entry.sha256)||entry.path.includes('\\')||entry.path.startsWith('/')||entry.path.split('/').some((p:string)=>!p||p==='.'||p==='..'||p.includes(':'))||seen.has(entry.path))throw Error('Invalid package inventory');
  seen.add(entry.path);let current=root;
  for(const part of entry.path.split('/')){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('Package symlinks are not supported');}
  if(!(await lstat(current)).isFile()||digest(await readFile(current))!==entry.sha256)throw Error('Package checksum mismatch: '+entry.path);
 }
 const launcher=target.startsWith('windows')?'launch.ps1':'launch.sh';
 for(const name of ['.codex-plugin/plugin.json','.mcp.json','hooks/hooks.json','runtime/node.gz','runtime/node.sha256','server/dist/index.mjs','server/dist/install.mjs','ui/dist/panel.html',`scripts/${launcher}`])if(!seen.has(name))throw Error('Incomplete package: '+name);
 const manifest=JSON.parse(await readFile(path.join(root,'.codex-plugin/plugin.json'),'utf8'));
 if(manifest.name!=='token-monitor-embedded'||manifest.version!==release.version||manifest.hooks!=='./hooks/hooks.json'||manifest.mcpServers!=='./.mcp.json')throw Error('Plugin identity mismatch');
 const expected=(await readFile(path.join(root,'runtime/node.sha256'),'utf8')).trim();
 if(!/^[0-9a-f]{64}$/.test(expected)||digest(gunzipSync(await readFile(path.join(root,'runtime/node.gz')),{maxOutputLength:256*1024*1024}))!==expected)throw Error('Runtime checksum mismatch');
 const hooks=JSON.parse(await readFile(path.join(root,'hooks/hooks.json'),'utf8')).hooks;
 const events=['SessionStart','SessionEnd','UserPromptSubmit','Stop','PreCompact','PostCompact'];
 if(!hooks||Object.keys(hooks).length!==6||events.some(event=>!Array.isArray(hooks[event])||!hooks[event][0]?.hooks?.[0]?.command))throw Error('Incomplete lifecycle hooks');
 return release as {version:string;target:Target;commit:string};
}
/** Runs only in a separate user-invoked installer, never inside the MCP server. */
export async function installRelease(pluginRoot:string,options:{verifyOnly?:boolean;target?:Target;dataRoot?:string;run?:(args:string[])=>string}={}) {
 const release=await verifyPackage(pluginRoot,options.target??detectedTarget());
 const source=await realpath(path.resolve(pluginRoot,'../..'));
 if(path.relative(source,await realpath(pluginRoot)).split(path.sep).join('/')!=='plugins/token-monitor-embedded')throw Error('Use the complete token-monitor marketplace ZIP');
 const catalog=JSON.parse(await readFile(path.join(source,'.agents/plugins/marketplace.json'),'utf8'));
 if(catalog.name!=='tokenmonitor'||catalog.plugins?.length!==1||catalog.plugins[0].name!=='token-monitor-embedded'||catalog.plugins[0].policy?.installation!=='AVAILABLE'||catalog.plugins[0].source?.source!=='local'||catalog.plugins[0].source?.path!=='./plugins/token-monitor-embedded')throw Error('Invalid release marketplace');
 if(options.verifyOnly)return {version:release.version,source,verified:true};
 const run=options.run??(args=>{const cli=codexCommand();return execFileSync(cli.command,[...cli.prefix,'plugin',...args],{cwd:source,encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe'],windowsHide:true});});
 const data=options.dataRoot??stateRoot();await mkdir(data,{recursive:true,mode:0o700});
 const lock=path.join(data,'install.lock');
 let handle;
 try{handle=await open(lock,'wx',0o600);}catch(error){
  if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
  let owner:number;try{owner=Number(await readFile(lock,'utf8'));}catch{throw Error('Another installation is starting. Retry shortly.');}
  if(!Number.isInteger(owner)||owner<=0)throw Error('Invalid installation lock; inspect install.lock before retrying.');
  try{process.kill(owner,0);throw Error('Another TokenMonitor installation is running.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
  await rm(lock);handle=await open(lock,'wx',0o600);
 }
 await handle.writeFile(String(process.pid));
 const journal=path.join(data,'installation.json');let previous:string|undefined,changed=false;
 try{
  const listed=JSON.parse(run(['marketplace','list','--json']));
  if(!Array.isArray(listed.marketplaces))throw Error('Unsupported Codex marketplace response');
  const existing=listed.marketplaces.find((m:any)=>m.name==='tokenmonitor');
  if(existing){
   let origin=existing.marketplaceSource;
   // Codex's root-keyed marketplace listing can omit source metadata on Windows
   // when canonical and display paths differ. Its plugin listing keys by name.
   if(!origin){
    const plugins=JSON.parse(run(['list','--marketplace','tokenmonitor','--json','--available']));
    const entry=[...(plugins.installed??[]),...(plugins.available??[])].find((p:any)=>p.pluginId==='token-monitor-embedded@tokenmonitor');
    if(entry?.marketplaceSource?.sourceType==='local'&&await realpath(entry.marketplaceSource.source)===await realpath(existing.root))origin=entry.marketplaceSource;
   }
   if(origin?.sourceType!=='local')throw Error('Use the original Git marketplace update workflow or explicitly remove that source before switching to release packages.');
   previous=existing.root;
  }
  const activeSource=previous;
  // A retry after interruption retains the original rollback source.
  try{const prior=JSON.parse(await readFile(journal,'utf8'));if(prior.source===source&&prior.phase!=='installed'&&typeof prior.previous==='string')previous=prior.previous;}catch{}
  atomicJSON(journal,{phase:'prepared',source,previous,version:release.version});
  if(activeSource&&path.resolve(activeSource)!==source){run(['marketplace','remove','tokenmonitor']);changed=true;}
  if(!activeSource||path.resolve(activeSource)!==source){run(['marketplace','add',source]);changed=true;}
  atomicJSON(journal,{phase:'registered',source,previous,version:release.version});
  run(['add','token-monitor-embedded@tokenmonitor']);
  atomicJSON(journal,{phase:'installed',source,previous,version:release.version});
  return {version:release.version,source,verified:true};
 }catch(error){
  let recovered=false;
  if(changed&&previous){try{try{run(['marketplace','remove','tokenmonitor']);}catch{}run(['marketplace','add',previous]);run(['add','token-monitor-embedded@tokenmonitor']);recovered=true;}catch{/* Journal retains both paths for explicit recovery. */}}
  atomicJSON(journal,{phase:'failed',source,previous,recovered,version:release.version});
  const detail=error instanceof Error?error.message.slice(0,2000):'Codex installation command failed';
  throw Error(`${detail}\nInstallation failed${recovered?'; previous source restored':''}. Keep both extracted directories. Re-run the installer, or restore the previous source recorded in ${journal}.`,{cause:error});
 }finally{await handle.close();await rm(lock,{force:true});}
}
if(process.argv[1]&&path.basename(process.argv[1])==='install.mjs'&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{
  const root=fileURLToPath(new URL('../..',import.meta.url));
  const result=await installRelease(root,{verifyOnly:process.argv.includes('--verify-only')});
  console.log(`TokenMonitor ${result.version}: ${process.argv.includes('--verify-only')?'package verified':'installed through Codex'}.`);
  if(!process.argv.includes('--verify-only'))console.log('Restart Codex to load the new server. Review hook trust in Codex; this installer does not grant trust. Keep the extracted directory for updates and rollback.');
 }catch(error){console.error(error instanceof Error?error.message:'Installation failed');process.exitCode=1;}
}
