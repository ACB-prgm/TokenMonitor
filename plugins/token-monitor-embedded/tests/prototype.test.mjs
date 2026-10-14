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

test('local server advertises only app-visible tools and one thread panel', async () => {
  const { client } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ['open_monitor', 'get_monitor_state', 'list_tasks']);
    for (const tool of tools) {
      assert.deepEqual(tool._meta.ui.visibility, ['app']);
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.openWorldHint, false);
    }
    assert.deepEqual(tools[0]._meta['openai/ui'].entrypoints, [{ type: 'thread' }]);
    assert.equal(tools.filter(tool => tool._meta.ui.resourceUri).length, 1);
    const resource = await client.readResource({ uri: tools[0]._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.match(resource.contents[0].text, /TokenMonitor Embedded/);
    assert.deepEqual(resource.contents[0]._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    assert.doesNotMatch(resource.contents[0].text, /<script[^>]+src=|<link[^>]+href=/);
  } finally { await client.close(); }
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
