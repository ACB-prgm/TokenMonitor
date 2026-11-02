import path from 'node:path';
import {readFileSync,lstatSync} from 'node:fs';
import {opendir,open,lstat,realpath} from 'node:fs/promises';
import {cleanTitle} from './metrics.js';
import {acceptedTranscript,atomicJSON,stateRoot,validID,contained,withStateLock,privateDirectory} from './platform.js';
export type Discovered={id:string;file:string;cwd?:string;title?:string;archived:boolean;updated:number;signature:string};
export class ThreadDiscovery {
  entries=new Map<string,Discovered>();
  status:{state:string;lastCompleted?:string;missing:number;unreadable:number;malformed:number;excluded:number}={state:'idle',missing:0,unreadable:0,malformed:0,excluded:0};
  private incomplete=false;
  get targeting(){return this.targeted.size>0;}
  private ready?:Promise<void>;private running?:Promise<void>;private closed=false;private complete=false;
  private targeted=new Map<string,Promise<void>>();private failed=new Map<string,number>();
  constructor(private home:string){}
  private get file(){return path.join(stateRoot(this.home),'discovery.json');}
  async start(rescan=false){
    this.ready??=this.load();await this.ready;
    if(rescan)this.failed.clear();
    if((rescan||!this.complete)&&!this.running&&!this.closed){
      this.status.state='scanning';this.running=this.scan().finally(()=>{this.running=undefined;});
    }
  }
  private async load(){try{if(!(await lstat(this.file)).isFile())return;const handle=await open(this.file,'r');let value:any;try{if((await handle.stat()).size>32*1024*1024)return;value=JSON.parse(await handle.readFile('utf8'));}finally{await handle.close();}
    if(value.version!==1||value.home!==this.home||!Array.isArray(value.entries))return;
    for(const e of value.entries)if(validID(e.id)&&typeof e.file==='string'&&typeof e.updated==='number'&&typeof e.signature==='string'&&typeof e.archived==='boolean'&&acceptedTranscript(e.file,e.id,this.home))this.entries.set(e.id,{...e,title:cleanTitle(e.title),cwd:typeof e.cwd==='string'?e.cwd:undefined});
    this.complete=value.complete===true;this.status.lastCompleted=value.lastCompleted;this.status.state=this.complete?(value.state==='partial'?'partial':'complete'):'idle';
  }catch{}}
  private async *files(directory:string,depth=0):AsyncGenerator<{file:string;archived:boolean}>{
    if(this.closed)return;
    let dir;try{if(!(await lstat(directory)).isDirectory()||!contained(await realpath(this.home),await realpath(directory))){this.status.excluded++;this.incomplete=true;return;}dir=await opendir(directory);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')this.status.unreadable++;return;}
    try{for await(const entry of dir){if(this.closed)return;const file=path.join(directory,entry.name);
      if(entry.isSymbolicLink()){this.status.excluded++;continue;}
      if(entry.isDirectory()){if(depth<8)yield* this.files(file,depth+1);else {this.status.excluded++;this.incomplete=true;}}
      else if(entry.isFile()&&entry.name.endsWith('.jsonl'))yield {file,archived:directory.startsWith(path.join(this.home,'archived_sessions'))};
    }}finally{await dir.close().catch(()=>{});}
  }
  private async inspect(file:string,archived:boolean){
    let handle;try{if(!(await lstat(file)).isFile()||!contained(await realpath(this.home),await realpath(file))){this.status.excluded++;return;}handle=await open(file,'r');const stat=await handle.stat(),buffer=Buffer.alloc(65536);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);const end=buffer.subarray(0,bytesRead).indexOf(10);
      if(end<0){this.status.malformed++;return;}const record=JSON.parse(buffer.subarray(0,end).toString()),p=record.payload;
      if(record.type!=='session_meta'||!validID(p?.id)){this.status.malformed++;return;}
      if(!acceptedTranscript(file,p.id,this.home)){this.status.excluded++;return;}
      return {id:p.id,file,cwd:typeof p.cwd==='string'?p.cwd:undefined,archived,updated:stat.mtimeMs,signature:`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`} as Discovered;
    }catch{this.status.unreadable++;}finally{await handle?.close();}
  }
  private add(e:Discovered){const old=this.entries.get(e.id);if(!old||!acceptedTranscript(old.file,old.id,this.home)||(!e.archived&&old.archived)||e.archived===old.archived&&(e.updated>old.updated||e.updated===old.updated&&e.file<old.file))this.entries.set(e.id,e);}
  private async scan(){
    this.status.malformed=this.status.unreadable=this.status.excluded=0;this.incomplete=false;
    try{let count=0;for(const root of ['sessions','archived_sessions'])for await(const candidate of this.files(path.join(this.home,root))){const e=await this.inspect(candidate.file,candidate.archived);if(e)this.add(e);if(++count%32===0){await this.save();await new Promise<void>(resolve=>setImmediate(resolve));}}
      if(this.closed)return;
      try{const handle=await open(path.join(this.home,'session_index.jsonl'),'r');try{if((await handle.stat()).size<=8*1024*1024){for(const line of (await handle.readFile('utf8')).split('\n')){try{const r=JSON.parse(line),e=this.entries.get(r.id);if(e)e.title=cleanTitle(r.thread_name);}catch{}}}}finally{await handle.close();}}catch{}
      this.complete=true;this.status.lastCompleted=new Date().toISOString();this.status.state=this.status.unreadable||this.status.malformed||this.incomplete?'partial':'complete';await this.save();
    }catch{this.status.state='partial';}
  }
  async target(id:string,file?:string){
    if(!validID(id)||this.closed)return;
    if(file&&this.entries.get(id)?.file===file&&acceptedTranscript(file,id,this.home))return;
    if(file&&acceptedTranscript(file,id,this.home)){const e=await this.inspect(file,false);if(e){this.entries.set(id,{...e,updated:Date.now()});await this.save();}return;}
    if(this.entries.has(id)&&acceptedTranscript(this.entries.get(id)!.file,id,this.home))return;
    if((this.failed.get(id)??0)>Date.now())return;
    if(this.targeted.has(id))return this.targeted.get(id);
    const work=(async()=>{for(const root of ['sessions','archived_sessions'])for await(const c of this.files(path.join(this.home,root))){if(!path.basename(c.file).endsWith(`-${id}.jsonl`))continue;const e=await this.inspect(c.file,c.archived);if(e?.id===id){this.add(e);await this.save();return;}}this.failed.set(id,Date.now()+30000);})();
    this.targeted.set(id,work);try{await work;}finally{this.targeted.delete(id);}
  }
  private async save(){
    if(this.closed)return;
    try{privateDirectory(stateRoot(this.home));await withStateLock(path.join(stateRoot(this.home),'discovery-lock'),()=>{
      let prior:any;try{if(!lstatSync(this.file).isFile()||lstatSync(this.file).size>32*1024*1024)throw Error('cache');const file=JSON.parse(readFileSync(this.file,'utf8'));if(file.version===1&&file.home===this.home)prior=file;}catch{}
      const merged=new Map<string,Discovered>();
      for(const e of prior?.entries??[])if(validID(e.id)&&acceptedTranscript(e.file,e.id,this.home))merged.set(e.id,e);
      for(const e of this.entries.values())if(acceptedTranscript(e.file,e.id,this.home))merged.set(e.id,e);
      atomicJSON(this.file,{version:1,home:this.home,complete:this.complete||prior?.complete===true,state:this.status.state,lastCompleted:this.status.lastCompleted??prior?.lastCompleted,entries:[...merged.values()]});
    });}catch{/* A cache failure must not discard in-memory discovery. */}
  }

  close(){this.closed=true;}
}
