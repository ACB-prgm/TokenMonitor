import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {AppBridge} from './app-bridge.js';
import {BridgeUsage} from './bridge-usage.js';
import {capacity} from './resume.js';
export type ContinuationView={available:boolean;threadId?:string;enabled:boolean;offer:boolean;message:string};
/** Preferences are standing authorization; claims are one attempt per interrupted turn. */
export class Continuation {
 private db:DatabaseSync;private timer:ReturnType<typeof setInterval>;private running=false;private stopped=false;
 constructor(root:string,private usage:BridgeUsage,private bridge:Pick<AppBridge,'call'|'available'>=new AppBridge(),private now=()=>Date.now(),private archived:(id:string)=>boolean=()=>false){
  mkdirSync(root,{recursive:true});this.db=new DatabaseSync(path.join(root,'continuation.sqlite'));this.db.exec(`PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS preferences(account TEXT,host TEXT,thread TEXT,source TEXT,enabled INTEGER NOT NULL,dismissed TEXT,message TEXT NOT NULL,PRIMARY KEY(account,host,thread));
 CREATE TABLE IF NOT EXISTS episodes(account TEXT,host TEXT,thread TEXT,turn TEXT,phase TEXT NOT NULL,notBefore REAL NOT NULL,PRIMARY KEY(account,host,thread,turn));`);
  // An interrupted dispatch is never retried, even if the app did not acknowledge it.
  this.timer=setInterval(()=>void this.tick(),15000);this.timer.unref();void this.tick();
 }
 private key(p:any){return [p.account,p.host,p.thread];}
 private message(p:any,message:string){this.db.prepare('UPDATE preferences SET message=? WHERE account=? AND host=? AND thread=?').run(message,...this.key(p));}
 async view(threadId:string,source:string,action:'status'|'enable'|'disable'|'dismiss'='status',selected=()=>true):Promise<ContinuationView>{
  this.usage.bind(source);
  try{
   const u=await this.usage.read();const info=await this.bridge.call('read_thread',{threadId,turnLimit:1,maxOutputCharsPerItem:1},source),t=info?.thread;
   if(t?.id!==threadId||t.kind!=='codex'||!t.hostId||t.archived||this.archived(threadId))throw Error('Choose an available local Codex chat.');
   const keys=[u.accountId,t.hostId,threadId],q=this.usage.snapshot().fiveHour;
   let p=this.db.prepare('SELECT * FROM preferences WHERE account=? AND host=? AND thread=?').get(...keys) as any;
   if(action!=='status'){
    if(!selected())throw Error('Selected chat changed; try again.');
    const enabled=action==='enable'?1:action==='disable'?0:p?.enabled??0;
    this.db.prepare(`INSERT INTO preferences VALUES(?,?,?,?,?,?,?) ON CONFLICT(account,host,thread) DO UPDATE SET source=excluded.source,enabled=excluded.enabled,dismissed=excluded.dismissed,message=excluded.message`).run(...keys,source,enabled,action==='dismiss'?q?.reset??null:p?.dismissed??null,enabled?'On: waiting for a confirmed usage-limit interruption.':'Off');
    if(action==='disable')this.db.prepare("UPDATE episodes SET phase='cancelled' WHERE account=? AND host=? AND thread=? AND phase='waiting'").run(...keys);
    p=this.db.prepare('SELECT * FROM preferences WHERE account=? AND host=? AND thread=?').get(...keys);
   }
   const fresh=this.now()-this.usage.observedAt<=30000;
   return {available:this.usage.available,threadId,enabled:!!p?.enabled,message:p?.message??'Off',offer:!p?.enabled&&fresh&&!!q&&q.used>=90&&!!q.reset&&Date.parse(q.reset)>this.now()&&p?.dismissed!==q.reset};
  }catch(error){
   const stored=this.db.prepare('SELECT * FROM preferences WHERE thread=? AND source=? AND enabled=1').all(threadId,source);
   if(action==='disable'&&selected()){this.db.prepare('UPDATE preferences SET enabled=0,message=? WHERE thread=? AND source=?').run('Off',threadId,source);return {available:false,threadId,enabled:false,offer:false,message:'Off'};}
   if(action!=='status')throw error;return {available:false,threadId,enabled:stored.length>0,offer:false,message:'App bridge unavailable; automatic continuation is paused.'};}
 }
 async tick(){
  if(this.running||this.stopped)return;this.running=true;
  try{
   let refreshed=false;
   const prefs=this.db.prepare('SELECT * FROM preferences WHERE enabled=1').all() as any[];
   for(const p of prefs){if(this.stopped)break;
    try{
     this.usage.bind(p.source);const u=await this.usage.read(!refreshed);refreshed=true;if(this.stopped)break;
     if(u.accountId!==p.account){this.message(p,'Paused: account changed.');continue;}
     const read=()=>this.bridge.call('read_thread',{threadId:p.thread,hostId:p.host,turnLimit:1,maxOutputCharsPerItem:1},p.source);
     const info=await read();if(this.stopped)break;
     const t=info?.thread,turn=info?.turns?.[0];
     if(t?.id!==p.thread||t.hostId!==p.host||t.kind!=='codex'||t.archived||this.archived(p.thread)) {this.message(p,'Paused: chat unavailable or archived.');continue;}
     this.db.prepare("UPDATE episodes SET phase='cancelled' WHERE account=? AND host=? AND thread=? AND turn<>? AND phase='waiting'").run(...this.key(p),turn?.id??'');
     if(turn?.status!=='failed'||turn.error?.codexErrorInfo!=='usageLimitExceeded'){
      this.message(p,turn?.status==='failed'&&!turn.error?.codexErrorInfo?'Cannot confirm the failure reason; no continuation will be sent.':'On: waiting for a confirmed usage-limit interruption.');continue;
     }
     if(t.status?.activeFlags?.length)continue;
     const keys=[...this.key(p),turn.id];const c=capacity(u);
     const resets=c.blocked.map((w:any)=>w.resetsAt);
     if(resets.some((v:any)=>typeof v!=='number'||!Number.isFinite(v))){this.message(p,'Waiting for a known reset time.');continue;}
     const deadline=Math.max(this.now(),...resets.map((v:number)=>v*1000+5000));
     this.db.prepare("INSERT OR IGNORE INTO episodes VALUES(?,?,?,?,'waiting',?)").run(...keys,deadline);
     const episode=this.db.prepare('SELECT * FROM episodes WHERE account=? AND host=? AND thread=? AND turn=?').get(...keys) as any;
     if(episode.phase!=='waiting'){this.message(p,episode.phase==='sent'?'Continuation sent; still enabled for future limits.':`Previous episode ${episode.phase}; it will not be replayed.`);continue;}
     if(!c.ready||this.now()<episode.notBefore){this.message(p,'Waiting for reset and fresh available capacity.');continue;}
     const fresh=await this.usage.read(true);if(this.stopped)break;
     if(fresh.accountId!==p.account||!capacity(fresh).ready||this.usage.observedAt<episode.notBefore)continue;
     const latest=await read();if(this.stopped)break;
     if(latest.thread?.id!==p.thread||latest.thread?.hostId!==p.host||latest.thread?.archived||this.archived(p.thread)||latest.turns?.[0]?.id!==turn.id||latest.turns[0].status!=='failed'||latest.turns[0].error?.codexErrorInfo!=='usageLimitExceeded'||latest.thread?.status?.activeFlags?.length)continue;
     const claimed=this.db.prepare(`UPDATE episodes SET phase='uncertain' WHERE account=? AND host=? AND thread=? AND turn=? AND phase='waiting' AND EXISTS(SELECT 1 FROM preferences p WHERE p.account=episodes.account AND p.host=episodes.host AND p.thread=episodes.thread AND p.enabled=1)`).run(...keys);
     if(claimed.changes!==1)continue;
     try{await this.bridge.call('send_message_to_thread',{threadId:p.thread,hostId:p.host,prompt:'Continue the task interrupted by the usage limit. Automatic continuation is enabled for this chat in Token Monitor.'},p.source);
      this.db.prepare("UPDATE episodes SET phase='sent' WHERE account=? AND host=? AND thread=? AND turn=?").run(...keys);this.message(p,'Continuation sent; still enabled for future limits.');
     }catch{this.message(p,'Delivery uncertain. Check this chat; this turn will not be retried.');}
    }catch{if(!this.stopped)this.message(p,'App check failed; continuation paused and will check again.');}
   }
  }finally{this.running=false;if(this.stopped)this.db.close();}
 }
 close(){if(this.stopped)return;this.stopped=true;clearInterval(this.timer);if(!this.running)this.db.close();}
}
