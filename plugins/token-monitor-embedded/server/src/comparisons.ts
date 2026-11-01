import type {Bucket} from './efficiency.js';

export type Comparison = {
  current: number | null; reference: number | null; delta: number | null;
  currentCalls: number; baselineCalls: number; coverage: number;
  provisional: boolean; reason?: string;
  cohorts?: {model:string;effort?:string;currentCalls:number;referenceCalls:number}[];
};
export type Comparisons = {cost: Comparison; context: Comparison; cache: Comparison; referenceLabel?:string};

// Output spending depends on effort. Input cost/cache comparisons match model only.
// Tier, region and input-dependent rates still determine each call's cost.
function cohort(b: Bucket,metric:'cost'|'context'|'cache'): string | undefined {
  if (!b.model || metric==='cost'&&!b.effort) return;
  return JSON.stringify([b.model,metric==='cost'?b.effort:null]);
}
export function compareCohorts(current: Bucket[], baseline: Bucket[], ready: boolean): Comparisons {
  function compare(metric: 'cost' | 'context' | 'cache'): Comparison {
    const count = (b: Bucket) => metric === 'cost' ? b.priced : b.inputPriced;
    const groups = new Map<string, Bucket[]>();
    for (const b of current) { const key=cohort(b,metric); if(key) groups.set(key,[...(groups.get(key)??[]),b]); }
    const total=current.reduce((n,b)=>n+count(b),0);
    let calls=0,baseCalls=0,currentSum=0,referenceSum=0,sufficient=true,referencePricing=true;
    let problem:string|undefined;
    const cohorts:NonNullable<Comparison['cohorts']>=[];
    const average = (bs: Bucket[]) => {
      if(metric==='cache') {const input=bs.reduce((n,b)=>n+b.cacheInput,0);return input?bs.reduce((n,b)=>n+b.cacheRead,0)/input*100:null;}
      const n=bs.reduce((n,b)=>n+count(b),0);
      return n?bs.reduce((n,b)=>n+(metric==='cost'?b.cost+b.overhead:b.inputCost),0)/n:null;
    };
    for (const [key,bs] of groups) {
      const refs=baseline.filter(b=>cohort(b,metric)===key), n=bs.reduce((n,b)=>n+count(b),0), bn=refs.reduce((n,b)=>n+count(b),0);
      if(!n)continue;
      const model=bs[0].model!,effort=metric==='cost'?bs[0].effort:undefined;
      const label=`${model}${effort?` / ${effort}`:''}`;
      cohorts.push({model,effort,currentCalls:n,referenceCalls:bn});
      baseCalls+=bn;
      referencePricing&&=refs.every(b=>count(b)===b.calls);
      const a=average(bs),r=average(refs);
      if(a==null||r==null||r<=0){sufficient=false;problem??=bn?`No positive reference for ${label}`:`No reference calls for ${label}`;continue;}
      if(n<20||bn<20){sufficient=false;problem??=`${label}: ${n} current / ${bn} reference calls; at least 20 of each required`;}
      calls+=n;currentSum+=a*n;referenceSum+=r*n;
    }
    const a=calls?currentSum/calls:null,r=calls?referenceSum/calls:null;
    const coverage=total?calls/total:0;
    const completePricing=current.every(b=>count(b)===b.calls)&&referencePricing;
    const provisional=!ready||!sufficient||coverage<1||!completePricing||!calls;
    const reason=!total?'No qualifying calls':!ready?'Historical import is incomplete':problem??(coverage<1?`Missing comparable ${metric==='cost'?'model or effort':'model'}`:!completePricing?'Partial pricing coverage':undefined);
    return {current:a,reference:r,delta:a!=null&&r!=null&&r>0?(a-r)/r*100:null,currentCalls:total,baselineCalls:baseCalls,coverage,provisional,reason,cohorts};
  }
  return {cost:compare('cost'),context:compare('context'),cache:compare('cache')};
}
