import React from 'react';
import type {ResumeState} from '../../server/src/resume.js';
export type ResumeView={available:boolean;request?:ResumeState;threadId?:string};
export type ResumeAction='test'|'reset'|'cancel';
export function ResumeControls({value,threadId,title,busy,error,onAction}:{value?:ResumeView;threadId?:string;title?:string;busy:boolean;error?:string;onAction:(action:ResumeAction)=>void}){
  const candidate=value?.request,request=candidate?.threadId===threadId?candidate:undefined;
  const pending=request?.phase==='armed'||request?.phase==='sending';
  return <section className="resume-probe" aria-label="Resume after usage reset">
    <p>Target: <strong>{title??'Choose a chat'}</strong></p>
    <label><input type="checkbox" role="switch" checked={!!pending&&request?.mode==='reset'} disabled={busy||!threadId||request?.phase==='sending'||!!pending&&request?.mode==='test'} onChange={e=>onAction(e.target.checked?'reset':'cancel')}/> Resume this chat after usage reset</label>
    <p>Turn on now and keep working in this chat. After usage runs out and the chat stops, send one continuation when capacity returns, then turn off. Keep the app running and computer awake.</p>
    <div className="resume-actions">
      <button disabled={busy||pending||!threadId||!value?.available} onClick={()=>onAction('test')}>Send harmless test in 30 seconds</button>
      <button disabled={busy||request?.phase!=='armed'} onClick={()=>onAction('cancel')}>Cancel pending resume</button>
    </div>
    {value?.available===false&&<p role="status">App tools bridge unavailable. Reconnect Token Monitor DEV or restart Codex, then reopen the panel.</p>}
    {request&&<p role="status"><strong>{request.phase}</strong> · {request.message}<br/>{request.waitingForLimit?'Waiting for exhausted usage':`Earliest send: ${new Date(request.notBefore).toLocaleString()}`}{request.checkedAt&&<> · Last check: {new Date(request.checkedAt).toLocaleTimeString()}</>}<br/>Probe: <code>{request.id}</code></p>}
    {error&&<p role="alert" className="warning">{error}</p>}
    <p>The 30-second test asks for a fixed acknowledgement only. Reset mode asks the chat to continue its task. Both require fresh usage availability. You can keep sending messages before a limit is detected. Manually continuing after the limit is detected cancels the pending resume. Restarting the app cancels it too. Delivery is attempted once; verify the response in the target chat. Goal resumption is still experimental.</p>
  </section>;
}
