import {ActivityCollector} from './activity.js';
import {createHash} from 'node:crypto';
import {AttributionEstimator,BoundedSet,ThreadUsage,estimateCompactionValue,rollingContextGrowth,rollingTypicalOutput,bounded,cacheTemperature,cleanTitle,date,emptyAttribution,health,integer,nonnegative,price,type Attribution,type RecordValue,type Sample} from './metrics.js';
const object=(x:any):x is RecordValue=>x!=null&&typeof x==='object'&&!Array.isArray(x);
function canonical(x:any):string {if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(object(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
const fingerprint=(value:any)=>createHash('sha256').update(canonical(value)).digest('hex');
export class TelemetryParser {
  awaitingPostCompactionCall=false; compactedContext?:number; compactions:{timestamp:string;callPosition:number}[]=[];
  samples:Sample[]=[]; contextLimit?:number; fiveHour?:{used:number;reset?:string}; weekly?:{used:number;reset?:string};
  model?:string; effort?:string; title?:string; lastCallModel?:string; lastCallEffort?:string; lastEvent?:string; callCount=0;
  private activity=new ActivityCollector();
  private contextSegment=0; private forecastSamples:(Sample & {segment:number})[]=[];
  private reportedOutput?:number; private reportedReasoning?:number; private summedOutput=0; private summedReasoning=0; private outputComplete=true;private reasoningComplete=true;
  readonly attribution=new AttributionEstimator(); contextAttribution=emptyAttribution(); private pendingAttribution?:Attribution;
  readonly usage=new ThreadUsage(); private serviceTier?:string;private regionalProcessing?:boolean;
  private seenIdentities=new BoundedSet();private seenRecords=new BoundedSet();private seenCumulativeCalls=new BoundedSet();
  get outputTotals(){return this.reportedOutput!=null?{total:this.reportedOutput,reasoning:this.reportedReasoning,source:'reported-cumulative'}:{total:this.callCount>0&&this.outputComplete?this.summedOutput:undefined,reasoning:this.callCount>0&&this.reasoningComplete?this.summedReasoning:undefined,source:'recorded-calls'};}
  consume(line:string|Buffer|RecordValue) {
    let r:RecordValue;try{r=typeof line==='string'||Buffer.isBuffer(line)?JSON.parse(line.toString()):line;}catch{return;}
    if(!object(r)||!object(r.payload))return;const p=r.payload,type=r.type,time=date(r.timestamp);
    this.activity.consume(type,p);
    if(type==='compacted'&&time&&(!this.compactions.length||time>this.compactions.at(-1)!.timestamp)){this.contextSegment++;this.forecastSamples=[];this.awaitingPostCompactionCall=true;this.compactedContext=undefined;this.pendingAttribution=undefined;this.contextAttribution=emptyAttribution();}
    const response=['reasoning','function_call','custom_tool_call'].includes(p.type)||(p.type==='message'&&p.role==='assistant');
    if(type==='response_item'&&!this.pendingAttribution&&response)this.pendingAttribution=this.attribution.snapshot();
    this.attribution.consume(type,p);if(time)this.lastEvent=time;
    if(type==='compacted'&&time&&this.compactions.at(-1)?.timestamp!==time){this.compactions.push({timestamp:time,callPosition:this.callCount-.5});if(this.compactions.length>120)this.compactions.shift();}
    if(type==='turn_context'){
      const next=typeof p.model==='string'?p.model:this.model;if(next!==this.model){this.contextSegment++;this.contextLimit=undefined;this.serviceTier=undefined;this.regionalProcessing=undefined;}
      this.model=next;this.serviceTier=typeof p.service_tier==='string'?p.service_tier:undefined;this.regionalProcessing=typeof p.regional_processing==='boolean'?p.regional_processing:undefined;
      this.effort=typeof p.effort==='string'?p.effort:typeof p.reasoning_effort==='string'?p.reasoning_effort:this.effort;
    }
    if(type==='session_meta'&&typeof p.title==='string')this.title=p.title;
    if(type!=='event_msg')return;
    if(p.type==='user_message'&&!this.title)this.title=cleanTitle(p.message);
    if(p.type!=='token_count')return;
    if(object(p.rate_limits))for(const name of ['primary','secondary']){const a=p.rate_limits[name];if(object(a)&&typeof a.used_percent==='number'&&Number.isFinite(a.used_percent)){const value={used:a.used_percent,reset:typeof a.resets_at==='number'&&Number.isFinite(a.resets_at)&&Math.abs(a.resets_at)<8640000000000?new Date(a.resets_at*1000).toISOString():undefined};if(a.window_minutes===300)this.fiveHour=value;if(a.window_minutes===10080)this.weekly=value;}}
    const info=p.info;if(!object(info))return;
    if(typeof r.timestamp==='string'&&!this.seenRecords.add(fingerprint([r.timestamp,info])))return;
    if(integer(info.model_context_window)&&info.model_context_window>0)this.contextLimit=info.model_context_window;
    const cumulative=object(info.total_token_usage)?info.total_token_usage:undefined,u=object(info.last_token_usage)?info.last_token_usage:undefined;
    if(cumulative&&nonnegative(cumulative.input_tokens)&&nonnegative(cumulative.output_tokens)&&u&&integer(u.input_tokens)&&u.input_tokens>0&&nonnegative(u.cached_input_tokens)&&u.cached_input_tokens<=u.input_tokens&&!this.seenCumulativeCalls.add(fingerprint(cumulative)))return;
    let reportedThisRecord=false;
    if(cumulative&&nonnegative(cumulative.output_tokens)){reportedThisRecord=true;this.reportedOutput=cumulative.output_tokens;this.reportedReasoning=nonnegative(cumulative.reasoning_output_tokens)&&cumulative.reasoning_output_tokens<=cumulative.output_tokens?cumulative.reasoning_output_tokens:undefined;}
    if(!u&&cumulative){if(integer(cumulative.input_tokens))this.usage.cumulativeMismatch=cumulative.input_tokens!==this.usage.input;if(integer(cumulative.output_tokens)&&cumulative.output_tokens!==this.usage.output)this.usage.cumulativeMismatch=true;}
    if(!u)return;
    if(!integer(u.input_tokens)||!time){this.contextSegment++;return;}const input=u.input_tokens;
    if(this.awaitingPostCompactionCall&&input===0&&(u.cached_input_tokens??0)===0&&(u.output_tokens??0)===0&&integer(u.total_tokens)&&u.total_tokens>0&&this.compactions.at(-1)&&time>=this.compactions.at(-1)!.timestamp){this.compactedContext=u.total_tokens;this.contextAttribution=this.attribution.snapshot(u.total_tokens);return;}
    if(input<=0){this.contextSegment++;return;}const cached=integer(u.cached_input_tokens)?u.cached_input_tokens:0;if(cached<0||cached>input){this.contextSegment++;return;}
    const output=integer(u.output_tokens)?u.output_tokens:0,reasoning=integer(u.reasoning_output_tokens)?u.reasoning_output_tokens:0;
    const s:Sample={timestamp:time,input,cached,cacheWrite:integer(u.cache_write_input_tokens)?u.cache_write_input_tokens:0,output,reasoning,total:integer(u.total_tokens)?u.total_tokens:undefined,ordinal:integer(r.ordinal)?r.ordinal:undefined,
      outputRecorded:nonnegative(u.output_tokens),reasoningRecorded:nonnegative(u.reasoning_output_tokens)&&u.reasoning_output_tokens<=output,
      model:typeof info.model==='string'?info.model:this.model,serviceTier:typeof p.service_tier==='string'?p.service_tier:typeof info.service_tier==='string'?info.service_tier:this.serviceTier,regionalProcessing:this.regionalProcessing,
      cachedRecorded:u.cached_input_tokens!=null,cacheWriteRecorded:nonnegative(u.cache_write_input_tokens)&&u.cache_write_input_tokens<=input-cached};
    s.price=price(s);
    if(!this.seenIdentities.add(fingerprint([r.timestamp,s.input,s.cached,s.output,s.total??-1])))return;
    if(this.lastCallModel&&s.model!==this.lastCallModel&&!(integer(info.model_context_window)&&info.model_context_window>0))this.contextLimit=undefined;
    const activity=this.activity.take();if(activity)s.activity=activity;
    this.awaitingPostCompactionCall=false;this.compactedContext=undefined;this.contextAttribution=bounded(this.pendingAttribution??this.attribution.snapshot(),input);this.pendingAttribution=undefined;
    this.usage.add(s);if(cumulative){if(integer(cumulative.input_tokens))this.usage.cumulativeMismatch=cumulative.input_tokens!==this.usage.input;if(integer(cumulative.output_tokens)&&cumulative.output_tokens!==this.usage.output)this.usage.cumulativeMismatch=true;}
    this.lastCallModel=s.model;this.lastCallEffort=this.effort;this.callCount++;
    if(!reportedThisRecord&&this.reportedOutput!=null){this.reportedOutput=nonnegative(u.output_tokens)&&Number.isSafeInteger(this.reportedOutput+output)?this.reportedOutput+output:undefined;this.reportedReasoning=this.reportedReasoning!=null&&s.reasoningRecorded&&Number.isSafeInteger(this.reportedReasoning+reasoning)?this.reportedReasoning+reasoning:undefined;}
    if(s.outputRecorded&&Number.isSafeInteger(this.summedOutput+output))this.summedOutput+=output;else this.outputComplete=false;
    if(s.reasoningRecorded&&Number.isSafeInteger(this.summedReasoning+reasoning))this.summedReasoning+=reasoning;else this.reasoningComplete=false;
    this.forecastSamples.push({...s,segment:this.contextSegment});if(this.forecastSamples.length>120)this.forecastSamples.shift();
    this.samples.push(s);if(this.samples.length>120)this.samples.shift();
  }
  snapshot(task:{id:string;title:string;workspace?:string},session:RecordValue={},metadata:RecordValue={},available=true,now=Date.now()) {
    const last=this.samples.at(-1),input=this.awaitingPostCompactionCall?this.compactedContext:last?.input,cached=this.awaitingPostCompactionCall?undefined:last?.cached,fresh=cached!=null&&input!=null?input-cached:undefined;
    const contextPercent=input!=null&&this.contextLimit?input/this.contextLimit*100:undefined,started=date(session.updated_at),completed=this.compactions.at(-1)?.timestamp;
    const isCompacting=session.hook_event_name==='PreCompact'&&!!started&&!(completed&&completed>=started)&&!(last&&last.timestamp>started);
    const growth=rollingContextGrowth(this.forecastSamples),output=rollingTypicalOutput(this.samples,this.lastCallModel);
    const compactionValue=estimateCompactionValue({currentInput:isCompacting||this.awaitingPostCompactionCall?undefined:input,model:this.lastCallModel,
      serviceTier:last?.serviceTier,regionalProcessing:last?.regionalProcessing,growthPerCall:growth.effective,typicalOutput:output.effective,contextLimit:this.contextLimit});
    compactionValue.observedGrowthPerCall=growth.observed;
    compactionValue.assumptions.growth=growth;compactionValue.assumptions.output=output;
    if(isCompacting||this.awaitingPostCompactionCall)compactionValue.limitation='Waiting for a reliable post-compaction call';
    return {version:1,task,status:!available?'Transcript unavailable · showing last recorded call':isCompacting?'Compacting…':session.ended===true?'Session ended · last recorded call':'Monitoring selected task',available,
      model:this.lastCallModel??session.model??metadata.model,effort:this.lastCallEffort??metadata.effort,input,cached,fresh,contextLimit:this.contextLimit,contextPercent,callCount:this.callCount,samples:this.samples,
      compactions:this.compactions.filter(c=>c.callPosition>=this.callCount-this.samples.length),isCompacting,awaitingPostCompactionCall:this.awaitingPostCompactionCall,fiveHour:this.fiveHour,weekly:this.weekly,
      attribution:this.contextAttribution,usage:this.usage,outputTotals:this.outputTotals,lastEvent:this.lastEvent,lastCall:last?.timestamp,
      cacheTemperature:cacheTemperature(last?.timestamp,now),contextHealth:health(contextPercent,[40,50,65,75]),freshHealth:fresh!=null&&fresh>=2000&&input&&fresh<=input?health(fresh/input*100,[10,25,37.5,50]):0,compactionValue};
  }
}
