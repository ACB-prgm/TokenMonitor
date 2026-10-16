import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

const root = fileURLToPath(new URL('../..', import.meta.url));
const resourceUri = 'ui://token-monitor-embedded/panel-v0.1.3.html';
const summaryUri = 'ui://token-monitor-embedded/turn-summary-v0.1.3.html';
const server = new McpServer({ name: 'token-monitor-embedded', version: '0.1.3' });
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
let revision = 0;
let lastHookEvent: string | null = null;
let hookOpenRequests = 0;
let hookSummaryRequests = 0;

// Record field names only. Never log host IDs, prompts, arguments, or metadata values.
function metadataShape(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return 'array';
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key, metadataShape(item, depth + 1)]));
}
function state(extra: { _meta?: unknown }) {
  return { version: 1, prototype: true, revision: String(++revision),
    refreshedAt: new Date().toISOString(), metadataShape: metadataShape(extra._meta ?? {}),
    lastHookEvent, hookOpenRequests, hookSummaryRequests,
    status: 'UI-only refresh connected. This is a feasibility prototype, not token telemetry.' };
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
  title: 'TokenMonitor Embedded',
  description: 'Open the TokenMonitor Embedded connection-test panel when the user asks to open or launch TokenMonitor. This prototype tests embedded UI and does not yet show token usage. Call this tool to launch it; attaching or mentioning the plugin does not open the panel. After opening, the panel refreshes directly without further model calls.',
  inputSchema: hookInput, annotations,
  _meta: { ui: { resourceUri, visibility: ['model', 'app'] },
    'openai/ui': { entrypoints: [{ type: 'thread' }], preferredModelDisplayMode: 'fullscreen' } },
}, async (args, extra) => {
  if (args.source === 'hook') { lastHookEvent = 'UserPromptSubmit'; hookOpenRequests++; }
  return { content: [], _meta: { monitor: { ...state(extra), presentation: 'panel' } } };
});
server.registerTool('get_monitor_state', {
  title: 'Refresh monitor', description: 'Refresh panel data without a model turn.',
  inputSchema: { taskId: z.string().max(200).optional(), revision: z.string().max(100).optional() },
  annotations, _meta: { ui: { visibility: ['app'] } },
}, async (_args, extra) => ({ content: [], _meta: { monitor: state(extra) } }));
server.registerTool('list_tasks', {
  title: 'List monitored tasks', description: 'List recent local tasks for the panel picker.',
  inputSchema: {}, annotations, _meta: { ui: { visibility: ['app'] } },
}, async () => ({ content: [], _meta: { tasks: [] } }));

// Separate resource: rendering a turn-end card must not change the live panel's
// display mode or replace its session. Hook results may not render in all hosts.
server.registerTool('show_turn_summary', {
  title: 'Turn-end monitor summary',
  description: 'Show a compact inline connection-test summary after a Codex turn ends. Intended for the Stop hook. This is not token telemetry.',
  inputSchema: hookInput, annotations,
  _meta: { ui: { resourceUri: summaryUri, visibility: ['app'] },
    'openai/ui': { preferredModelDisplayMode: 'inline' } },
}, async (args, extra) => {
  if (args.source === 'hook') { lastHookEvent = 'Stop'; hookSummaryRequests++; }
  return { content: [], _meta: { monitor: { ...state(extra), presentation: 'turn-summary',
    completedAt: new Date().toISOString() } } };
});

await server.connect(new StdioServerTransport());
