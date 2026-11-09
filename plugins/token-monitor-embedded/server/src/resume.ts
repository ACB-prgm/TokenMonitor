import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

/** Experimental DEV adapter to the app-supplied pipe. No socket discovery or credentials are stored. */
export class AppBridge {
  constructor(private pipe=process.env.CODEX_APP_TOOLS_PIPE_PATH,private callerHost=process.env.CODEX_APP_TOOLS_CALLER_HOST_ID){}
  get available(){return !!this.pipe;}
  private request(method:string,params:unknown):Promise<any>{
    if(!this.pipe)return Promise.reject(Error('The app did not supply its tools bridge to this DEV process.'));
    return new Promise((resolve,reject)=>{
      const socket=net.createConnection(this.pipe!);let buffer=Buffer.alloc(0),finished=false;
      const finish=(error?:Error,value?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(value);};
      const timer=setTimeout(()=>finish(Error('App bridge timed out; delivery may be unknown.')),15000);
      socket.on('error',()=>finish(Error('App bridge unavailable. Reconnect Token Monitor DEV or restart Codex to refresh the app connection.')));
      socket.on('close',()=>finish(Error('App bridge closed; delivery may be unknown.')));
      socket.on('connect',()=>{const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method,params})),header=Buffer.alloc(4);header.writeUInt32LE(body.length);socket.write(Buffer.concat([header,body]));});
      socket.on('data',chunk=>{
        buffer=Buffer.concat([buffer,chunk]);
        if(buffer.length>8*1024*1024+4)return finish(Error('App bridge response exceeded its limit.'));
        if(buffer.length<4)return;const length=buffer.readUInt32LE(0);
        if(length===0||length>8*1024*1024)return finish(Error('Invalid app bridge frame.'));
        if(buffer.length<length+4)return;
        try{const result=JSON.parse(buffer.subarray(4,length+4).toString());if(result.id!==1||result.jsonrpc!=='2.0')throw Error();if(result.error)return finish(Error('The app rejected the bridge request.'));finish(undefined,result.result);}catch{finish(Error('Invalid app bridge response.'));}
      });
    });
  }
  async call(tool:'get_usage_limits'|'read_thread'|'send_message_to_thread',args:Record<string,unknown>,sourceThreadId:string){
    const result=await this.request('tools/call',{namespace:'codex_app',tool,arguments:args,callerSource:'codex',hostId:this.callerHost,threadId:sourceThreadId,callId:`tm-dev-${randomUUID()}`,turnId:`tm-dev-${randomUUID()}`});
    if(result?.success!==true)throw Error('The app tool rejected the request. Check the target chat before retrying.');
    const text=result.contentItems?.filter((v:any)=>v.type==='inputText').map((v:any)=>v.text).join('\n');
    try{return JSON.parse(text);}catch{if(tool==='send_message_to_thread')return {acknowledgement:true};throw Error('The app returned an unsupported response shape.');}
  }
}
export type ResumeState={id:string;threadId:string;title:string;phase:'armed'|'sending'|'sent'|'cancelled'|'uncertain'|'expired';mode:'test'|'reset';waitingForLimit?:boolean;notBefore:number;expires:number;message:string;checkedAt?:number;accountId:string;hostId:string;turnId:string;sourceThreadId:string;pid:number};
export interface ResumeBridge{available:boolean;call(tool:'get_usage_limits'|'read_thread'|'send_message_to_thread',args:Record<string,unknown>,sourceThreadId:string):Promise<any>}
const windows=(usage:any)=>{
  const map=usage?.rateLimitsByLimitId;
  const buckets=map!==undefined?(map&&typeof map==='object'&&!Array.isArray(map)?Object.values(map):[]):[usage?.rateLimits];
  return buckets.flatMap((b:any)=>[b?.primary,b?.secondary]).filter(Boolean);
};
export function capacity(usage:any){
  const ws=windows(usage),known=ws.length>0&&ws.every((w:any)=>typeof w.usedPercent==='number'&&Number.isFinite(w.usedPercent)&&w.usedPercent>=0);
  return {ready:known&&usage?.ordinaryUsageAllowed===true&&ws.every((w:any)=>w.usedPercent<100),blocked:known?ws.filter((w:any)=>w.usedPercent>=100):[]};
}
function target(value:any,idle=true){
  const thread=value?.thread,turn=value?.turns?.[0];
  if(!thread?.id||!thread.hostId||!turn?.id||idle&&(!['completed','failed','interrupted'].includes(turn.status)||['active'].includes(thread.status?.type)&&thread.status?.activeFlags?.length))throw Error('Choose an idle chat with a completed, failed, or interrupted turn.');
  return {thread,turn};
}
/** Persisted claims prevent duplicate dispatch across panels and MCP processes. Pending work is never replayed after process exit. */
export class ResumeProbe {
  private db:DatabaseSync;private timer?:ReturnType<typeof setInterval>;private running=false;private stopped=false;
  constructor(root:string,private bridge:ResumeBridge=new AppBridge(),private now=()=>Date.now()){
    mkdirSync(root,{recursive:true});this.db=new DatabaseSync(path.join(root,'resume-probe.sqlite'));this.db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS resume_requests(id TEXT PRIMARY KEY,thread TEXT NOT NULL,phase TEXT NOT NULL,data TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS one_pending_resume ON resume_requests(thread) WHERE phase IN (\'armed\',\'sending\');');
  }
  private save(r:ResumeState,expected='armed'){this.db.prepare('UPDATE resume_requests SET phase=?,data=? WHERE id=? AND phase=?').run(r.phase,JSON.stringify(r),r.id,expected);}
  private current(id:string):ResumeState|undefined{const row=this.db.prepare('SELECT data FROM resume_requests WHERE id=?').get(id) as any;return row?JSON.parse(row.data):undefined;}
  status(threadId:string){
    const row=this.db.prepare('SELECT data FROM resume_requests WHERE thread=? ORDER BY rowid DESC LIMIT 1').get(threadId) as any;
    const r:ResumeState|undefined=row?JSON.parse(row.data):undefined;
    if(r&&['armed','sending'].includes(r.phase)){
      let alive=true;try{process.kill(r.pid,0);}catch(e:any){alive=e.code==='EPERM';}
      if(!alive){const previous=r.phase;r.phase=r.phase==='sending'?'uncertain':'cancelled';r.message='Previous DEV process exited. Check the chat, then explicitly re-arm.';this.save(r,previous);}
    }
    return {available:this.bridge.available,request:r};
  }
  async arm(threadId:string,sourceThreadId:string,mode:'test'|'reset'){
    if(this.stopped)throw Error('DEV probe is shutting down.');
    if(!this.bridge.available)throw Error('The app did not supply its tools bridge to DEV.');
    this.status(threadId);
    const info=target(await this.bridge.call('read_thread',{threadId,turnLimit:1,maxOutputCharsPerItem:1},sourceThreadId),mode==='test');
    if(info.thread.id!==threadId||info.thread.kind!=='codex')throw Error('Only the exact selected Codex chat can be armed.');
    const usage=await this.bridge.call('get_usage_limits',{},sourceThreadId);
    if(typeof usage.accountId!=='string'||!usage.accountId)throw Error('Account identity unavailable; probe not armed.');
    const now=this.now(),notBefore=mode==='test'?now+30000:now;
    const r:ResumeState={id:randomUUID(),threadId,title:String(info.thread.title??threadId),phase:'armed',mode,waitingForLimit:mode==='reset',notBefore,expires:Math.max(now+24*3600000,notBefore+3600000),message:mode==='test'?'Armed: one harmless test message after 30 seconds and a fresh capacity check.':'On for this chat: waiting for usage to run out and the chat to stop.',accountId:usage.accountId,hostId:info.thread.hostId,turnId:info.turn.id,sourceThreadId,pid:process.pid};
    if(this.stopped)throw Error('DEV probe is shutting down.');
    try{this.db.prepare('INSERT INTO resume_requests VALUES(?,?,?,?)').run(r.id,r.threadId,r.phase,JSON.stringify(r));}catch{throw Error('This chat already has a pending DEV probe. Cancel it before re-arming.');}
    if(!this.timer)this.timer=setInterval(()=>void this.tick().catch(()=>{/* A storage failure must not crash the MCP server or authorize a send. */}),15000);
    return this.status(threadId);
  }
  cancel(threadId:string){const r=this.status(threadId).request;if(r?.phase==='armed'){r.phase='cancelled';r.message='Cancelled. No continuation was submitted.';this.save(r);}return this.status(threadId);}
  async tick(){
    if(this.running||this.stopped)return;this.running=true;
    try{
      const rows=this.db.prepare("SELECT data FROM resume_requests WHERE phase='armed'").all() as any[];
      for(const row of rows){const r:ResumeState=JSON.parse(row.data);if(r.pid!==process.pid)continue;
        const valid=()=>!this.stopped&&this.current(r.id)?.phase==='armed';
        try{
          if(this.now()>=r.expires){r.phase='expired';r.message='Expired without dispatch.';if(valid())this.save(r);continue;}
          const info=target(await this.bridge.call('read_thread',{threadId:r.threadId,hostId:r.hostId,turnLimit:1,maxOutputCharsPerItem:1},r.sourceThreadId),false);
          if(!valid())continue;
          if(r.waitingForLimit){
            if(info.thread.id!==r.threadId||info.thread.hostId!==r.hostId)throw Error('Target chat identity changed.');
            const usage=await this.bridge.call('get_usage_limits',{},r.sourceThreadId);if(!valid())continue;
            if(usage.accountId!==r.accountId){r.phase='cancelled';r.message='Account changed; cancelled.';this.save(r);continue;}
            r.checkedAt=this.now();
            if(!capacity(usage).blocked.length){r.message='On for this chat: waiting for usage to run out and the chat to stop.';this.save(r);continue;}
            target({thread:info.thread,turns:[info.turn]});
            const resets=capacity(usage).blocked.map((w:any)=>w.resetsAt);
            if(resets.some((n:any)=>typeof n!=='number'||!Number.isFinite(n)))throw Error('Waiting for a known usage reset time.');
            r.turnId=info.turn.id;r.waitingForLimit=false;r.notBefore=Math.max(this.now(),...resets.map((n:number)=>n*1000+5000));
            r.expires=Math.max(r.expires,r.notBefore+3600000);r.message='On: chat stopped at exhausted usage; waiting for reset and fresh capacity.';this.save(r);continue;
          }
          if(info.thread.id!==r.threadId||info.thread.hostId!==r.hostId||info.turn.id!==r.turnId){r.phase='cancelled';r.message='Chat changed or was manually continued; cancelled.';this.save(r);continue;}
          target({thread:info.thread,turns:[info.turn]});r.checkedAt=this.now();
          if(this.now()<r.notBefore){this.save(r);continue;}
          const usage=await this.bridge.call('get_usage_limits',{},r.sourceThreadId);if(!valid())continue;
          if(usage.accountId!==r.accountId){r.phase='cancelled';r.message='Account changed; cancelled.';this.save(r);continue;}
          if(!capacity(usage).ready){r.message='Waiting: fresh usage does not confirm available capacity.';this.save(r);continue;}
          // Read once more after the account request to catch manual continuation during it.
          const fresh=target(await this.bridge.call('read_thread',{threadId:r.threadId,hostId:r.hostId,turnLimit:1,maxOutputCharsPerItem:1},r.sourceThreadId),false);if(!valid())continue;
          if(fresh.thread.id!==r.threadId||fresh.thread.hostId!==r.hostId||fresh.turn.id!==r.turnId){r.phase='cancelled';r.message='Chat changed before dispatch; cancelled.';this.save(r);continue;}
          target({thread:fresh.thread,turns:[fresh.turn]});r.phase='sending';r.message='Submitting one message. Delivery will not be retried automatically.';
          if(this.db.prepare("UPDATE resume_requests SET phase='sending',data=? WHERE id=? AND phase='armed'").run(JSON.stringify(r),r.id).changes!==1)continue;
          try{
            const prompt=r.mode==='test'?`Token Monitor DEV continuation test (${r.id}). Reply only: Token Monitor DEV continuation received. Do not perform other work.`:`Continue the task from where it stopped at the usage limit. This is the one-time continuation explicitly armed in Token Monitor DEV (${r.id}).`;
            await this.bridge.call('send_message_to_thread',{threadId:r.threadId,hostId:r.hostId,prompt},r.sourceThreadId);
            r.phase='sent';r.message='Message accepted by the app. Verify a new turn and response in the chat; goal resumption is unverified.';
          }catch{r.phase='uncertain';r.message='Dispatch failed or delivery is uncertain. Check the chat before re-arming; no automatic retry.';}
          this.save(r,'sending');
        }catch(error){if(valid()){r.message=error instanceof Error?error.message:'Probe check failed; no message submitted.';r.checkedAt=this.now();this.save(r);}}
      }
    }finally{this.running=false;if(this.stopped)this.db.close();else if(!this.db.prepare("SELECT 1 FROM resume_requests WHERE phase='armed' AND json_extract(data,'$.pid')=? LIMIT 1").get(process.pid)){clearInterval(this.timer);this.timer=undefined;}}
  }
  close(){if(this.stopped)return;this.stopped=true;clearInterval(this.timer);for(const row of this.db.prepare("SELECT data FROM resume_requests WHERE phase='armed'").all() as any[]){const r:ResumeState=JSON.parse(row.data);if(r.pid===process.pid){r.phase='cancelled';r.message='DEV process closed; explicitly re-arm after restarting.';this.save(r);}}if(!this.running)this.db.close(); /* In-flight dispatch saves its outcome before closing. */}
}
