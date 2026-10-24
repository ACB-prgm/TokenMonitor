import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import {migrateLayout, type Layout} from './analytics.js';
import { MonitorView, type Monitor } from './view.js';
import {installedVersion} from '../../shared/version.js';
import {isDev,pluginName,serverDisplayName} from '../../shared/identity.js';
import type {UpdateStatus} from '../../server/src/updates.js';
import type {UpdateAction} from './updates.js';

const app = new App({ name: serverDisplayName, version: installedVersion });
const layoutKey = isDev ? `${pluginName}-layout` : 'token-monitor-layout';
const summary = document.documentElement.dataset.monitorView === 'summary';
const legacy = () => (window as any).openai as {widgetState?: Layout; setWidgetState?: (s: Layout)=>void} | undefined;
function savedLayout(): Layout {
  try {
    const saved = legacy()?.widgetState ?? JSON.parse(sessionStorage.getItem(layoutKey) ?? '{}');
    return migrateLayout(saved);
  } catch { return {expanded:false,scale:1}; }
}
function Panel() {
  const [state,setState] = useState<Monitor>({panelId:'',status:'Connecting to local telemetry…'});
  const [layout,setLayout] = useState(savedLayout);
  const [error,setError] = useState('');
  const [updates,setUpdates] = useState<UpdateStatus>();
  const [updateError,setUpdateError] = useState('');
  const openedPanel = useRef(''), updateSerial = useRef(0), updating = useRef(0);
  const current = useRef(state), active = useRef(true), serial = useRef(0), fetching = useRef(false);
  const retry = useRef({at:0,failures:0});
  const pendingSelection = useRef<string | undefined>(undefined);
  function apply(value: Monitor) {
    if (!active.current) return;
    if (value.unchanged) { setError(''); return; }
    current.current = value; setState(value);
  }
  async function manageUpdate(action: UpdateAction) {
    const request=++updateSerial.current;updating.current++;
    try {
      if(action.action==='link') {
        if(!action.url) return;
        const result=await app.openLink({url:action.url});
        if(result.isError)throw new Error('Codex could not open this link.');
      } else {
        const result=await app.callServerTool({name:'manage_updates',arguments:action});
        if(result.isError)throw new Error('Unable to access update settings.');
        if(active.current&&request===updateSerial.current) {
          const value=(result._meta as any)?.updates as UpdateStatus|undefined;
          if(value)setUpdates(value);
        }
      }
      if(active.current&&request===updateSerial.current)setUpdateError('');
    } catch(error) {
      if(active.current&&request===updateSerial.current)setUpdateError(error instanceof Error?error.message:'Unable to check updates.');
    } finally {updating.current--;}
  }
  async function refresh(action?: 'select', taskId?: string) {
    const now = Date.now();
    if (!active.current || !current.current.panelId || (!action && now < retry.current.at)) return;
    if (fetching.current) {
      if (action === 'select') pendingSelection.current = taskId;
      return;
    }
    const request = ++serial.current, updateRequest=updateSerial.current; fetching.current = true;
    try {
      const result = await app.callServerTool({name:'get_monitor_state',arguments:{panelId:current.current.panelId,revision:current.current.revision,action,taskId}});
      if (result.isError) throw new Error('Task unavailable. Refresh or choose another local task.');
      const next = (result._meta as any)?.monitor as Monitor | undefined;
      if (!next) throw new Error('The host did not return monitor data.');
      if (request !== serial.current || !active.current) return;
      if(!updating.current&&updateRequest===updateSerial.current&&(result._meta as any)?.updates)setUpdates((result._meta as any).updates);
      apply(next); setError('');
      retry.current = {at:0,failures:0};
    } catch (error) {
      if (request === serial.current && active.current) {
        setError(error instanceof Error ? error.message : 'Disconnected · retaining last snapshot');
        retry.current.at = Date.now()+Math.min(30000,1000*2**Math.min(retry.current.failures++,5));
      }
    } finally {
      if (request === serial.current && active.current) {
        fetching.current=false;
        const selected = pendingSelection.current;
        pendingSelection.current=undefined;
        if (selected) void refresh('select',selected);
      }
    }
  }
  function changeLayout(expanded: boolean, scale: number) {
    const next = {expanded,scale,layoutVersion:2}; setLayout(next);
    try { if (legacy()?.setWidgetState) legacy()!.setWidgetState!(next); else sessionStorage.setItem(layoutKey,JSON.stringify(next)); } catch { /* Layout remains usable without host persistence. */ }
  }
  useEffect(()=>{
    active.current=true;
    function theme() { const value=app.getHostContext()?.theme; if(value) document.documentElement.dataset.theme=value; }
    app.onhostcontextchanged=()=>theme();
    app.ontoolresult=result=>{
      const value=(result._meta as any)?.monitor as Monitor | undefined;
      if(value?.panelId) {
        serial.current++; fetching.current=false; apply(value);
        if(!summary) {
          void refresh();
          if(!isDev && openedPanel.current!==value.panelId) {
            openedPanel.current=value.panelId;
            // Yield rendering first; opening checks never gate telemetry or the bridge.
            setTimeout(()=>{if(active.current)void manageUpdate({action:'opening'});},0);
          }
        }
      }
    };
    app.connect().then(()=>{theme(); setLayout(savedLayout());}).catch(()=>setError('Unable to connect to the Codex widget bridge.'));
    const visible=()=>{if(document.visibilityState==='visible'){retry.current.at=0;void refresh();}};
    document.addEventListener('visibilitychange',visible);
    const interval=summary ? undefined : setInterval(()=>{if(document.visibilityState==='visible')void refresh();},2000);
    return ()=>{active.current=false;serial.current++;clearInterval(interval);document.removeEventListener('visibilitychange',visible);app.close();};
  },[]);
  return <MonitorView s={state} expanded={layout.expanded} scale={layout.scale} error={error}
    updates={updates} onUpdate={summary?undefined:action=>void manageUpdate(action)} updateError={updateError}
    onAction={summary ? undefined : (action,id)=>{retry.current.at=0;void refresh(action,id);}} onLayout={changeLayout}
    storage={legacy()?.setWidgetState ? 'host widget state' : 'frame session storage (host state API unavailable)'} />;
}
createRoot(document.getElementById('root')!).render(<Panel />);
