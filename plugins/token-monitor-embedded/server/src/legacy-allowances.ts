// Cutover diagnostic only; not imported by the running plugin.
import {accessSync,constants} from 'node:fs';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {liveAllowances,mergeNewest,type Allowances} from './allowances.js';
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
        // Closing can happen before this queued refresh starts.
        if(this.closed||this.now()-this.touched>=60000)return;
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
