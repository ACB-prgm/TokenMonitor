import {COMPACTION_DEFAULTS as D,price,rates,type Sample} from './metrics.js';
export type CompactionUsage=Omit<Sample,'activity'|'price'>;
export type CompactionDetail={timestamp:string;callPosition:number;usage?:CompactionUsage;source:'recorded'|'estimated';reason?:string;requestCost?:number;replacementTokens:number;replacementWrite?:number;writeCredit:number;totalCost?:number;assumedMetadata:boolean};
const object=(x:any)=>x!=null&&typeof x==='object'&&!Array.isArray(x);
const count=(x:any)=>Number.isSafeInteger(x)&&x>=0;
/** Only the request whose identity matches the compaction is attributable to it. */
export function recordedCompaction(payload:any,timestamp:string,metadata:Partial<CompactionUsage>):{usage?:CompactionUsage;reason?:string}{
 const record=payload.latest_token_usage_record,id=payload.compaction_response_id;
 if(typeof id!=='string'||!id||!object(record)||record.response_id!==id)return {reason:'No matching compaction response ID'};
 const u=record.usage;
 if(!object(u)||!['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens'].every(k=>count(u[k]))||u.cached_input_tokens+u.cache_write_input_tokens>u.input_tokens||u.reasoning_output_tokens!=null&&(!count(u.reasoning_output_tokens)||u.reasoning_output_tokens>u.output_tokens))return {reason:'Missing or invalid compaction token accounting'};
 return {usage:{...metadata,timestamp,input:u.input_tokens,cached:u.cached_input_tokens,cacheWrite:u.cache_write_input_tokens,output:u.output_tokens,reasoning:u.reasoning_output_tokens??0,total:u.input_tokens+u.output_tokens,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:count(u.reasoning_output_tokens)}};
}
export function compactionDetail(timestamp:string,callPosition:number,before?:CompactionUsage,recorded?:CompactionUsage,reason?:string):CompactionDetail{
 const usage=recorded??(before?{...before,timestamp,cached:before.input,cacheWrite:0,output:D.COMPACTION_OUTPUT_TOKENS,reasoning:0,total:before.input+D.COMPACTION_OUTPUT_TOKENS,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:false}:undefined);
 const detail:CompactionDetail={timestamp,callPosition,usage,source:recorded?'recorded':'estimated',reason:recorded?undefined:reason??'No matching compaction response ID',requestCost:usage?price(usage).total:undefined,replacementTokens:D.POST_COMPACTION_TOKENS,writeCredit:0,assumedMetadata:true};
 updateReplacement(detail,D.POST_COMPACTION_TOKENS);return detail;
}
export function updateReplacement(detail:CompactionDetail,tokens:number){
 detail.replacementTokens=tokens;const u=detail.usage,r=u?rates(u.model,u.serviceTier,tokens,u.regionalProcessing):undefined;
 detail.replacementWrite=r?.write==null?undefined:tokens*r.write/1e6;updateTotal(detail);
}
export function updateTotal(detail:CompactionDetail){detail.totalCost=detail.requestCost==null||detail.replacementWrite==null?undefined:detail.requestCost+detail.replacementWrite-detail.writeCredit;}
export function compactionLabel(c:CompactionDetail){return c.source==='estimated'?'Estimated':c.replacementWrite!=null&&c.replacementWrite>c.writeCredit?'Partly estimated':'Recorded usage';}
