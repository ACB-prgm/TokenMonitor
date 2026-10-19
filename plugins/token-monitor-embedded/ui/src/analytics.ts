export type Price = {total?: number; categories?: number[]; cacheSavings?: number; assumedTier: boolean; issue?: string; rates?: {input: number; cached: number; write?: number; output: number}};
export type Usage = {input: number; cached: number; cacheWrite: number; output: number; reasoning: number; inputComplete: boolean; outputComplete: boolean; reasoningComplete: boolean; cacheComplete: boolean; pricedCalls: number; unpricedCalls: number; assumedTierCalls: number; cost: number; cacheSavings: number; costCategories: number[]; models: string[]; issues: string[]; source: string; verifiedAt: string; coverage: string; cumulativeMismatch: boolean};
export const categories = [
  {label:'Ordinary input',color:'var(--ordinary)'}, {label:'Cache read',color:'var(--read)'},
  {label:'Cache write',color:'var(--write)'}, {label:'Reasoning output',color:'var(--reason)'},
  {label:'Other output',color:'var(--other)'}, {label:'Unsplit output',color:'var(--unknown)'}
];
export const number = (n?: number | null) => n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
export const exact = (n?: number | null) => n == null ? 'Unknown' : n.toLocaleString();
export const percent = (n?: number | null) => n == null || !Number.isFinite(n) ? '—' : n > 0 && n < .1 ? '<0.1%' : n < 100 && n > 99.9 ? '>99.9%' : `${Number(n.toFixed(1))}%`;
export const money = (n?: number | null) => n == null || !Number.isFinite(n) ? '—' : n > 0 && n < .0001 ? '<$0.0001' : `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(Math.abs(n) < .01 && n !== 0 ? 4 : 2)}`;
export function composition(input: number, cached: number, write: number, output: number, reasoning?: number): number[] {
  return [input-cached-write,cached,write,reasoning??0,reasoning==null?0:output-reasoning,reasoning==null?output:0];
}
export type Layout = {expanded: boolean; scale: number; layoutVersion?: number};
export function migrateLayout(saved: Partial<Layout>): Layout {
  // Actual base dimensions shrink to .85. Preserve old visual sizes, not labels.
  const scale = saved.layoutVersion === 2 ? saved.scale : saved.scale == null ? 1 : saved.scale / .85;
  return {expanded:saved.expanded===true,scale:scale != null && [0.85,1,1/.85,1.15/.85].some(n=>Math.abs(n-scale)<.001) ? scale : 1,layoutVersion:2};
}
