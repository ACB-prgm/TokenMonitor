import React from 'react';
import type {Monitor} from './view.js';
import {efficiencyInsights,type Thresholds} from './performance.js';
export function EfficiencyInsights({s,thresholds}:{s:Monitor;thresholds:Thresholds}) {
 const [primary,secondary]=efficiencyInsights(s,thresholds);
 if(primary.id==='healthy'||primary.id==='gathering')return null;
 return <details className="efficiency-insights" aria-label="Efficiency insights"><summary><span>Efficiency insights: <strong className={`tone-${primary.tone}`}>{primary.title}</strong></span><span className="insight-chevron" aria-hidden="true">⌄</span></summary><div className={`insight tone-${primary.tone}`}><p>{primary.finding} {primary.impact}</p><p className="recommendation">{primary.recommendation}</p></div>{secondary&&<details className={`secondary-insight tone-${secondary.tone}`}><summary>{secondary.title}</summary><p>{secondary.finding} {secondary.impact}</p><p>{secondary.recommendation}</p></details>}</details>;
}
