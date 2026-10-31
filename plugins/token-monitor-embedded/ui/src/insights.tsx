import React from 'react';
import type {Monitor} from './view.js';
import {efficiencyInsights,type Thresholds} from './performance.js';
export function EfficiencyInsights({s,thresholds}:{s:Monitor;thresholds:Thresholds}) {
 const [primary,secondary]=efficiencyInsights(s,thresholds);
 return <section className="efficiency-insights" aria-label="Efficiency insights"><h2>Efficiency insights</h2><div className={`insight tone-${primary.tone}`}><strong>{primary.title}</strong><p>{primary.finding} {primary.impact}</p><p className="recommendation">{primary.recommendation}</p></div>{secondary&&<details className={`secondary-insight tone-${secondary.tone}`}><summary>{secondary.title}</summary><p>{secondary.finding} {secondary.impact}</p><p>{secondary.recommendation}</p></details>}</section>;
}
