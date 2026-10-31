import type {Bucket} from './efficiency.js';

export type Comparison = {
  current: number | null; reference: number | null; delta: number | null;
  currentCalls: number; baselineCalls: number; coverage: number;
  provisional: boolean; reason?: string;
};
export type Comparisons = {cost: Comparison; context: Comparison; cache: Comparison};

// Rate identity separates long-context bands without relying on aggregated token totals.
function cohort(b: Bucket): string | undefined {
  if (!b.model || !b.effort || !b.rateBand) return;
  const tier = !b.serviceTier || ['auto','automatic','default','standard'].includes(b.serviceTier.toLowerCase()) ? 'standard' : b.serviceTier.toLowerCase();
  return JSON.stringify([b.model,b.effort,tier,b.regionalProcessing === true,b.rateBand]);
}
export function compareCohorts(current: Bucket[], baseline: Bucket[], ready: boolean): Comparisons {
  function compare(metric: 'cost' | 'context' | 'cache'): Comparison {
    const count = (b: Bucket) => metric === 'cost' ? b.priced : b.inputPriced;
    const groups = new Map<string, Bucket[]>();
    for (const b of current) { const key=cohort(b); if(key) groups.set(key,[...(groups.get(key)??[]),b]); }
    const total=current.reduce((n,b)=>n+count(b),0);
    let calls=0,baseCalls=0,currentSum=0,referenceSum=0,sufficient=true;
    const average = (bs: Bucket[]) => {
      if(metric==='cache') {const input=bs.reduce((n,b)=>n+b.cacheInput,0);return input?bs.reduce((n,b)=>n+b.cacheRead,0)/input*100:null;}
      const n=bs.reduce((n,b)=>n+count(b),0);
      return n?bs.reduce((n,b)=>n+(metric==='cost'?b.cost+b.overhead:b.inputCost),0)/n:null;
    };
    for (const [key,bs] of groups) {
      const refs=baseline.filter(b=>cohort(b)===key), n=bs.reduce((n,b)=>n+count(b),0), bn=refs.reduce((n,b)=>n+count(b),0);
      const a=average(bs),r=average(refs);
      if(!n)continue;
      if(a==null||r==null||r<=0){sufficient=false;continue;}
      sufficient&&=n>=20&&bn>=20;
      calls+=n;baseCalls+=bn;currentSum+=a*n;referenceSum+=r*n;
    }
    const a=calls?currentSum/calls:null,r=calls?referenceSum/calls:null;
    const coverage=total?calls/total:0;
    const completePricing=current.every(b=>count(b)===b.calls);
    const provisional=!ready||!sufficient||coverage<1||!completePricing||!calls;
    const reason=!total?'No qualifying calls':coverage<1?'Missing comparable model, effort, or pricing cohort':!completePricing?'Partial pricing coverage':!ready?'Baseline import is provisional':!sufficient?'At least 20 current and baseline calls are required per cohort':undefined;
    return {current:a,reference:r,delta:a!=null&&r!=null&&r>0?(a-r)/r*100:null,currentCalls:total,baselineCalls:baseCalls,coverage,provisional,reason};
  }
  return {cost:compare('cost'),context:compare('context'),cache:compare('cache')};
}
