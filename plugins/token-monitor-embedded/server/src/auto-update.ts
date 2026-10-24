import {mkdir,readFile,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {atomicJSON,stateRoot,withStateLock} from './platform.js';
import {codexCommand} from './install-platform.js';
import {installRelease,verifyPackage} from './install.js';
import {compareVersions,detectedTarget,parseVersion,type UpdateStatus,type Target} from './updates.js';

export type Installation={phase:'downloading'|'verifying'|'extracting'|'installing'|'installed'|'failed';version:string;error?:string};
type Job=Installation&{id:string;pid:number;target:Target;downloadURL:string;checksumURL:string};
export const installationBusy=(value?:Installation)=>!!value&&!['installed','failed'].includes(value.phase);
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const jobFile=(root:string)=>path.join(root,'job.json');
const lockFile=(root:string)=>path.join(root,'update.lock');
async function job(root:string):Promise<Job|undefined>{try{const value=JSON.parse(await readFile(jobFile(root),'utf8'));return typeof value.id==='string'&&Number.isInteger(value.pid)&&parseVersion(value.version)&&['downloading','verifying','extracting','installing','installed','failed'].includes(value.phase)?value:undefined;}catch{return undefined;}}
const alive=(pid:number)=>{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){return (e as NodeJS.ErrnoException).code!=='ESRCH';}};

/** Runs in a separate bundled Node process so updates cannot block telemetry. */
export async function installUpdate(value:Job,options:{root:string;releasesRoot?:string;dataRoot?:string;fetch?:typeof fetch;run?:(args:string[])=>string;target?:Target;onPhase?:(phase:Installation['phase'])=>void}) {
 const {root}=options,fetcher=options.fetch??fetch;
 const phase=(next:Installation['phase'])=>{value.phase=next;atomicJSON(jobFile(root),value);options.onPhase?.(next);};
 const target=options.target??detectedTarget();
 if(value.target!==target)throw Error('The selected package does not match this computer. Choose Automatic and retry.');
 const version=parseVersion(value.version);if(!version||version.pre.length)throw Error('Invalid update version.');
 const name=`token-monitor-${value.version}-${target}.zip`;
 const base=`https://github.com/ACB-prgm/TokenMonitor/releases/download/v${value.version}/${name}`;
 if(value.downloadURL!==base||value.checksumURL!==base+'.sha256')throw Error('Invalid release download URLs. Check for updates and retry.');
 await mkdir(root,{recursive:true,mode:0o700});
 const cli=options.run?undefined:codexCommand();
 const run=options.run??(args=>execFileSync(cli!.command,[...cli!.prefix,'plugin',...args],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true}));
 // Account-installed plugins must use their host update mechanism. Never add a duplicate marketplace installation.
 const listed=JSON.parse(run(['list','--marketplace','tokenmonitor','--json','--available']));
 const installed=(listed.installed??[]).find((p:any)=>p.pluginId==='token-monitor-embedded@tokenmonitor');
 if(!installed||installed.marketplaceSource?.sourceType!=='local')throw Error('In-panel installation requires TokenMonitor installed from a local release marketplace. Update account or Git installations through their original plugin source.');
 async function download(url:string,limit:number){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
  try{
   for(let redirects=0;redirects<=5;redirects++){
    const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw Error('Untrusted download destination.');
    const response=await fetcher(url,{signal:controller.signal,redirect:'manual'});
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Invalid download redirect.');url=new URL(location,url).href;continue;}
    if(!response.ok||!response.body)throw Error('Unable to download the update. Retry shortly.');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Update download exceeds the size limit.');chunks.push(value);}}catch(error){await reader.cancel();throw error;}
    return Buffer.concat(chunks);
   }
   throw Error('Too many download redirects.');
  }finally{clearTimeout(timer);}
 }
 phase('downloading');
 const checksum=(await download(value.checksumURL,4096)).toString('utf8').trim();
 const match=/^([a-fA-F0-9]{64})[ \t]+\*?([^\r\n]+)$/.exec(checksum);
 if(!match||match[2]!==name)throw Error('Invalid update checksum file.');
 const archive=await download(value.downloadURL,128*1024*1024);
 phase('verifying');if(digest(archive)!==match[1].toLowerCase())throw Error('Update checksum mismatch. Nothing was installed.');
 const releases=options.releasesRoot??path.join(stateRoot(),'releases');await mkdir(releases,{recursive:true,mode:0o700});
 const staging=await mkdtemp(path.join(releases,value.version+'-'));let installing=false;
 try{
  phase('extracting');let total=0,count=0;const seen=new Set<string>();
  const files=unzipSync(archive,{filter:entry=>{
   const name=entry.name,parts=name.replace(/\/$/,'').split('/');
   if(++count>512||!name.startsWith('TokenMonitor/')||parts.some(p=>!p||p==='.'||p==='..'||!/^[A-Za-z0-9_.-]+$/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Unsafe update archive path.');
   const key=name.toLowerCase();if(seen.has(key))throw Error('Duplicate update archive path.');seen.add(key);
   total+=entry.originalSize;if(total>512*1024*1024||entry.originalSize>256*1024*1024)throw Error('Update archive exceeds the extraction limit.');
   return true;
  }});
  for(const [relative,bytes]of Object.entries(files)){const file=path.join(staging,relative);if(relative.endsWith('/')){await mkdir(file,{recursive:true,mode:0o700});continue;}await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file,bytes,{flag:'wx',mode:0o600});}
  const plugin=path.join(staging,'TokenMonitor/plugins/token-monitor-embedded');
  const release=await verifyPackage(plugin,target);if(release.version!==value.version)throw Error('Downloaded package version does not match the selected update.');
  phase('installing');installing=true;
  await installRelease(plugin,{target,run,dataRoot:options.dataRoot});
  phase('installed');
 }finally{if(!installing)await rm(staging,{recursive:true,force:true});}
}

export class AutoUpdater {
 constructor(readonly root=path.join(stateRoot(),'updates','installer'),readonly worker=fileURLToPath(new URL('./auto-update.mjs',import.meta.url))){}
 async status():Promise<Installation|undefined>{
  const value=await job(this.root);if(!value)return;
  if(installationBusy(value)&&!alive(value.pid)){value.phase='failed';value.error='The update was interrupted. Retry to continue.';}
  return {phase:value.phase,version:value.version,error:value.error};
 }
 async start(status:UpdateStatus,version:string){
  await this.status();
  if(status.status!=='available'||status.latestVersion!==version||!status.target||!status.downloadURL||!status.checksumURL||compareVersions(version,status.installedVersion)<=0)throw Error('Check for updates before installing this version.');
  if(status.target!==detectedTarget())throw Error('Choose the package for this computer before installing.');
  await mkdir(this.root,{recursive:true,mode:0o700});
  const started=await withStateLock(path.join(this.root,'start-lock'),()=>{
   try{const previous=JSON.parse(readFileSync(jobFile(this.root),'utf8'));if(previous.phase==='installed'&&previous.version===version)throw Error('This update is already installed. Restart Codex to finish.');}catch(error){if(error instanceof Error&&error.message.startsWith('This update'))throw error;}
   if(existsSync(lockFile(this.root))){const owner=Number(readFileSync(lockFile(this.root),'utf8'));if(!owner||alive(owner))throw Error('Another update is already running.');rmSync(lockFile(this.root));}
   const value:Job={id:randomUUID(),pid:process.pid,phase:'downloading',version,target:status.target!,downloadURL:status.downloadURL!,checksumURL:status.checksumURL!};
   writeFileSync(lockFile(this.root),String(process.pid),{flag:'wx',mode:0o600});atomicJSON(jobFile(this.root),value);
   try{
   const child=spawn(process.execPath,[this.worker,'--update',this.root,value.id],{stdio:'ignore',windowsHide:true});
   child.once('error',()=>{value.phase='failed';value.error='Unable to start the installer.';atomicJSON(jobFile(this.root),value);void rm(lockFile(this.root),{force:true});});
   child.once('exit',async()=>{const current=await job(this.root);if(current?.id===value.id&&installationBusy(current)){current.phase='failed';current.error='The installer stopped unexpectedly. Retry the update.';atomicJSON(jobFile(this.root),current);await rm(lockFile(this.root),{force:true});}});
   child.unref();
   }catch(error){rmSync(lockFile(this.root),{force:true});throw error;}
   return true;
  });
  if(!started)throw Error('Another update is starting. Retry shortly.');
  return this.status();
 }
}
if(process.argv[2]==='--update'&&process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.argv[3],value=await job(root);
 if(!value||value.id!==process.argv[4])throw Error('Update job changed.');
 value.pid=process.pid;atomicJSON(jobFile(root),value);await writeFile(lockFile(root),String(process.pid));
 try{await installUpdate(value,{root});}
 catch(error){value.phase='failed';value.error=error instanceof Error?error.message:'Unable to install update.';atomicJSON(jobFile(root),value);}
 finally{await rm(lockFile(root),{force:true});}
}
