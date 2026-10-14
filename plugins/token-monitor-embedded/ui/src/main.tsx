import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'TokenMonitor Embedded', version: '0.1.0' });
function Panel() {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
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
  useEffect(() => {
    let alive = true;
    app.ontoolresult = result => { if (alive && (result._meta as any)?.monitor) setState((result._meta as any).monitor); };
    app.connect().then(() => { if (alive) setReady(true); }).catch(error => setError(String(error)));
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
    <details><summary>Host metadata fields</summary><pre>{JSON.stringify(state?.metadataShape ?? {}, null, 2)}</pre></details>
    <p className="hint">This panel tests local opening and refresh every two seconds. It does not send prompts or display token telemetry yet.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Panel />);
