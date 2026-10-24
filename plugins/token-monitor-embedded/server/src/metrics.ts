// Bounded visible activity is separate from numeric telemetry.
import type {CallActivity} from './activity.js';
export type RecordValue = Record<string, any>;
export type Rates = {input: number; cached: number; write?: number; output: number};
export type Sample = {activity?: CallActivity; timestamp: string; input: number; cached: number; cacheWrite: number; output: number; reasoning: number; total?: number; ordinal?: number; outputRecorded: boolean; reasoningRecorded: boolean; model?: string; serviceTier?: string; regionalProcessing?: boolean; cachedRecorded: boolean; cacheWriteRecorded: boolean; price?: ReturnType<typeof price>};
const standard: Record<string, number[]> = {
  'gpt-6.1-sol':[2,.1,2.5,10], 'gpt-6-astra':[10,1,12.5,50], 'gpt-6-sol':[2,.2,2.5,10], 'gpt-6-luna':[.1,.01,.125,.5],
  'gpt-5.6-sol':[4,.4,5,20], 'gpt-5.6-terra':[2,.2,2.5,12], 'gpt-5.6-luna':[.2,.02,.25,1.2],
  'gpt-5.5':[5,.5,NaN,30], 'gpt-5.4':[2.5,.25,NaN,15], 'gpt-5.4-mini':[.75,.075,NaN,4.5], 'gpt-5.4-nano':[.2,.02,NaN,1.25],
  'gpt-5.3-codex':[1.75,.175,NaN,14], 'gpt-5.2':[1.75,.175,NaN,14], 'gpt-5.1':[1.25,.125,NaN,10], 'gpt-5':[1.25,.125,NaN,10],
};
export const pricingMetadata = {source:'https://developers.openai.com/api/docs/pricing', verifiedAt:'2026-10-19', configurationEffectiveDate:'2026-10-19'};
export const integer = (n: unknown): n is number => Number.isSafeInteger(n);
export const nonnegative = (n: unknown): n is number => integer(n) && n >= 0;
export function rates(model: string | undefined, tier: string | undefined, input: number, regional = false): Rates | undefined {
  if (!model || !Object.hasOwn(standard, model)) return;
  let [i,c,w,o] = standard[model];
  const modern = model.startsWith('gpt-6') || model.startsWith('gpt-5.6-');
  let multiplier = 1;
  tier ??= 'default';
  if (['default','standard','auto'].includes(tier)) {} else if (['priority','fast'].includes(tier)) {
    if (model === 'gpt-5.5') multiplier = 2.5;
    else if (modern || ['gpt-5.4','gpt-5.4-mini','gpt-5.3-codex','gpt-5.2','gpt-5.1','gpt-5'].includes(model)) multiplier = 2;
    else return;
  } else if (['flex','batch'].includes(tier)) { if (!modern && model.startsWith('gpt-5.3')) return; multiplier = .5; }
  else if (tier === 'ultrafast' && ['gpt-6.1-sol','gpt-6-astra'].includes(model)) multiplier = 6;
  else return;
  if (input > 272000 && (modern || ['gpt-5.5','gpt-5.4'].includes(model))) {
    if (!modern && ['priority','fast'].includes(tier)) return;
    i *= 2; c *= 2; w *= 2; o *= 1.5;
  }
  if (regional) { if (!modern && !['gpt-5.5','gpt-5.4','gpt-5.4-mini','gpt-5.4-nano'].includes(model)) return; multiplier *= 1.1; }
  return {input:i*multiplier,cached:c*multiplier,...(Number.isFinite(w)?{write:w*multiplier}:{}),output:o*multiplier};
}
export function price(s: Omit<Sample,'price'>): {total?: number; categories?: number[]; cacheSavings?: number; assumedTier: boolean; rates?: Rates; issue?: string} {
  const assumedTier = s.serviceTier == null || s.serviceTier === 'auto';
  const r = rates(s.model,s.serviceTier,s.input,s.regionalProcessing);
  if (!r) return {assumedTier,issue:'No verified rate for model/tier'};
  if (!(s.input >= 0 && s.cached >= 0 && s.cached <= s.input && s.cachedRecorded !== false && s.cacheWriteRecorded !== false && s.cacheWrite >= 0 && s.cacheWrite <= s.input-s.cached && s.outputRecorded !== false && s.output >= 0 && (s.cacheWrite === 0 || r.write != null))) return {assumedTier,rates:r,issue:'Missing or invalid input/output/cache accounting'};
  const ordinary=(s.input-s.cached-s.cacheWrite)*r.input/1e6, read=s.cached*r.cached/1e6, write=s.cacheWrite*(r.write??0)/1e6, output=s.output*r.output/1e6;
  const reasoning=s.reasoningRecorded !== false && s.reasoning>=0 && s.reasoning<=s.output ? s.reasoning*r.output/1e6 : undefined;
  return {total:ordinary+read+write+output,categories:[ordinary,read,write,reasoning??0,reasoning==null?0:output-reasoning,reasoning==null?output:0],cacheSavings:s.input*r.input/1e6-ordinary-read-write,assumedTier,rates:r};
}
export class ThreadUsage {
  input=0; cached=0; cacheWrite=0; output=0; reasoning=0;
  inputComplete=true; outputComplete=true; reasoningComplete=true; cacheComplete=true;
  pricedCalls=0; unpricedCalls=0; assumedTierCalls=0; cost=0; cacheSavings=0;
  costCategories=Array<number>(6).fill(0); models: string[]=[]; issues: string[]=[];
  source=pricingMetadata.source; verifiedAt=pricingMetadata.verifiedAt; configurationEffectiveDate=pricingMetadata.configurationEffectiveDate;
  coverage='Recorded unique calls; historical completeness cannot be guaranteed'; cumulativeMismatch=false;
  add(s: Sample) {
    for (const [key,value] of [['input',s.input],['cached',s.cached],['cacheWrite',Math.max(0,s.cacheWrite)]] as const) { const next=this[key]+value; if (Number.isSafeInteger(next)) this[key]=next; else this.inputComplete=false; }
    if (s.outputRecorded && Number.isSafeInteger(this.output+s.output)) this.output+=s.output; else this.outputComplete=false;
    if (s.reasoningRecorded && Number.isSafeInteger(this.reasoning+s.reasoning)) this.reasoning+=s.reasoning; else this.reasoningComplete=false;
    this.cacheComplete &&= s.cachedRecorded && s.cacheWriteRecorded && s.cacheWrite>=0 && s.cacheWrite<=s.input-s.cached;
    const model=s.model??'Unknown model'; if(!this.models.includes(model)&&this.models.length<128) this.models.push(model);
    const p=s.price??price(s); if(p.assumedTier) this.assumedTierCalls++;
    if(p.total!=null) {this.pricedCalls++;this.cost+=p.total;this.cacheSavings+=p.cacheSavings??0;p.categories?.forEach((v,i)=>this.costCategories[i]+=v);}
    else {this.unpricedCalls++;const issue=`${model}: ${p.issue??'Unavailable'}`;if(!this.issues.includes(issue)&&this.issues.length<128)this.issues.push(issue);}
  }
}
export type Attribution = {contributors:{name:string;calls:number;tokens:number}[];skillCount:number;callCount:number;afterCompaction:boolean};
export const emptyAttribution = (): Attribution => ({contributors:[],skillCount:0,callCount:0,afterCompaction:false});
export function bounded(value: Attribution, input?: number): Attribution {
  const total=value.contributors.reduce((sum,c)=>sum+c.tokens,0), factor=input!=null&&total>0?Math.min(1,Math.max(0,input)/total):1;
  return {...value,contributors:value.contributors.map(c=>({...c,tokens:Math.trunc(c.tokens*factor)}))};
}
const text=(value: any): string => typeof value==='string'?value:Array.isArray(value)?value.map(b=>typeof b?.text==='string'?b.text:'').filter(Boolean).join('\n'):'';
const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
export function estimateTokens(value:string) {let count=0;for(const _ of segmenter.segment(value))count++;return Math.ceil(count/4);}
export class AttributionEstimator {
  private calls=new Map<string,{name:string;skill?:string}>(); private outputs=new Set<string>();
  private totals=new Map<string,number>(); private counts=new Map<string,number>(); private skills=new Set<string>(); private compacted=false;
  consume(type: string,p: RecordValue) {
    if(type==='compacted') {this.calls.clear();this.outputs.clear();this.totals.clear();this.counts.clear();this.skills.clear();this.compacted=true;for(const item of Array.isArray(p.replacement_history)?p.replacement_history:[])if(item&&typeof item==='object')this.consume('response_item',item);return;}
    if(type!=='response_item'||typeof p.call_id!=='string'||p.call_id.length>200)return;
    const id=p.call_id;
    if(['function_call','custom_tool_call'].includes(p.type)) {
      if(this.calls.has(id))return;
      const name=typeof p.name==='string'?p.name.slice(0,128):'Tools',args=text(p.arguments??p.input),lower=name.toLowerCase();
      const skill=/\b(cat|read|sed|head)\b/.test(args)?args.match(/([A-Za-z0-9_.-]+)\/SKILL\.md/)?.[1]?.slice(0,128):undefined;
      let group=typeof p.namespace==='string'?`${p.namespace}/${name}`:name;
      if(skill)group=`Skills / ${skill}`;
      else if(lower==='exec'||lower.includes('exec_command')||lower.includes('shell'))group=/\b(cat|rg|grep|sed|head|read_file)\b/.test(args)?'Read/Search':lower==='exec'&&!args.includes('exec_command')&&!args.includes('write_stdin')?'Tools':'Shell';
      else if(lower.includes('search')||lower.includes('read_file'))group='Read/Search';
      else group=group.replaceAll('mcp__','').replaceAll('__','/').slice(0,42);
      if(!this.totals.has(group)&&this.totals.size>=128)group='Tools';
      if(this.calls.size>=32768)this.calls.delete(this.calls.keys().next().value!);
      this.calls.set(id,{name:group,skill});this.counts.set(group,(this.counts.get(group)??0)+1);this.totals.set(group,(this.totals.get(group)??0)+estimateTokens(args));
    } else if(['function_call_output','custom_tool_call_output'].includes(p.type)) {
      if(this.outputs.has(id))return;this.outputs.add(id);if(this.outputs.size>32768)this.outputs.delete(this.outputs.values().next().value!);
      const call=this.calls.get(id);let group=call?.name??'Tools (unmatched)';if(!this.totals.has(group)&&this.totals.size>=128)group='Tools';const output=text(p.output);
      this.totals.set(group,(this.totals.get(group)??0)+estimateTokens(output));if(call?.skill&&output&&this.skills.size<128)this.skills.add(call.skill);
    }
  }
  snapshot(input?:number): Attribution { return bounded({contributors:[...this.totals].map(([name,tokens])=>({name,tokens,calls:this.counts.get(name)??0})).sort((a,b)=>b.tokens-a.tokens||(a.name<b.name?-1:1)),skillCount:this.skills.size,callCount:[...this.counts.values()].reduce((a,b)=>a+b,0),afterCompaction:this.compacted},input); }
}
export function compactionValue(currentInput?:number, postCompactionInput?:number) {
  if(currentInput==null||currentInput<=0||(postCompactionInput!=null&&postCompactionInput<0))return;
  const reduced=postCompactionInput??Math.max(currentInput*.3,40000),raw=currentInput>reduced?Math.floor(1+(reduced+3600)/(.1*(currentInput-reduced)))+1:undefined;
  const breakEvenCalls=raw!=null&&Number.isSafeInteger(raw)?raw:undefined;
  const category=breakEvenCalls==null?'VERY LOW':breakEvenCalls<=6?'VERY HIGH':breakEvenCalls<=8?'HIGH':breakEvenCalls<=12?'MEDIUM':breakEvenCalls<=20?'LOW':'VERY LOW';
  return {currentInput,estimatedInput:Math.round(reduced),breakEvenCalls,category,level:category==='VERY HIGH'?3:category==='HIGH'?2:category==='MEDIUM'?1:0};
}
export function apiBreakEven(input?:number,model?:string,tier?:string) {
  if(!input||input<=0)return;const reduced=Math.max(Math.round(input*.3),40000),a=rates(model,tier,input),b=rates(model,tier,reduced);
  if(reduced>=input||!a||!b)return;const saving=input*a.cached-reduced*b.cached;if(saving<=0)return;
  const calls=Math.floor(1+(reduced*b.input+3600*a.output)/saving)+1;return Number.isSafeInteger(calls)?calls:undefined;
}
export function health(value: number|undefined,stops:number[]) {if(value==null||!Number.isFinite(value)||value<=stops[0])return 0;for(let i=1;i<stops.length;i++)if(value<stops[i])return i-1+(value-stops[i-1])/(stops[i]-stops[i-1]);return 3;}
export function cacheTemperature(lastCall?:string,now=Date.now()) {if(!lastCall)return;const age=now-Date.parse(lastCall);return age<1800000?'WARM':age<=7200000?'UNCERTAIN':'PRES. COLD';}
export function cleanTitle(value:unknown):string|undefined {if(typeof value!=='string')return;const title=value.trim().replace(/\s+/g,' ');if(!title||['# Files mentioned by the user:','<environment_context>','<permissions instructions>'].some(s=>title.startsWith(s)))return;return Array.from(segmenter.segment(title)).slice(0,90).map(s=>s.segment).join('');}
export function date(value:unknown):string|undefined {return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():undefined;}
// Fixed-size fingerprints bound replay memory. Cumulative and timestamp identities
// use separate sets so allowance-only records cannot invent additional calls.
export class BoundedSet {
  private values=new Set<string>();
  constructor(private limit=32768){}
  add(key:string) {if(this.values.has(key))return false;this.values.add(key);if(this.values.size>this.limit)this.values.delete(this.values.values().next().value!);return true;}
}
