import {Worker} from 'node:worker_threads';
import type {Efficiency} from './efficiency.js';
import type {HistoryFile} from './history-import.js';
/** One lazy worker per MCP server, shared by all its panels. No detached process. */
export class HistoryClient {
 private worker?:Worker;private retryAt=0;private serial=0;private closed=false;private scanPromise?:Promise<void>;private queued?:{files:HistoryFile[];complete:boolean};
 private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
 constructor(private home:string){}
 private request(method:string,args:unknown):Promise<any>{
  if(Date.now()<this.retryAt)return Promise.reject(Error('Historical storage is paused; retry later'));
  if(this.closed)return Promise.reject(Error('History client closed'));
  if(!this.worker){const worker=this.worker=new Worker(new URL('./history-worker.mjs',import.meta.url),{workerData:{home:this.home}});
   worker.on('message',r=>{const p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.value);});
   const failed=(e:Error)=>{if(this.worker!==worker)return;this.retryAt=Date.now()+5000;for(const p of this.pending.values())p.reject(e);this.pending.clear();if(this.worker===worker)this.worker=undefined;};
   worker.on('error',failed);worker.on('exit',code=>failed(Error(`History worker exited (${code})`)));worker.unref();
  }
  const id=++this.serial;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker!.postMessage({id,method,args});});
 }
 scan(_home:string,files:HistoryFile[],complete:boolean):Promise<void>{if(this.closed)return Promise.resolve();this.queued={files,complete};if(this.scanPromise)return this.scanPromise;this.scanPromise=(async()=>{try{while(this.queued&&!this.closed){const args=this.queued;this.queued=undefined;await this.request('scan',args);}}finally{this.scanPromise=undefined;}})();return this.scanPromise;}

 snapshot(id?:string):Promise<Efficiency>{return this.request('snapshot',{id});}
 diagnostics(){return this.request('diagnostics',{});}
 savedTasks(query='',includeArchived=false){return this.request('saved',{query,includeArchived});}
 close(){this.closed=true;for(const p of this.pending.values())p.reject(Error('History client closed'));this.pending.clear();void this.worker?.terminate();this.worker=undefined;}
}
