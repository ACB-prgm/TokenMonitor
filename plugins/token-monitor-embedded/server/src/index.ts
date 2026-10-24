import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { recordRouting } from './routing-trace.js';
import { acknowledgeStartup, startupState } from './startup.js';
import {installedVersion} from '../../shared/version.js';
import {pluginName,serverDisplayName} from '../../shared/identity.js';
import {Updates, targets} from './updates.js';
import { Panels } from './panels.js';
import { Collector } from './collector.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const resourceUri = `ui://${pluginName}/panel-v${installedVersion}.html`;
const summaryUri = `ui://${pluginName}/turn-summary-v${installedVersion}.html`;
const server = new McpServer({ name: pluginName, version: installedVersion });
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const collector = new Collector();
const panels = new Panels(collector);
const updates = new Updates(installedVersion);
process.on('exit', () => collector.close());
process.stdin.on('end', () => { collector.close(); void server.close(); });
process.on('SIGTERM', () => { collector.close(); process.exit(0); });
process.on('SIGINT', () => { collector.close(); process.exit(0); });
function hostID(extra: { _meta?: Record<string, unknown> }): string | undefined {
  return typeof extra._meta?.threadId === 'string' ? extra._meta.threadId : undefined;
}
// Normal UI results expose field shapes only. An explicitly armed local
// diagnostic can capture scoped routing values in recordRouting.
function metadataShape(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return 'array';
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [
    key.startsWith('/') || key.startsWith('file:') || /^[A-Za-z]:[\\/]/.test(key) ? '[path]' : key,
    metadataShape(item, depth + 1),
  ]));
}
function resource(name: string, uri: string, file: string, preferred: 'inline' | 'fullscreen') {
  server.registerResource(name, uri, {}, async () => ({ contents: [{
    uri, mimeType: 'text/html;profile=mcp-app',
    text: await readFile(path.join(root, 'ui/dist', file), 'utf8'),
    _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } },
      'openai/ui': { availableDisplayModes: preferred === 'inline' ? ['inline'] : ['inline', 'fullscreen'],
        preferredDisplayMode: preferred } },
  }] }));
}
resource('monitor-panel', resourceUri, 'panel.html', 'fullscreen');
resource('turn-summary', summaryUri, 'summary.html', 'inline');
const hookInput = {
  source: z.enum(['manual', 'hook']).optional(),
  sessionId: z.string().min(1).max(200).optional(),
  turnId: z.string().min(1).max(200).nullable().optional(),
};
server.registerTool('open_monitor', {
  title: serverDisplayName,
  description: 'Open the expanded local TokenMonitor panel when requested by the user or by the enabled first-prompt startup instruction. Call once per chat for automatic startup; do not reopen on subsequent turns unless the user requests it. Attaching or mentioning the plugin alone does not open it. After opening, the panel refreshes directly without further model calls.',
  inputSchema: hookInput, annotations,
  _meta: { ui: { resourceUri, visibility: ['model', 'app'] },
    'openai/ui': { entrypoints: [{ type: 'thread' }], preferredModelDisplayMode: 'fullscreen' } },
}, async (args, extra) => {
  await recordRouting('open_monitor', args, extra);
  await acknowledgeStartup(extra._meta?.threadId).catch(() => {});
  const panelId = panels.create(hostID(extra));
  return { content: [], _meta: { monitor: { ...await panels.state(panelId), presentation: 'panel',
    startup: await startupState(hostID(extra)), metadataShape: metadataShape(extra._meta ?? {}) } } };
});
server.registerTool('get_monitor_state', {
  title: 'Refresh monitor', description: 'Refresh local token metrics without a model turn. Task IDs must be discovered locally.',
  inputSchema: { panelId: z.string().uuid(), taskId: z.string().min(1).max(200).optional(),
    action: z.enum(['select']).optional(), revision: z.string().max(500).optional() },
  annotations, _meta: { ui: { visibility: ['app'] } },
}, async (args, extra) => {
  try { return { content: [], _meta: { monitor: await panels.state(args.panelId, args, hostID(extra)), updates: await updates.status() } }; }
  catch { return { isError: true, content: [], _meta: { error: 'Task unavailable. Refresh the local task list.' } }; }
});
server.registerTool('manage_updates', {
  title: 'TokenMonitor updates', description: 'Panel-only release checks and local update preferences; never installs software.',
  inputSchema: { action: z.enum(['opening','check','configure','dismiss']), automatic: z.boolean().optional(),
    target: z.enum(['auto',...targets]).optional(), version: z.string().max(200).optional() },
  annotations: {readOnlyHint:false, destructiveHint:false, openWorldHint:true}, _meta: { ui: { visibility: ['app'] } },
}, async args => {
  try {
    const status = args.action === 'opening' || args.action === 'check'
      ? await updates.check(args.action === 'opening')
      : await updates.configure(args.action === 'dismiss' ? {dismissVersion:args.version ?? ''} : {automatic:args.automatic,target:args.target});
    return {content:[],_meta:{updates:status}};
  } catch { return {isError:true,content:[],_meta:{error:'Unable to access update settings.'}}; }
});
server.registerTool('list_tasks', {
  title: 'List monitored tasks', description: 'List recent local tasks for the panel picker.',
  inputSchema: { panelId: z.string().uuid() }, annotations, _meta: { ui: { visibility: ['app'] } },
}, async (args, extra) => {
  try { return { content: [], _meta: await panels.tasks(args.panelId, hostID(extra)) }; }
  catch { return { isError: true, content: [], _meta: { error: 'Local tasks unavailable' } }; }
});

// Separate resource: rendering a turn-end card must not change the live panel's
// display mode or replace its session. Hook results may not render in all hosts.
server.registerTool('show_turn_summary', {
  title: 'Turn-end monitor summary',
  description: 'Show the separate inline TokenMonitor snapshot when the user requests the inline widget or an inline rendering test. This uses an inline-only resource and does not request expanded view. Do not call automatically at turn end.',
  inputSchema: hookInput, annotations,
  _meta: { ui: { resourceUri: summaryUri, visibility: ['model', 'app'] },
    'openai/ui': { preferredModelDisplayMode: 'inline' } },
}, async (args, extra) => {
  await recordRouting('show_turn_summary', args, extra);
  const panelId = panels.create(hostID(extra));
  return { content: [], _meta: { monitor: { ...await panels.state(panelId), presentation: 'turn-summary',
    completedAt: new Date().toISOString(), metadataShape: metadataShape(extra._meta ?? {}) } } };
});

await server.connect(new StdioServerTransport());
