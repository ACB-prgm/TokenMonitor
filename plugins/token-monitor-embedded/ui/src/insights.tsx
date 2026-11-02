import React from 'react';
import type {Monitor} from './view.js';
import {efficiencyInsights,type Insight} from './performance.js';
function ForecastDetails({insight}:{insight:Insight}){return insight.details?<dl className="insight-forecast-details">{insight.details.map(d=><React.Fragment key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></React.Fragment>)}</dl>:null;}
export function EfficiencyInsights({s}:{s:Monitor}) {
 const [primary,secondary]=efficiencyInsights(s);
 if(primary.id==='healthy'||primary.id==='gathering')return null;
 return <details className="efficiency-insights" aria-label="Efficiency insights"><summary><span>Efficiency insights: <strong className={`tone-${primary.tone}`}>{primary.title}</strong></span><span className="insight-chevron disclosure-caret" aria-hidden="true"/></summary><div className={`insight tone-${primary.tone}`}><p>{primary.finding} {primary.impact}</p><p className="recommendation">{primary.recommendation}</p><ForecastDetails insight={primary}/></div>{secondary&&<details className={`secondary-insight tone-${secondary.tone}`}><summary>{secondary.title}</summary><p>{secondary.finding} {secondary.impact}</p><p>{secondary.recommendation}</p><ForecastDetails insight={secondary}/></details>}</details>;
}
