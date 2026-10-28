import {accessSync,constants,openSync,closeSync,fstatSync,readSync} from 'node:fs';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';

export type Allowance={used:number;reset?:string;observedAt?:string;source?:'live'|'catalogue';stale?:boolean;awaitingRefresh?:boolean};
export type Allowances={fiveHour?:Allowance;weekly?:Allowance};
const object=(v:any):v is Record<string,any>=>v!=null&&typeof v==='object'&&!Array.isArray(v);
const timestamp=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():undefined;
/** One validator for the two wire formats. Missing windows never become zero. */
export function normalizeAllowances(bucket:unknown,source:'live'|'catalogue',observedAt:string):Allowances {
  if(!object(bucket)||!timestamp(observedAt))return {};
  const limitId=source==='live'?bucket.limitId:bucket.limit_id;
  if(limitId!=null&&limitId!=='codex')return {};
  const result:Allowances={};
  for(const name of ['primary','secondary']){
    const window=bucket[name];if(!object(window))continue;
    const used=source==='live'?window.usedPercent:window.used_percent;
    const minutes=source==='live'?window.windowDurationMins:window.window_minutes;
    const reset=source==='live'?window.resetsAt:window.resets_at;
    if(typeof used!=='number'||!Number.isFinite(used)||used<0)continue;
    const value:Allowance={used,observedAt:timestamp(observedAt),source};
    if(typeof reset==='number'&&Number.isFinite(reset)&&Math.abs(reset)<8640000000000)value.reset=new Date(reset*1000).toISOString();
    if(minutes===300)result.fiveHour=value;if(minutes===10080)result.weekly=value;
  }
  return result;
}
export function liveAllowances(response:unknown,observedAt:string):Allowances {
  if(!object(response))return {};
  // A present multi-bucket map is authoritative; never substitute another bucket.
  const bucket=response.rateLimitsByLimitId!==undefined
    ?(object(response.rateLimitsByLimitId)?response.rateLimitsByLimitId.codex:undefined):response.rateLimits;
  if(object(bucket)&&bucket.limitId!=null&&bucket.limitId!=='codex')return {};
  return normalizeAllowances(bucket,'live',observedAt);
}
export function transcriptAllowances(record:unknown):Allowances {
  if(!object(record)||record.type!=='event_msg'||!object(record.payload)||record.payload.type!=='token_count')return {};
  return normalizeAllowances(record.payload.rate_limits,'catalogue',record.timestamp);
}
export function mergeNewest(target:Allowances,incoming:Allowances){
  for(const key of ['fiveHour','weekly'] as const){const v=incoming[key];if(v?.observedAt&&(!target[key]?.observedAt||v.observedAt>target[key]!.observedAt!))target[key]=v;}
  return target;
}
export function chooseAllowances(live:Allowances,local:Allowances,now=Date.now()):Allowances {
  const result:Allowances={};
  for(const key of ['fiveHour','weekly'] as const){
    const a=live[key],b=local[key],age=a?.observedAt?now-Date.parse(a.observedAt):Infinity;
    const selected=a&&age>=0&&age<=60000?a:!a?b:!b?a:(a.observedAt??'')>=(b.observedAt??'')?a:b;
    if(selected)result[key]={...selected,stale:selected.source==='live'&&age>60000,awaitingRefresh:!!selected.reset&&Date.parse(selected.reset)<=now};
  }
  return result;
}

/** Reads quota records only; never instantiates a usage/activity parser. */
export class CatalogueAllowances {
  private cache=new Map<string,{signature:string;value:Allowances}>();
  private checked=-Infinity;
  private latest:Allowances={};
  read(files:()=>string[],now=Date.now()):Allowances {
    if(now-this.checked<5000)return this.latest;this.checked=now;
    const latest:Allowances={},keep=new Set<string>();
    for(const file of [...new Set(files())].slice(0,102)){
      keep.add(file);let fd:number|undefined;
      try{
        fd=openSync(file,'r');const stat=fstatSync(fd);if(!stat.isFile())continue;
        const signature=`${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        let cached=this.cache.get(file);
        if(cached?.signature!==signature){
          const start=Math.max(0,stat.size-1024*1024),bytes=Buffer.alloc(stat.size-start);
          let count=0;while(count<bytes.length){const n=readSync(fd,bytes,count,bytes.length-count,start+count);if(!n)break;count+=n;}
          const block=bytes.subarray(0,count);let offset=start>0?block.indexOf(10)+1:0;const value:Allowances={};
          if(start===0||offset>0){let end:number;while((end=block.indexOf(10,offset))>=0){try{mergeNewest(value,transcriptAllowances(JSON.parse(block.subarray(offset,end).toString())));}catch{}offset=end+1;}}
          cached={signature,value};this.cache.set(file,cached);
        }
        mergeNewest(latest,cached.value);
      }catch{this.cache.delete(file);}finally{if(fd!==undefined)closeSync(fd);}
    }
    for(const file of this.cache.keys())if(!keep.has(file))this.cache.delete(file);
    return this.latest=latest;
  }
  close(){this.cache.clear();this.latest={};}
}

export function resolveCodex(env:NodeJS.ProcessEnv=process.env,platform=process.platform):string|undefined {
  const candidates:string[]=[];
  // A host may supply its CLI location even when the GUI has a minimal PATH.
  if(env.CODEX_CLI_PATH&&path.isAbsolute(env.CODEX_CLI_PATH))candidates.push(env.CODEX_CLI_PATH);
  for(const dir of (env.PATH??'').split(path.delimiter).filter(Boolean))candidates.push(path.join(dir,platform==='win32'?'codex.exe':'codex'));
  if(platform==='darwin')for(const base of ['/Applications',path.join(homedir(),'Applications')])for(const app of ['Codex','ChatGPT']){
    candidates.push(path.join(base,`${app}.app/Contents/Resources/codex`));
    candidates.push(path.join(base,`${app}.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`));
  }
  for(const file of candidates)try{accessSync(file,constants.X_OK);return file;}catch{}
}

type Pending={resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
export type AccountLimitOptions={spawn?:typeof spawn;resolve?:()=>string|undefined;now?:()=>number;timeout?:number};
/** A read-only account connection shared by all panels in this MCP process. */
export class AccountLimits {
  private child?:ChildProcessWithoutNullStreams;
  private pending=new Map<number,Pending>();
  private serial=0;private buffer='';private initialized=false;
  private running?:Promise<void>;private failures=0;private next=0;private touched=-Infinity;private closed=false;
  private poll?:ReturnType<typeof setTimeout>;private idle?:ReturnType<typeof setTimeout>;
  private values:Allowances={};
  constructor(private home:string,private options:AccountLimitOptions={}){}
  private now(){return this.options.now?.()??Date.now();}
  touch(){
    if(this.closed)return;this.touched=this.now();clearTimeout(this.idle);
    this.idle=setTimeout(()=>{clearTimeout(this.poll);this.disconnect();},60000);this.idle.unref();
    if(!this.running&&this.now()>=this.next)this.refresh();
  }
  snapshot(){return this.values;}
  private rpc(method:string,params?:unknown):Promise<any>{
    return new Promise((resolve,reject)=>{
      const id=++this.serial;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Account limit request timed out'));this.disconnect();},this.options.timeout??5000);
      this.pending.set(id,{resolve,reject,timer});
      try{this.child!.stdin.write(JSON.stringify({id,method,...(params!==undefined?{params}:{})})+'\n');}catch{clearTimeout(timer);this.pending.delete(id);reject(new Error('Account limit connection unavailable'));}
    });
  }
  private send(method:string){this.child!.stdin.write(JSON.stringify({method})+'\n');}
  private connect(){
    const command=this.options.resolve?.()??(this.options.resolve?undefined:resolveCodex());if(!command)throw new Error('Codex executable unavailable');
    const child=(this.options.spawn??spawn)(command,['app-server','--listen','stdio://'],{env:{...process.env,CODEX_HOME:this.home},stdio:'pipe',windowsHide:true}) as ChildProcessWithoutNullStreams;
    this.child=child;this.buffer='';this.initialized=false;
    child.stderr.on('data',()=>{}); // Do not retain auth or account diagnostics.
    child.stdout.setEncoding('utf8');child.stdout.on('data',(chunk:string)=>{
      if(this.child!==child)return;this.buffer+=chunk;if(Buffer.byteLength(this.buffer)>1024*1024){this.disconnect();return;}
      let end:number;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);
        try{
          const message=JSON.parse(line);
          if(message.method&&message.id!=null){child.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:'Unsupported account request'}})+'\n');continue;}
          const pending=this.pending.get(message.id);
          if(pending){clearTimeout(pending.timer);this.pending.delete(message.id);if(message.error)pending.reject(new Error('Account limit request failed'));else pending.resolve(message.result);}
          else if(this.initialized&&message.method==='account/rateLimits/updated'){
            // Notifications may describe another metered bucket. Retain Codex only.
            const values=liveAllowances(message.params,new Date(this.now()).toISOString());if(values.fiveHour||values.weekly)mergeNewest(this.values,values);
          }else if(message.method==='account/updated')this.values={};
        }catch{}
      }
    });
    const failed=()=>{if(this.child===child)this.disconnect();};child.on('error',failed);child.on('exit',failed);child.stdin.on('error',failed);
  }
  private refresh(){
    clearTimeout(this.poll);
    if(this.closed||this.now()-this.touched>=60000){this.disconnect();return;}
    this.running=Promise.resolve().then(async()=>{
      try{
        if(!this.child){this.connect();await this.rpc('initialize',{clientInfo:{name:'token_monitor_allowances',version:'1.0.0'},capabilities:{experimentalApi:false}});this.send('initialized');this.initialized=true;}
        const response=await this.rpc('account/rateLimits/read');
        if(this.closed)return;
        this.values=liveAllowances(response,new Date(this.now()).toISOString());this.failures=0;this.next=this.now()+30000;
      }catch{this.disconnect();this.failures++;this.next=this.now()+Math.min(300000,30000*2**Math.min(this.failures-1,4));}
      finally{
        this.running=undefined;
        if(!this.closed&&this.now()-this.touched<60000){this.poll=setTimeout(()=>this.refresh(),Math.max(1,this.next-this.now()));this.poll.unref();}
      }
    });
  }
  private disconnect(){
    const child=this.child;this.child=undefined;this.initialized=false;this.buffer='';
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('Account limit connection closed'));}this.pending.clear();
    if(child){child.stdin.destroy();child.kill();const kill=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},1000);kill.unref();}
  }
  close(){this.closed=true;clearTimeout(this.poll);clearTimeout(this.idle);this.disconnect();}
}
