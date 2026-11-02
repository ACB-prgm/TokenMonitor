import {openSync,closeSync,fstatSync,readSync} from 'node:fs';
import {acceptedTranscript} from './platform.js';
import {TelemetryParser} from './parser.js';
import {COMPACTION_DEFAULTS as D,type GrowthInterval,type PersonalGrowth} from './metrics.js';

type Candidate={id:string;file:string};
/** Bounded, local-only usage history. Never retain transcript text or tool activity. */
export class PersonalGrowthHistory {
  private cache=new Map<string,{signature:string;intervals:GrowthInterval[]}>();
  private checked=-Infinity;
  private intervals:GrowthInterval[]=[];
  constructor(private home:string){}
  read(files:()=>Candidate[],model:string|undefined,current:readonly GrowthInterval[]=[],now=Date.now()):PersonalGrowth|undefined {
    if(!model)return;
    if(now-this.checked>=5000){
      this.checked=now;const keep=new Set<string>(),intervals:GrowthInterval[]=[];
      for(const candidate of files().slice(0,101)){
        const {id,file}=candidate;let fd:number|undefined;
        try{
          if(!acceptedTranscript(file,id,this.home))continue;
          keep.add(file);fd=openSync(file,'r');const stat=fstatSync(fd);
          if(!stat.isFile())continue;
          const signature=`${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
          let cached=this.cache.get(file);
          if(cached?.signature!==signature){
            // Read only a bounded suffix; an incomplete first/last line cannot make a call.
            const start=Math.max(0,stat.size-4*1024*1024),buffer=Buffer.alloc(stat.size-start);
            let count=0;while(count<buffer.length){const n=readSync(fd,buffer,count,buffer.length-count,start+count);if(!n)break;count+=n;}
            const bytes=buffer.subarray(0,count),parser=new TelemetryParser();
            let offset=start?bytes.indexOf(10)+1:0,end:number;
            if(!start||offset>0)while((end=bytes.indexOf(10,offset))>=0){
              try{
                const r=JSON.parse(bytes.subarray(offset,end).toString('utf8'));
                if(r.type==='turn_context'||r.type==='compacted'||r.type==='event_msg'&&r.payload?.type==='token_count')parser.consume(r);
              }catch{}
              offset=end+1;
            }
            cached={signature,intervals:parser.growthIntervals};this.cache.set(file,cached);
          }
          intervals.push(...cached.intervals);
        }catch{this.cache.delete(file);}finally{if(fd!==undefined)closeSync(fd);}
      }
      for(const file of this.cache.keys())if(!keep.has(file))this.cache.delete(file);
      this.intervals=intervals;
    }
    const unique=new Map<string,GrowthInterval>();
    for(const interval of [...this.intervals,...current])if(interval.model===model&&Date.parse(interval.timestamp)<=now)unique.set(interval.identity,interval);
    const recent=[...unique.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).slice(-D.PERSONAL_GROWTH_WINDOW);
    if(recent.length<D.MIN_PERSONAL_GROWTH_SAMPLES)return;
    return {observed:recent.reduce((sum,x)=>sum+x.value/recent.length,0),sampleCount:recent.length};
  }
  close(){this.cache.clear();this.intervals=[];this.checked=-Infinity;}
}
