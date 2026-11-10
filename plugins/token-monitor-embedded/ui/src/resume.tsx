import React from 'react';
import type {ContinuationView} from '../../server/src/continuation.js';
export type ResumeView=ContinuationView;
export type ResumeAction='enable'|'disable'|'dismiss';
export function ResumeControls({value,threadId,title,busy,error,onAction}:{value?:ResumeView;threadId?:string;title?:string;busy:boolean;error?:string;onAction:(action:ResumeAction)=>void}){
 const selected=value?.threadId===threadId?value:undefined;
 return <section className="resume-probe" aria-label="Chat continuation settings">
  <p>Chat: <strong>{title??'Choose a chat'}</strong></p>
  <label><input type="checkbox" role="switch" checked={!!selected?.enabled} disabled={busy||!threadId||(!selected?.available&&!selected?.enabled)} onChange={e=>onAction(e.target.checked?'enable':'disable')}/> Continue this chat after usage reset</label>
  <p>Off by default. When enabled, continue only work confirmed to have failed at a usage limit. This preference stays on across resets and restarts. Keep Codex running and your computer awake.</p>
  <p role="status">{selected?.message??'Checking app connection…'}</p>
  {error&&<p role="alert" className="warning">{error}</p>}
 </section>;
}
export function ResumeOffer({value,threadId,title,busy,onAction}:{value?:ResumeView;threadId?:string;title?:string;busy:boolean;onAction:(action:ResumeAction)=>void}){
 if(value?.threadId!==threadId||!value?.offer||!value.available||value.enabled)return null;
 return <section className="resume-probe" role="status" aria-label="Low five-hour allowance">
  <p>Your five-hour allowance is at least 90% used. Continue <strong>{title??'this chat'}</strong> automatically after reset if its work is interrupted?</p>
  <div className="resume-actions"><button disabled={busy} onClick={()=>onAction('enable')}>Enable for this chat</button><button disabled={busy} onClick={()=>onAction('dismiss')}>Not now</button></div>
 </section>;
}
