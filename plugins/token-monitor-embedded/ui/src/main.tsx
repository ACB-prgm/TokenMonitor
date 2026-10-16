import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type McpUiDisplayMode } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'TokenMonitor Embedded', version: '0.1.2' });
function Panel() {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [displayMode, setDisplayMode] = useState<McpUiDisplayMode>('inline');
  const [displayModes, setDisplayModes] = useState<McpUiDisplayMode[] | null>(null);
  const [modeMessage, setModeMessage] = useState('');
  const [changingMode, setChangingMode] = useState(false);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  async function refresh() {
    try {
      const result = await app.callServerTool({ name: 'get_monitor_state', arguments: {} });
      if (result.isError) throw new Error('The host rejected the panel refresh.');
      const next = (result._meta as any)?.monitor;
      if (!next) throw new Error('The host did not deliver UI-only result metadata.');
      setState(next); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Panel refresh failed.'); }
  }
  function readDisplayContext() {
    const context = app.getHostContext();
    if (context?.displayMode) setDisplayMode(context.displayMode);
    if (context?.availableDisplayModes) setDisplayModes(context.availableDisplayModes);
  }
  async function changeDisplayMode(mode: McpUiDisplayMode) {
    setChangingMode(true); setModeMessage('');
    try {
      const result = await app.requestDisplayMode({ mode });
      setDisplayMode(result.mode);
      setModeMessage(result.mode === mode
        ? `Host selected ${result.mode}. Check whether the widget stays visible as the chat scrolls.`
        : `Requested ${mode}; the host kept ${result.mode}. Persistent placement is not confirmed.`);
    } catch {
      setModeMessage(`The host rejected ${mode}. Persistent placement is not confirmed.`);
    } finally { setChangingMode(false); }
  }
  useEffect(() => {
    let alive = true;
    app.ontoolresult = result => { if (alive && (result._meta as any)?.monitor) setState((result._meta as any).monitor); };
    app.onhostcontextchanged = () => { if (alive) readDisplayContext(); };
    app.connect().then(() => { if (alive) { readDisplayContext(); setReady(true); } }).catch(error => setError(String(error)));
    const visibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    return () => { alive = false; document.removeEventListener('visibilitychange', visibility); app.close(); };
  }, []);
  useEffect(() => {
    if (!ready || !visible) return;
    refresh(); const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [ready, visible]);
  return <main>
    <header><h1>TokenMonitor Embedded</h1><span>Prototype</span></header>
    <p>{state?.status ?? 'Connecting to the Codex panel bridge…'}</p>
    <dl><dt>Successful refreshes</dt><dd>{state?.revision ?? '—'}</dd>
      <dt>Last refresh</dt><dd>{state?.refreshedAt ? new Date(state.refreshedAt).toLocaleTimeString() : '—'}</dd></dl>
    <button disabled={!ready} onClick={refresh}>Refresh</button>
    {error && <p role="alert">{error}</p>}
    <section aria-labelledby="display-heading" className="display-test">
      <h2 id="display-heading">Persistent display test</h2>
      <p>Current mode: <strong>{displayMode}</strong><br />
        Host-advertised modes: {displayModes?.join(', ') ?? 'Not reported'}</p>
      <div className="display-buttons">
        <button disabled={!ready || changingMode || !displayModes?.includes('pip')}
          onClick={() => changeDisplayMode('pip')}>Keep visible (PiP)</button>
        <button disabled={!ready || changingMode || !displayModes?.includes('fullscreen')}
          onClick={() => changeDisplayMode('fullscreen')}>Open expanded view</button>
        {displayMode !== 'inline' && <button disabled={changingMode || !displayModes?.includes('inline')}
          onClick={() => changeDisplayMode('inline')}>Return inline</button>}
      </div>
      {ready && displayModes && !displayModes.includes('pip') &&
        <p className="hint">This host does not advertise PiP. Expanded view, if available, is a separate placement test.</p>}
      <p role="status">{modeMessage}</p>
      <p className="hint">These controls request host-managed display modes. They cannot attach a widget to Codex’s native composer or status area.</p>
    </section>
    <details><summary>Host metadata fields</summary><pre>{JSON.stringify(state?.metadataShape ?? {}, null, 2)}</pre></details>
    <p className="hint">This panel tests local opening and refresh every two seconds. It does not send prompts or display token telemetry yet.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Panel />);
