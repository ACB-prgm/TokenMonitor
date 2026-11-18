import {z} from 'zod';
import bundled from '../../../../pricing.json' with {type:'json'};

const day=z.iso.date();
const start=z.union([day,z.iso.datetime({offset:true})]);
const rate=z.number().min(0).max(1e6);
const band=z.strictObject({input:rate,output:rate,cachedInput:rate.optional(),cacheWrite30m:rate.optional(),cacheWrite12h:rate.optional()});
const tokenLimit=z.number().int().positive();
const tier=z.strictObject({base:band,baseInputTokensAtMost:tokenLimit.optional(),longContext:z.strictObject({
 inputTokensAbove:tokenLimit,rates:band,
}).optional()}).refine(t=>!t.longContext||t.baseInputTokensAtMost===undefined);
const modelId=z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/);
const schedule=z.strictObject({
 effectiveFrom:start,dateBasis:z.enum(['published-start','verified-baseline']),dateSource:z.url().optional(),
 tiers:z.strictObject({standard:tier,fast:tier.optional(),ultrafast:tier.optional(),batch:tier.optional(),flex:tier.optional()}),
 regionalMultiplier:z.number().min(1).max(10).optional(),
 backgroundCompletionWindowMultipliers:z.strictObject({'2h':z.number().positive().max(1),'8h':z.number().positive().max(1)}).optional(),
 promotionThrough:day.optional(),
}).refine(s=>!s.promotionThrough||Date.parse(s.promotionThrough)+86400000>Date.parse(s.effectiveFrom));
const schema=z.strictObject({
 schemaVersion:z.literal(1),provider:z.literal('OpenAI'),currency:z.literal('USD'),tokensPerUnit:z.literal(1000000),
 source:z.url({protocol:/^https$/}),verifiedAt:day,aliases:z.record(modelId,modelId),
 models:z.record(modelId,z.array(schedule).min(1)),
}).refine(c=>Object.keys(c.models).length>0&&Object.values(c.models).every(list=>
 list.every((s,i)=>i===0||Date.parse(s.effectiveFrom)>Date.parse(list[i-1].effectiveFrom)))&&
 Object.entries(c.aliases).every(([id,target])=>!Object.hasOwn(c.models,id)&&Object.hasOwn(c.models,target)),
 'Expected ordered schedules and aliases targeting catalog models');

export type Catalog=z.infer<typeof schema>;
export type Rates={input:number;cached?:number;write?:number;output:number};
export type Pricing={
 readonly source:string;readonly verifiedAt:string;
 hasModel:(model:string)=>boolean;
 rates:(model:string|undefined,tier:string|undefined,input:number,regional:boolean,when:string|number)=>Rates|undefined;
};

export function parseCatalog(value:unknown):Catalog{return schema.parse(value);}

export function catalogPricing(catalog:Catalog):Pricing {
 const schedules=Object.fromEntries(Object.entries(catalog.models).map(([id,list])=>[id,list.map(s=>({
  ...s,from:Date.parse(s.effectiveFrom),until:s.promotionThrough?Date.parse(s.promotionThrough)+86400000:Infinity,
 })).reverse()]));
 const modelKey=(id:string)=>Object.hasOwn(catalog.aliases,id)?catalog.aliases[id]:id;
 return Object.freeze({
  source:catalog.source,verifiedAt:catalog.verifiedAt,
  hasModel:(id:string)=>Object.hasOwn(catalog.models,modelKey(id)),
  rates(model:string|undefined,serviceTier:string|undefined,input:number,regional:boolean,when:string|number){
   if(!model||!Object.hasOwn(catalog.models,modelKey(model)))return;
   const instant=typeof when==='number'?when:Date.parse(when);
   const s=schedules[modelKey(model)].find(s=>s.from<=instant);
   if(!s||instant>=s.until)return;
   const name=serviceTier==null||serviceTier==='auto'||serviceTier==='default'?'standard':serviceTier==='priority'?'fast':serviceTier;
   if(!Object.hasOwn(s.tiers,name))return;
   const t=s.tiers[name as keyof typeof s.tiers];
   const multiplier=regional?s.regionalMultiplier:1;
   if(!t||multiplier==null||t.baseInputTokensAtMost!=null&&input>t.baseInputTokensAtMost)return;
   const b=t.longContext&&input>t.longContext.inputTokensAbove?t.longContext.rates:t.base;
   return {input:b.input*multiplier,...(b.cachedInput==null?{}:{cached:b.cachedInput*multiplier}),
    ...(b.cacheWrite30m==null?{}:{write:b.cacheWrite30m*multiplier}),output:b.output*multiplier};
  },
 });
}
export const bundledCatalog=parseCatalog(bundled);
export const bundledPricing=catalogPricing(bundledCatalog);
