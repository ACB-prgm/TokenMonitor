import {createHash} from 'node:crypto';
import {lstatSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {atomicJSON,stateRoot,withStateLock} from './platform.js';
import {bundledCatalog,bundledPricing,catalogPricing,parseCatalog,type Catalog,type Pricing} from './pricing.js';

const url='https://raw.githubusercontent.com/ACB-prgm/TokenMonitor/main/pricing.json';
const limit=256*1024;
const cooldown=5*60*1000;
const lockRoot=(home:string)=>path.join(stateRoot(home),'pricing');
const cachePath=(home:string)=>path.join(lockRoot(home),'catalog.json');

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,val])=>[key,canonical(val)]));
 return value;
}
function basis(c:Catalog){
 const models=Object.fromEntries(Object.entries(c.models).map(([id,schedules])=>[id,schedules.map(({dateBasis:_,dateSource:__,effectiveFrom,...rules})=>({...rules,effectiveFrom:Date.parse(effectiveFrom)}))]));
 return JSON.stringify({version:7,table:createHash('sha256').update(JSON.stringify(canonical({models,aliases:c.aliases}))).digest('hex')});
}
export type PricingSnapshot={pricing:Pricing;basis:string;origin:'bundled'|'cached'};
export const bundledSnapshot:PricingSnapshot={pricing:bundledPricing,basis:basis(bundledCatalog),origin:'bundled'};
type Cached=PricingSnapshot&{etag?:string;stamp:string};
function etag(value:unknown){return typeof value==='string'&&/^(W\/)?"[\x21\x23-\x7e]{0,250}"$/.test(value)?value:undefined;}

export class PricingCache {
 private seen?:string;
 private disk?:Cached;
 private attempted=-Infinity;
 private pending?:Promise<void>;
 private stop=new AbortController();
 constructor(private home:string,private request:typeof fetch=fetch,private clock=Date.now){}
 private read(){
  try{
   const stat=lstatSync(cachePath(this.home));
   if(!stat.isFile()||stat.size>2*limit)return;
   const stamp=JSON.stringify([stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs]);
   if(stamp!==this.seen){
    this.seen=stamp;this.disk=undefined;
    const data=JSON.parse(readFileSync(cachePath(this.home),'utf8'));
    const catalog=parseCatalog(data.catalog);
    this.disk={pricing:catalogPricing(catalog),basis:basis(catalog),origin:'cached',etag:etag(data.etag),stamp};
   }
   return this.disk;
  }catch{return;}
 }
 snapshot():PricingSnapshot{return this.read()??bundledSnapshot;}
 refresh():Promise<void>{
  if(this.pending)return this.pending;
  if(this.stop.signal.aborted)return Promise.resolve();
  if(this.clock()-this.attempted<cooldown)return Promise.resolve();
  this.attempted=this.clock();
  this.pending=this.download().catch(()=>{}).finally(()=>{this.pending=undefined;});
  return this.pending;
 }
 close(){this.stop.abort();}
 private async download(){
  const claimed=await withStateLock(lockRoot(this.home),()=>{
   const file=path.join(lockRoot(this.home),'last-attempt.json'),now=this.clock();
   try{
    const last=lstatSync(file);
    if(last.isFile()&&last.size<=128){
     const at=JSON.parse(readFileSync(file,'utf8')).at;
     if(Number.isFinite(at)&&at<=now&&now-at<cooldown){this.attempted=at;return false;}
    }
   }catch{}
   atomicJSON(file,{at:now});
   return true;
  });
  if(!claimed||this.stop.signal.aborted)return;
  const cached=this.read();
  const response=await this.request(url,{redirect:'error',signal:AbortSignal.any([this.stop.signal,AbortSignal.timeout(5000)]),headers:cached?.etag?{'If-None-Match':cached.etag}:{}});
  if(response.status===304)return;
  if(response.status!==200||!response.body||Number(response.headers.get('content-length'))>limit){
   await response.body?.cancel();return;
  }
  const chunks:Uint8Array[]=[];let size=0;
  const reader=response.body.getReader();
  try{
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.length;
    if(size>limit){await reader.cancel();return;}
    chunks.push(value);
   }
  }finally{reader.releaseLock();}
  const catalog=parseCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  await withStateLock(lockRoot(this.home),()=>{
   if(this.read()?.stamp!==cached?.stamp)return;
   atomicJSON(cachePath(this.home),{catalog,etag:etag(response.headers.get('etag'))});
  });
 }
 // The cache publish and bounded history writes share a lock across MCP, worker and hooks.
 async write<T>(snapshot:PricingSnapshot,work:()=>T){
  return withStateLock(lockRoot(this.home),()=>this.snapshot().basis===snapshot.basis?work():undefined);
 }
}
