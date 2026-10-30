import {AccountLimits,CatalogueAllowances,chooseAllowances} from './allowances.js';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {acceptedTranscript,atomicJSON,codexHome,stateRoot,validID,withStateLock} from './platform.js';
import {cleanTitle,type RecordValue} from './metrics.js';
import {TelemetryParser} from './parser.js';
import {ThreadDiscovery} from './discovery.js';
import {JSONLTail} from './tail.js';
import {PersonalGrowthHistory} from './growth-history.js';
type Session={session_id:string;transcript_path:string;title?:string;cwd?:string;model?:string;turn_id?:string;hook_event_name?:string;ended?:boolean;updated_at?:string};
type Hook={sequence:string;session:Session};
type Entry={parser:TelemetryParser;tail:JSONLTail;path:string;session:Session;touched:number};
const events=new Set(['SessionStart','UserPromptSubmit','Stop','SessionEnd','PreCompact','PostCompact']);
export class TelemetryStore {
  private entries=new Map<string,Entry>();
  private growthHistory:PersonalGrowthHistory;
  readonly discovery:ThreadDiscovery;
  indexStatus="unavailable";
  private indexed=new Map<string,RecordValue>();
  constructor(readonly home=codexHome()){this.growthHistory=new PersonalGrowthHistory(home);this.discovery=new ThreadDiscovery(home);}
  private hookFile(id?:string){return id?path.join(stateRoot(this.home),'tasks',id+'.json'):path.join(stateRoot(this.home),'latest-hook.json');}
  hook(id?:string):Hook|undefined {if(id!=null&&!validID(id))return;try{
    const file=this.hookFile(id),s=lstatSync(file);if(!s.isFile()||s.size>=65536)return;
    const record=JSON.parse(readFileSync(file,'utf8'));
    if(typeof record.sequence==='string'&&record.sequence.length<=100&&record.session&&(!id||record.session.session_id===id)&&acceptedTranscript(record.session.transcript_path,record.session.session_id,this.home))return record;
  }catch{} }
  metadata(id?:string,includeArchived=false,unlimited=false):RecordValue[] {
    if(id!=null&&!validID(id))return [];
    this.indexStatus='unavailable';
    if(unlimited){this.discovery.status.missing=0;this.indexed.clear();}
    let files:string[];try{files=readdirSync(this.home).filter(f=>/^state_\d+\.sqlite$/.test(f)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}catch{return [];}
    for(const file of files){let db:DatabaseSync|undefined;try{
      db=new DatabaseSync(path.join(this.home,file),{readOnly:true,allowExtension:false});db.exec('PRAGMA busy_timeout=100');
      const columns=new Set((db.prepare('PRAGMA table_info(threads)').all() as RecordValue[]).map(c=>c.name));
      if(!['id','title','rollout_path'].every(c=>columns.has(c)))continue;
      const title=columns.has('name')?"COALESCE(NULLIF(name, ''), title)":'title';
      this.indexStatus='available';
      const optional=(name:string)=>columns.has(name)?name:'NULL';
      const where=id?'WHERE id = ?':!includeArchived&&columns.has('archived')?'WHERE archived = 0':'';
      const order=columns.has('updated_at')?'updated_at DESC, id':'id';
      const statement=db.prepare(`SELECT id, ${title} AS title, rollout_path, ${optional('cwd')} AS cwd, ${optional('model')} AS model, ${optional('reasoning_effort')} AS effort, ${optional('archived')} AS archived, ${optional('updated_at')} AS updated_at FROM threads ${where} ORDER BY ${order}`);
      const result:RecordValue[]=[];
      // Iterate without materializing an unbounded threads table.
      for(const row of statement.iterate(...(id?[id]:[])) as Iterable<RecordValue>){if(unlimited){this.indexed.set(row.id,row);if(typeof row.rollout_path==='string'&&!existsSync(row.rollout_path))this.discovery.status.missing++;}if(acceptedTranscript(row.rollout_path,row.id,this.home))result.push(row);if(!unlimited&&result.length>=100)break;}
      return result;
    }catch{}finally{db?.close();}}
    return [];
  }
  resolve(id:string):Session|undefined {
    if(!validID(id))return;const hook=this.hook(id);if(hook)return hook.session;
    const row=this.metadata(id)[0];if(row)return {session_id:row.id,transcript_path:row.rollout_path,cwd:row.cwd??undefined,title:cleanTitle(row.title)};
    const e=this.discovery.entries.get(id);if(e&&acceptedTranscript(e.file,id,this.home))return {session_id:id,transcript_path:e.file,cwd:e.cwd,title:e.title};
  }
  private task(session:Session,title?:string) {const workspace=typeof session.cwd==='string'&&session.cwd?path.basename(session.cwd):undefined;return {id:session.session_id,title:cleanTitle(title??session.title)??`${workspace??'Task'} · ${session.session_id.slice(-8)}`,workspace};}
  tasks(){const sessions:Session[]=this.metadata().map(row=>({session_id:row.id,transcript_path:row.rollout_path,cwd:row.cwd??undefined,title:row.title}));const latest=this.hook()?.session;if(latest&&!sessions.some(s=>s.session_id===latest.session_id))sessions.unshift(latest);return sessions.map(s=>this.task(s));}
  async catalogue(options:{hostId?:string;selectedId?:string;query?:string;includeArchived?:boolean;rescan?:boolean}={}){
    await this.discovery.start(options.rescan);
    const hook=this.hook();
    for(const id of new Set([options.hostId,hook?.session.session_id].filter((id):id is string=>!!id))){
      if(!this.resolve(id))void this.discovery.target(id).catch(()=>{});
      else if(hook?.session.session_id===id)await this.discovery.target(id,hook.session.transcript_path);
    }
    const rows=this.metadata(undefined,true,true),items=new Map<string,{id:string;title:string;workspace?:string;archived?:boolean;updated:number}>();
    for(const e of this.discovery.entries.values())if(acceptedTranscript(e.file,e.id,this.home))items.set(e.id,{...this.task({session_id:e.id,transcript_path:e.file,cwd:e.cwd,title:e.title}),archived:e.archived,updated:e.updated});
    for(const row of rows)items.set(row.id,{...this.task({session_id:row.id,transcript_path:row.rollout_path,cwd:row.cwd,title:row.title}),archived:!!row.archived,updated:Number(row.updated_at??0)*1000});
    if(hook){const e=items.get(hook.session.session_id);items.set(hook.session.session_id,{...this.task(hook.session,e?.title),archived:e?.archived??false,updated:Date.parse(hook.session.updated_at??'')||e?.updated||0});}
    for(const [id,row]of this.indexed){const e=items.get(id);if(e){e.archived=!!row.archived;e.title=cleanTitle(row.title)??e.title;}}
    const query=(options.query??'').trim().toLowerCase();
    const matches=[...items.values()].filter(t=>(options.includeArchived||!t.archived)&&(!query||[t.title,t.workspace,t.id].some(v=>v?.toLowerCase().includes(query)))).sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id));
    const tasks=matches.slice(0,100);
    for(const id of [options.selectedId,options.hostId]){const e=id?items.get(id):undefined;if(e&&!tasks.some(t=>t.id===id))tasks.push(e);}
    return {tasks:tasks.map(({updated,...task})=>task),matchCount:matches.length,shownCount:Math.min(matches.length,100),discovery:{...this.discovery.status,index:this.indexStatus,readable:items.size},hostMatched:!!options.hostId&&!!this.resolve(options.hostId),...(hook?{latestHook:{id:hook.session.session_id,sequence:hook.sequence,event:hook.session.hook_event_name??''}}:{})};
  }
  taskMetadata(id:string){const s=this.resolve(id);return s?this.task(s,s.title??this.metadata(id)[0]?.title):undefined;}
  async record(payload:unknown):Promise<boolean> {
    if(!payload||typeof payload!=='object')return false;const p=payload as RecordValue;
    if(!validID(p.session_id)||!events.has(p.hook_event_name)||p.agent_id)return false;
    const initial=p.transcript_path??this.hook(p.session_id)?.session.transcript_path??this.metadata(p.session_id)[0]?.rollout_path;
    if(!acceptedTranscript(initial,p.session_id,this.home))return false;
    return (await withStateLock(stateRoot(this.home),()=>{
      const prior=this.hook(p.session_id)?.session,candidate=p.transcript_path??prior?.transcript_path??this.metadata(p.session_id)[0]?.rollout_path;
      if(!acceptedTranscript(candidate,p.session_id,this.home))return false;
      const string=(value:any,fallback?:string)=>typeof value==='string'?value.slice(0,16384):fallback;
      const session:Session={session_id:p.session_id,transcript_path:candidate,cwd:string(p.cwd,prior?.cwd),model:string(p.model,prior?.model),title:cleanTitle(p.title)??prior?.title,turn_id:string(p.turn_id),hook_event_name:p.hook_event_name,ended:p.hook_event_name==='SessionEnd',updated_at:new Date().toISOString()};
      const hook={sequence:randomUUID(),session};if(Buffer.byteLength(JSON.stringify(hook))>=65536)return false;
      atomicJSON(this.hookFile(p.session_id),hook);atomicJSON(this.hookFile(),hook);return true;
    }))??false;
  }
  prune(now=Date.now()){for(const [id,e]of this.entries)if(now-e.touched>=60000)this.entries.delete(id);}
  get activeCollectorCount(){return this.entries.size;}
  snapshot(id:string,now=Date.now()) {
    this.prune(now);const session=this.resolve(id),source=session?.transcript_path??this.entries.get(id)?.path;if(!source)return;
    let entry=this.entries.get(id);if(!entry||entry.path!==source){if(this.entries.size>=64)this.entries.delete(this.entries.keys().next().value!);entry={parser:new TelemetryParser(),tail:new JSONLTail(),path:source,session:session!,touched:now};this.entries.set(id,entry);}
    if(session)entry.session=session;entry.touched=now;let available=!!session;
    try{if(session)entry.tail.read(source,()=>entry!.parser=new TelemetryParser(),line=>entry!.parser.consume(line));}catch{available=false;}
    const metadata=this.metadata(id)[0]??{},s=entry.session,p=entry.parser;
    const personal=this.growthHistory.read(()=>[{id,file:source},...this.metadata(undefined,true).filter(row=>row.id!==id).map(row=>({id:row.id,file:row.rollout_path}))],p.lastCallModel,p.growthIntervals,now);
    return p.snapshot(this.task(s,cleanTitle(s.title)??cleanTitle(metadata.title)??p.title),s,metadata,available,now,personal);
  }
  allowanceFiles(id:string){
    const sessions=[this.resolve(id),this.hook()?.session,...this.metadata().map(row=>({session_id:row.id,transcript_path:row.rollout_path}))];
    return sessions.flatMap(s=>s&&acceptedTranscript(s.transcript_path,s.session_id,this.home)?[s.transcript_path]:[]);
  }
  close(){this.entries.clear();this.discovery.close();this.growthHistory.close();}
}
// In-process replacement for the former subprocess bridge. The request shape
// stays stable so panel selection and revision handling do not change.
export class Collector {
  readonly store:TelemetryStore;private catalogue=new CatalogueAllowances();
  readonly account:AccountLimits;constructor(home=codexHome(),account?:AccountLimits){this.store=new TelemetryStore(home);this.account=account??new AccountLimits(home);}
  async request(method:'catalog'|'state',params:Record<string,unknown>={}):Promise<any> {
    if(method==='catalog')return this.store.catalogue(params as any);
    if(typeof params.taskId!=='string'||!validID(params.taskId))return {unavailable:true};
    this.account.touch();
    const local=this.catalogue.read(()=>this.store.allowanceFiles(params.taskId as string));
    const state=this.store.snapshot(params.taskId);if(!state)return {unavailable:true};
    const allowances=chooseAllowances(this.account.snapshot(),local);
    state.fiveHour=allowances.fiveHour;state.weekly=allowances.weekly;
    const revision=createHash('sha256').update(JSON.stringify(state)).digest('hex');return params.revision===revision?{revision,unchanged:true}:{revision,state};
  }
  close(){this.account.close();this.catalogue.close();this.store.close();}
}
