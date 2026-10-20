import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import {migrateLayout, type Layout} from './analytics.js';
import { MonitorView, type Monitor } from './view.js';

const app = new App({ name: 'TokenMonitor Embedded', version: '0.3.3' });
const summary = document.documentElement.dataset.monitorView === 'summary';
const legacy = () => (window as any).openai as {widgetState?: Layout; setWidgetState?: (s: Layout)=>void} | undefined;
function savedLayout(): Layout {
  try {
    const saved = legacy()?.widgetState ?? JSON.parse(sessionStorage.getItem('token-monitor-layout') ?? '{}');
    return migrateLayout(saved);
  } catch { return {expanded:false,scale:1}; }
}
function Panel() {
  const [state,setState] = useState<Monitor>({panelId:'',status:'Connecting to local telemetry…'});
  const [layout,setLayout] = useState(savedLayout);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const current = useRef(state), active = useRef(true), serial = useRef(0), fetching = useRef(false);
  const retry = useRef({at:0,failures:0});
  function apply(value: Monitor) {
    if (!active.current) return;
    if (value.unchanged) { setError(''); return; }
    current.current = value; setState(value);
  }
  async function refresh(action?: 'select'|'lock'|'unlock', taskId?: string) {
    const now = Date.now();
    if (!active.current || !current.current.panelId || fetching.current || (!action && now < retry.current.at)) return;
    const request = ++serial.current; fetching.current = true; setBusy(true);
    try {
      const result = await app.callServerTool({name:'get_monitor_state',arguments:{panelId:current.current.panelId,revision:current.current.revision,action,taskId}});
      if (result.isError) throw new Error('Task unavailable. Refresh or choose another local task.');
      const next = (result._meta as any)?.monitor as Monitor | undefined;
      if (!next) throw new Error('The host did not return monitor data.');
      if (request !== serial.current || !active.current) return;
      apply(next); setError('');
      retry.current = {at:0,failures:0};
    } catch (error) {
      if (request === serial.current && active.current) {
        setError(error instanceof Error ? error.message : 'Disconnected · retaining last snapshot');
        retry.current.at = Date.now()+Math.min(30000,1000*2**Math.min(retry.current.failures++,5));
      }
    } finally { if (request === serial.current && active.current) { fetching.current=false; setBusy(false); } }
  }
  function changeLayout(expanded: boolean, scale: number) {
    const next = {expanded,scale,layoutVersion:2}; setLayout(next);
    try { if (legacy()?.setWidgetState) legacy()!.setWidgetState!(next); else sessionStorage.setItem('token-monitor-layout',JSON.stringify(next)); } catch { /* Layout remains usable without host persistence. */ }
  }
  useEffect(()=>{
    active.current=true;
    function theme() { const value=app.getHostContext()?.theme; if(value) document.documentElement.dataset.theme=value; }
    app.onhostcontextchanged=()=>theme();
    app.ontoolresult=result=>{
      const value=(result._meta as any)?.monitor as Monitor | undefined;
      if(value?.panelId) { serial.current++; fetching.current=false; apply(value); if(!summary) void refresh(); }
    };
    app.connect().then(()=>{theme(); setLayout(savedLayout());}).catch(()=>setError('Unable to connect to the Codex widget bridge.'));
    const visible=()=>{if(document.visibilityState==='visible'){retry.current.at=0;void refresh();}};
    document.addEventListener('visibilitychange',visible);
    const interval=summary ? undefined : setInterval(()=>{if(document.visibilityState==='visible')void refresh();},2000);
    return ()=>{active.current=false;serial.current++;clearInterval(interval);document.removeEventListener('visibilitychange',visible);app.close();};
  },[]);
  return <MonitorView s={state} expanded={layout.expanded} scale={layout.scale} busy={busy} error={error}
    onAction={summary ? undefined : (action,id)=>{retry.current.at=0;void refresh(action,id);}} onLayout={changeLayout}
    storage={legacy()?.setWidgetState ? 'host widget state' : 'frame session storage (host state API unavailable)'} />;
}
createRoot(document.getElementById('root')!).render(<Panel />);
