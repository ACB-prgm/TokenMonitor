import {readFile,writeFile,mkdir,rename,rm,open,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {stateRoot} from './platform.js';
export const releasesURL='https://api.github.com/repos/ACB-prgm/TokenMonitor/releases/latest';
export const targets=['macos-arm64','macos-x64','windows-x64','windows-arm64'] as const;
export type Target=typeof targets[number];
const systems:Record<string,string>={darwin:'macos',win32:'windows'};
export function detectedTarget(platform:string=process.platform,arch:string=process.arch):Target|undefined {
 const target=`${systems[platform]}-${arch}`;return targets.includes(target as Target)?target as Target:undefined;
}
// SemVer 2.0, including arbitrary-precision numeric identifiers and ignored build metadata.
export function parseVersion(value:unknown) {
 if(typeof value!=='string'||value.length>200)return;
 const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
 return m?{core:m.slice(1,4).map(BigInt),pre:m[4]?.split('.')??[]}:undefined;
}
export function compareVersions(a:string,b:string):number {
 const x=parseVersion(a),y=parseVersion(b);if(!x||!y)throw Error('Invalid semantic version');
 for(let i=0;i<3;i++)if(x.core[i]!==y.core[i])return x.core[i]>y.core[i]?1:-1;
 if(!x.pre.length||!y.pre.length)return Number(!x.pre.length)-Number(!y.pre.length);
 for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++) {
  const p=x.pre[i],q=y.pre[i];if(p===q)continue;if(p===undefined||q===undefined)return p===undefined?-1:1;
  const pn=/^\d+$/.test(p),qn=/^\d+$/.test(q);
  if(pn&&qn)return BigInt(p)>BigInt(q)?1:-1;if(pn!==qn)return pn?-1:1;return p>q?1:-1;
 }return 0;
}
type Release={version:string;url:string;publishedAt:string;assets:{name:string;url:string}[]};
type Preferences={automatic:boolean;dismissedVersion?:string;target?:Target};
type Cache={release:Release;checkedAt:number;etag?:string};
export type UpdateStatus={installedVersion:string;status:'unknown'|'current'|'available'|'ahead';checking:boolean;
 automatic:boolean;dismissed:boolean;target?:Target;detectedTarget?:Target;latestVersion?:string;releaseURL?:string;
 publishedAt?:string;downloadURL?:string;checksumURL?:string;checkedAt?:number;stale:boolean;error?:string;retryAt?:number};
function safeURL(value:unknown,prefix:string):value is string {
 if(typeof value!=='string')return false;
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith(`/ACB-prgm/TokenMonitor/releases/${prefix}/`);}catch{return false;}
}
export function parseRelease(raw:any):Release {
 const version=typeof raw?.tag_name==='string'?raw.tag_name.replace(/^v/,''):'',parsed=parseVersion(version);
 if(!parsed||parsed.pre.length||raw.draft!==false||raw.prerelease!==false||!safeURL(raw.html_url,'tag')||typeof raw.published_at!=='string'||!Number.isFinite(Date.parse(raw.published_at))||!Array.isArray(raw.assets))throw Error('Invalid stable release metadata');
 const assets=raw.assets.filter((a:any)=>typeof a?.name==='string'&&safeURL(a.browser_download_url,'download')).map((a:any)=>({name:a.name,url:a.browser_download_url}));
 return {version,url:raw.html_url,publishedAt:raw.published_at,assets};
}
async function json(file:string):Promise<any>{try{return JSON.parse(await readFile(file,'utf8'));}catch{return undefined;}}
async function atomic(file:string,value:unknown){
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';
 try{await writeFile(temp,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});await rename(temp,file);}finally{await rm(temp,{force:true});}
}
export class Updates {
 private pending?:Promise<void>;private error?:string;private retryAt?:number;readonly root:string;
 constructor(readonly version:string,readonly options:{root?:string;fetch?:typeof fetch;now?:()=>number;target?:Target;timeoutMs?:number}={}){
  this.root=options.root??path.join(process.env.PLUGIN_DATA||stateRoot(),'updates');
 }
 private now(){return(this.options.now??Date.now)();}
 private file(name:string){return path.join(this.root,name+'.json');}
 private async preferences():Promise<Preferences>{const p=await json(this.file('preferences'));return {automatic:p?.automatic!==false,dismissedVersion:typeof p?.dismissedVersion==='string'?p.dismissedVersion:undefined,target:targets.includes(p?.target)?p.target:undefined};}
 private async cache():Promise<Cache|undefined>{
  const c=await json(this.file('cache'));try{const r=c?.release;if(!Number.isFinite(c?.checkedAt)||c.checkedAt>this.now()+60000||!r)return;
   const validated=parseRelease({tag_name:r.version,draft:false,prerelease:false,html_url:r.url,published_at:r.publishedAt,assets:r.assets.map((a:any)=>({name:a.name,browser_download_url:a.url}))});
   return {release:validated,checkedAt:c.checkedAt,etag:typeof c.etag==='string'?c.etag:undefined};
  }catch{return undefined;}
 }
 async status():Promise<UpdateStatus>{
  const [prefs,cache,backoff]=await Promise.all([this.preferences(),this.cache(),json(this.file('backoff'))]);
  const target=prefs.target??this.options.target??detectedTarget(),release=cache?.release;
  const retryAt=Math.max(this.retryAt??0,Number(backoff?.retryAt)||0)||undefined;
  const error=this.error??(retryAt&&retryAt>this.now()?'GitHub is temporarily unavailable; try again later.':undefined);
  let status:UpdateStatus['status']='unknown';
  if(release&&parseVersion(this.version)&&!error){const n=compareVersions(this.version,release.version);status=n<0?'available':n===0?'current':'ahead';}
  const name=`token-monitor-${release?.version}-${target}.zip`,downloads=release?.assets.filter(a=>a.name===name)??[],sums=release?.assets.filter(a=>a.name===name+'.sha256')??[];
  return {installedVersion:this.version,status,checking:!!this.pending,automatic:prefs.automatic,dismissed:!!release&&prefs.dismissedVersion===release.version,
   target,detectedTarget:this.options.target??detectedTarget(),latestVersion:release?.version,releaseURL:release?.url,publishedAt:release?.publishedAt,
   downloadURL:downloads.length===1&&sums.length===1?downloads[0].url:undefined,checksumURL:downloads.length===1&&sums.length===1?sums[0].url:undefined,
   checkedAt:cache?.checkedAt,stale:!cache||!!error||this.now()-cache.checkedAt>86400000,error,retryAt};
 }
 async configure(change:{automatic?:boolean;target?:Target|'auto';dismissVersion?:string}){
  const prefs=await this.preferences();if(change.automatic!==undefined)prefs.automatic=change.automatic;
  if(change.target!==undefined)prefs.target=change.target==='auto'?undefined:change.target;
  if(change.dismissVersion!==undefined){if((await this.cache())?.release.version!==change.dismissVersion)throw Error('Only the displayed release can be dismissed');prefs.dismissedVersion=change.dismissVersion;}
  await atomic(this.file('preferences'),prefs);return this.status();
 }
 async check(automatic=false):Promise<UpdateStatus>{
  const s=await this.status();if((automatic&&!s.automatic)||(s.retryAt&&s.retryAt>this.now()))return s;
  if(!this.pending)this.pending=this.run().catch(()=>{this.error='Unable to check for updates.';}).finally(()=>{this.pending=undefined;});
  return this.status();
 }
 /** Tests may await completion; panel handlers must never await network work. */
 async settled(){await this.pending;return this.status();}
 private async run(){
  await mkdir(this.root,{recursive:true,mode:0o700});const lock=path.join(this.root,'check.lock');
  // A short lease coordinates MCP processes without waiting on collector or hook locks.
  try{if(this.now()-(await stat(lock)).mtimeMs>30000)await rm(lock,{force:true});}catch{}
  let handle;try{handle=await open(lock,'wx',0o600);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return;throw e;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??5000);
  try{
   const cache=await this.cache(),headers:Record<string,string>={Accept:'application/vnd.github+json','User-Agent':'TokenMonitor-update-check','X-GitHub-Api-Version':'2022-11-28'};
   if(cache?.etag)headers['If-None-Match']=cache.etag;
   const response=await(this.options.fetch??fetch)(releasesURL,{headers,signal:controller.signal,redirect:'error'});
   if(response.status===304&&cache)await atomic(this.file('cache'),{...cache,checkedAt:this.now()});
   else{
    if(!response.ok){const after=response.headers.get('retry-after'),seconds=after===null?NaN:Number(after),reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
     this.retryAt=Math.min(this.now()+86400000,Math.max(this.now()+60000,Number.isFinite(seconds)?this.now()+seconds*1000:Date.parse(after??'')||0,reset||0));throw Error('GitHub unavailable');}
    const reader=response.body?.getReader();if(!reader)throw Error('Empty response');const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();throw Error('Response too large');}chunks.push(value);}
    const release=parseRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    await atomic(this.file('cache'),{release,checkedAt:this.now(),etag:response.headers.get('etag')??undefined});
   }
   this.error=undefined;this.retryAt=undefined;await rm(this.file('backoff'),{force:true});
  }catch{this.error='Unable to check for updates. Last known release retained.';this.retryAt??=this.now()+60000;await atomic(this.file('backoff'),{retryAt:this.retryAt});}
  finally{clearTimeout(timer);await handle.close();await rm(lock,{force:true});}
 }
}
