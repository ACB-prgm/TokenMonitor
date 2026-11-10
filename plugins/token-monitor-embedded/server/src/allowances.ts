import {openSync,closeSync,fstatSync,readSync} from 'node:fs';

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
    const selected=a&&!a.stale&&age>=0&&age<=60000?a:!a?b:!b?a:(a.observedAt??'')>=(b.observedAt??'')?a:b;
    if(selected)result[key]={...selected,stale:selected.source==='live'&&(!!selected.stale||age>60000),awaitingRefresh:!!selected.reset&&Date.parse(selected.reset)<=now};
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
