import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { App } from '@modelcontextprotocol/ext-apps';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
async function connectedClient() {
  const client = new Client({ name: 'embedded-prototype-tests', version: '0.1.0' });
  const manifest = JSON.parse(await readFile(root + '/.mcp.json', 'utf8'));
  const config = manifest.mcpServers['token-monitor-embedded'];
  const transport = new StdioClientTransport({ command: config.command,
    args: config.args, cwd: path.resolve(root, config.cwd), stderr: 'pipe' });
  await client.connect(transport);
  return { client, transport };
}

test('panel and inline summary are callable by the model; refresh tools remain app-only', async () => {
  const { client } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ['open_monitor', 'get_monitor_state', 'list_tasks', 'show_turn_summary']);
    for (const tool of tools) {
      assert.deepEqual(tool._meta.ui.visibility, ['open_monitor', 'show_turn_summary'].includes(tool.name) ? ['model', 'app'] : ['app']);
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.openWorldHint, false);
    }
    assert.deepEqual(tools[0]._meta['openai/ui'].entrypoints, [{ type: 'thread' }]);
    assert.equal(tools.filter(tool => tool._meta.ui.resourceUri).length, 2);
    assert.equal(tools[0]._meta['openai/ui'].preferredModelDisplayMode, 'fullscreen');
    const resource = await client.readResource({ uri: tools[0]._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.match(resource.contents[0].text, /TokenMonitor Embedded/);
    assert.deepEqual(resource.contents[0]._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    assert.deepEqual(resource.contents[0]._meta['openai/ui'], {
      availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'fullscreen',
    });
    assert.doesNotMatch(resource.contents[0].text, /<script[^>]+src=|<link[^>]+href=/);
  } finally { await client.close(); }
});

test('Stop has its own inline snapshot without changing the live panel placement', async () => {
  const { client } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    const panel = tools.find(tool => tool.name === 'open_monitor');
    const summary = tools.find(tool => tool.name === 'show_turn_summary');
    assert.equal(summary._meta['openai/ui'].entrypoints, undefined);
    assert.equal(summary._meta['openai/ui'].preferredModelDisplayMode, 'inline');
    assert.notEqual(panel._meta.ui.resourceUri, summary._meta.ui.resourceUri);
    const resource = await client.readResource({ uri: summary._meta.ui.resourceUri });
    assert.deepEqual(resource.contents[0]._meta['openai/ui'], {
      availableDisplayModes: ['inline'], preferredDisplayMode: 'inline',
    });
    assert.match(resource.contents[0].text, /data-monitor-view="summary"/);
    const started = await client.callTool({ name: 'open_monitor', arguments: { source: 'hook', sessionId: 'test-chat', turnId: 'test-turn' } });
    assert.equal(started._meta.monitor.hookOpenRequests, 1);
    assert.equal(started._meta.monitor.presentation, 'panel');
    const stopped = await client.callTool({ name: 'show_turn_summary', arguments: { source: 'hook', sessionId: 'test-chat', turnId: 'test-turn' } });
    const frozen = JSON.stringify(stopped);
    assert.equal(stopped._meta.monitor.presentation, 'turn-summary');
    assert.equal(stopped._meta.monitor.lastHookEvent, 'Stop');
    assert.equal(stopped._meta.monitor.hookSummaryRequests, 1);
    assert.ok(Number.isFinite(Date.parse(stopped._meta.monitor.completedAt)));
    assert.deepEqual(stopped.content, []);
    assert.equal(stopped.structuredContent, undefined);
    const current = await client.callTool({ name: 'get_monitor_state', arguments: {} });
    assert.equal(current._meta.monitor.hookSummaryRequests, 1);
    assert.equal(JSON.stringify(stopped), frozen);
    const again = await client.callTool({ name: 'open_monitor', arguments: {} });
    assert.equal(again._meta.monitor.presentation, 'panel');
    assert.equal(panel._meta['openai/ui'].preferredModelDisplayMode, 'fullscreen');
    const manual = await client.callTool({ name: 'show_turn_summary', arguments: { source: 'manual' } });
    assert.equal(manual._meta.monitor.presentation, 'turn-summary');
    assert.equal(manual._meta.monitor.hookSummaryRequests, 1);
  } finally { await client.close(); }
});

test('automatic display hooks use existing MCP connection and never request another turn', async () => {
  const manifest = JSON.parse(await readFile(root + '/.codex-plugin/plugin.json', 'utf8'));
  const hooks = JSON.parse(await readFile(path.resolve(root, manifest.hooks), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks), ['UserPromptSubmit', 'Stop']);
  for (const [event, tool] of [['UserPromptSubmit', 'open_monitor'], ['Stop', 'show_turn_summary']]) {
    const handler = hooks[event][0].hooks[0];
    assert.equal(handler.type, 'mcp_tool');
    assert.equal(handler.server, 'token-monitor-embedded');
    assert.equal(handler.tool, tool);
    assert.deepEqual(handler.input, { source: 'hook', sessionId: '${session_id}', turnId: '${turn_id}' });
    assert.equal(handler.timeout, 3);
    assert.equal(handler.command, undefined);
  }
});

test('MCP Apps bridge refreshes directly without sending messages or model context', async () => {
  const { client } = await connectedClient();
  // Apps SDK 2 uses the new MCP client API. Forward explicitly to our SDK 1
  // client instead of treating these different SDK interfaces as interchangeable.
  const bridge = new AppBridge(null, { name: 'test-host', version: '0.1.0' }, { serverTools: {} });
  bridge.oncalltool = async params => client.callTool(params);
  const app = new App({ name: 'test-panel', version: '0.1.0' }, {}, { autoResize: false });
  let messages = 0, contextUpdates = 0;
  bridge.onmessage = async () => { messages++; return {}; };
  bridge.onupdatemodelcontext = async () => { contextUpdates++; return {}; };
  const [hostTransport, uiTransport] = InMemoryTransport.createLinkedPair();
  try {
    await bridge.connect(hostTransport);
    await app.connect(uiTransport);
    const first = await app.callServerTool({ name: 'get_monitor_state', arguments: {} });
    const next = await app.callServerTool({ name: 'get_monitor_state', arguments: {} });
    assert.equal(first._meta.monitor.prototype, true);
    assert.equal(Number(next._meta.monitor.revision), Number(first._meta.monitor.revision) + 1);
    assert.deepEqual(first.content, []);
    assert.equal(messages, 0);
    assert.equal(contextUpdates, 0);
  } finally { await app.close(); await bridge.close(); await client.close(); }
});

test('host metadata diagnostics expose field shapes only', async () => {
  const { client } = await connectedClient();
  try {
    const result = await client.callTool({ name: 'open_monitor', arguments: {},
      _meta: { widget: { conversationId: 'PRIVATE_TASK_ID' }, secret: 'DO_NOT_EXPOSE' } });
    assert.deepEqual(result._meta.monitor.metadataShape, { widget: { conversationId: 'string' }, secret: 'string' });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TASK_ID|DO_NOT_EXPOSE/);
    assert.deepEqual(result.content, []);
    assert.equal(result.structuredContent, undefined);
  } finally { await client.close(); }
});
