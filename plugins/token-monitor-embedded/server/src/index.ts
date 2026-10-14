import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

const root = fileURLToPath(new URL('../..', import.meta.url));
const resourceUri = 'ui://token-monitor-embedded/panel.html';
const server = new McpServer({ name: 'token-monitor-embedded', version: '0.1.0' });
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
let revision = 0;

// Record field names only. Never log host IDs, prompts, arguments, or metadata values.
function metadataShape(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return 'array';
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key, metadataShape(item, depth + 1)]));
}
function state(extra: { _meta?: unknown }) {
  return { version: 1, prototype: true, revision: String(++revision),
    refreshedAt: new Date().toISOString(), metadataShape: metadataShape(extra._meta ?? {}),
    status: 'UI-only refresh connected. This is a feasibility prototype, not token telemetry.' };
}

server.registerResource('monitor-panel', resourceUri, {}, async () => ({ contents: [{
  uri: resourceUri, mimeType: 'text/html;profile=mcp-app',
  text: await readFile(path.join(root, 'ui/dist/panel.html'), 'utf8'),
  _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
}] }));
server.registerTool('open_monitor', {
  title: 'TokenMonitor Embedded', description: 'Open the local token monitor panel.',
  inputSchema: {}, annotations,
  _meta: { ui: { resourceUri, visibility: ['app'] },
    'openai/ui': { entrypoints: [{ type: 'thread' }] } },
}, async (_args, extra) => ({ content: [], _meta: { monitor: state(extra) } }));
server.registerTool('get_monitor_state', {
  title: 'Refresh monitor', description: 'Refresh panel data without a model turn.',
  inputSchema: { taskId: z.string().max(200).optional(), revision: z.string().max(100).optional() },
  annotations, _meta: { ui: { visibility: ['app'] } },
}, async (_args, extra) => ({ content: [], _meta: { monitor: state(extra) } }));
server.registerTool('list_tasks', {
  title: 'List monitored tasks', description: 'List recent local tasks for the panel picker.',
  inputSchema: {}, annotations, _meta: { ui: { visibility: ['app'] } },
}, async () => ({ content: [], _meta: { tasks: [] } }));

await server.connect(new StdioServerTransport());
