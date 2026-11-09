import React from 'react';
import type {ResumeState} from '../../server/src/resume.js';
export type ResumeView={available:boolean;request?:ResumeState;threadId?:string};
export type ResumeAction='test'|'reset'|'cancel';
export function ResumeControls({value,threadId,title,busy,error,onAction}:{value?:ResumeView;threadId?:string;title?:string;busy:boolean;error?:string;onAction:(action:ResumeAction)=>void}){
  const candidate=value?.request,request=candidate?.threadId===threadId?candidate:undefined;
  const pending=request?.phase==='armed'||request?.phase==='sending';
  return <details className="resume-probe"><summary>DEV · Resume after reset test</summary>
    <p>Target: <strong>{title??'Choose a chat'}</strong></p>
    <p>Arm only after the target chat stops. One message will be sent through the app’s existing connection. Keep the desktop app running and the computer awake; this panel may be closed. Restarting cancels pending work.</p>
    <div className="resume-actions">
      <button disabled={busy||pending||!threadId||!value?.available} onClick={()=>onAction('test')}>Send harmless test in 30 seconds</button>
      <button disabled={busy||pending||!threadId||!value?.available} onClick={()=>onAction('reset')}>Resume this chat after usage reset</button>
      <button disabled={busy||request?.phase!=='armed'} onClick={()=>onAction('cancel')}>Cancel pending resume</button>
    </div>
    {!value?.available&&<p role="status">App tools bridge unavailable in this DEV process. Restart the app and reopen DEV.</p>}
    {request&&<p role="status"><strong>{request.phase}</strong> · {request.message}<br/>Earliest send: {new Date(request.notBefore).toLocaleString()}{request.checkedAt&&<> · Last check: {new Date(request.checkedAt).toLocaleTimeString()}</>}<br/>Probe: <code>{request.id}</code></p>}
    {error&&<p role="alert" className="warning">{error}</p>}
    <p>The 30-second test asks for a fixed acknowledgement only. Reset mode asks the chat to continue its task. Both require fresh usage availability. A new user turn cancels pending work. Delivery is attempted once; verify the response in the target chat. Goal resumption is still experimental.</p>
  </details>;
}
