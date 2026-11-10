import React from 'react';
import type {ContinuationView} from '../../server/src/continuation.js';
export type ResumeView=ContinuationView;
export type ResumeAction='enable'|'enable_all'|'disable'|'dismiss';
export function ResumeControls({value,threadId,busy,error,onAction}:{value?:ResumeView;threadId?:string;title?:string;busy:boolean;error?:string;onAction:(action:ResumeAction)=>void}){
 const selected=value?.threadId===threadId?value:undefined;
 const mode=selected?.mode??(selected?.enabled?'current':'off');
 const labels=['Off','Current thread','All threads'];
 return <section className="continuation-setting" aria-label="Automatic continuation">
  <label className="continuation-row"><span>Continue after reset</span><span className="continuation-slider">
   <input type="range" min="0" max="2" step="1" aria-label="Continue after usage reset" aria-valuetext={labels[mode==='all'?2:mode==='current'?1:0]} value={mode==='all'?2:mode==='current'?1:0} disabled={busy||!threadId||(!selected?.available&&!selected?.enabled)} onChange={e=>onAction(Number(e.target.value)===2?'enable_all':Number(e.target.value)===1?'enable':'disable')}/>
   <span className="continuation-stops" aria-hidden="true">{labels.map((label,i)=><span key={label} className={(mode==='all'?2:mode==='current'?1:0)===i?'selected':''}>{label}</span>)}</span>
  </span></label>
  <p className="hint">Resume work interrupted by a usage limit. All threads includes future local threads. Keep Codex running and your computer awake.</p>
  {(!selected?.available||/uncertain|cannot confirm|paused|continuation sent|waiting for reset/i.test(selected?.message??''))&&<p role="status" className="hint">{selected?.message??'Checking app connection…'}</p>}
  {error&&<p role="alert" className="warning">{error}</p>}
 </section>;
}
export function ResumeOffer({value,threadId,busy,onAction}:{value?:ResumeView;threadId?:string;title?:string;busy:boolean;onAction:(action:ResumeAction)=>void}){
 if(value?.threadId!==threadId||!value?.offer||!value.available||value.enabled)return null;
 return <section className="resume-probe" role="status" aria-label="Low five-hour allowance">
  <p>Your five-hour allowance is at least 90% used. Continue this thread automatically after reset if its work is interrupted?</p>
  <div className="resume-actions"><button disabled={busy} onClick={()=>onAction('enable')}>Enable for this thread</button><button disabled={busy} onClick={()=>onAction('dismiss')}>Not now</button></div>
 </section>;
}
