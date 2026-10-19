import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { App } from '@modelcontextprotocol/ext-apps';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { fileURLToPath } from 'node:url';
import { readFile, mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const testHome = await mkdtemp(path.join(tmpdir(), 'embedded-prototype-'));
after(() => rm(testHome, { recursive: true, force: true }));
async function connectedClient(env = {}) {
  const client = new Client({ name: 'embedded-prototype-tests', version: '0.1.0' });
  const manifest = JSON.parse(await readFile(root + '/.mcp.json', 'utf8'));
  const config = manifest.mcpServers['token-monitor-embedded'];
  const transport = new StdioClientTransport({ command: config.command,
    args: config.args, cwd: path.resolve(root, config.cwd), stderr: 'pipe',
    env: { ...process.env, CODEX_HOME: testHome, ...env } });
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

test('routing capture is opt-in, exact-thread scoped, private, and bounded', async () => {
  const home = await mkdtemp(path.join(testHome, 'capture-'));
  const directory = path.join(home, 'token-monitor-embedded', 'diagnostics');
  const captureId = randomUUID(), threadId = randomUUID();
  const file = path.join(directory, `routing-${captureId}.jsonl`);
  const { client } = await connectedClient({ CODEX_HOME: home });
  const call = (name, arguments_, metadata = {}) => client.callTool({ name, arguments: arguments_, _meta: metadata });
  try {
    await call('show_turn_summary', { source: 'manual' }, { threadId });
    await assert.rejects(stat(directory), { code: 'ENOENT' });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const config = { version: 1, captureId, enabled: true, targetThreadId: threadId,
      expiresAt: new Date(Date.now() + 60000).toISOString(), maxRecords: 2 };
    await writeFile(path.join(directory, 'routing-capture.json'), JSON.stringify(config), { mode: 0o600 });
    await call('get_monitor_state', {}, { threadId });
    await call('show_turn_summary', { source: 'manual' }, { threadId: randomUUID() });
    await assert.rejects(stat(file), { code: 'ENOENT' });
    const model = await call('show_turn_summary', { source: 'manual' }, {
      threadId, callId: 'model-call', windowId: 'window-1', itemId: 'model-item',
      progressToken: 'progress-1', authorization: 'MUST_NOT_RECORD',
      'x-codex-turn-metadata': { thread_id: threadId, turn_id: 'turn-1', prompt: 'PRIVATE_PROMPT' },
    });
    const hook = await call('show_turn_summary', { source: 'hook', sessionId: threadId, turnId: 'turn-1' });
    await call('open_monitor', { source: 'manual' }, { threadId });
    const text = await readFile(file, 'utf8');
    const traces = text.trim().split('\n').map(JSON.parse);
    assert.equal(traces.length, 2);
    assert.equal(traces[0].requestMetadata.callId, 'model-call');
    assert.equal(traces[0].requestMetadata.threadId, threadId);
    assert.equal(traces[0].requestMetadata.progressToken, 'progress-1');
    assert.equal(traces[0].requestMetadata['x-codex-turn-metadata'].turn_id, 'turn-1');
    assert.equal(traces[0].httpHeaders, null);
    assert.equal(traces[0].originHint, 'manual');
    assert.equal(traces[1].originHint, 'hook');
    assert.equal(traces[1].arguments.sessionId, threadId);
    assert.doesNotMatch(text, /MUST_NOT_RECORD|PRIVATE_PROMPT/);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(model), /model-call|window-1|model-item|MUST_NOT_RECORD|PRIVATE_PROMPT/);
    assert.equal(hook._meta.monitor.hookSummaryRequests, 1);
    const helper = path.resolve(root, '../../scripts/routing_capture.py');
    const result = JSON.parse(execFileSync('python3', [helper, '--state-root', path.dirname(directory), 'compare'], { encoding: 'utf8' }));
    assert.equal(result.status, 'captured');
    assert.equal(result.onlyManual['/callId'], 'model-call');
    assert.equal(result.httpHeaders.manual, null);
    assert.equal(result.httpHeaders.hook, null);
    assert.equal(result.sameTurn, true);
    const watched = JSON.parse(execFileSync('python3', [helper, '--state-root', path.dirname(directory), 'watch', '--seconds', '1'], { encoding: 'utf8' }));
    assert.equal(watched.captureStopped, true);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'routing-capture.json'), 'utf8')).enabled, false);
    config.maxRecords = 10;
    await writeFile(path.join(directory, 'routing-capture.json'), JSON.stringify(config));
    execFileSync('python3', [helper, '--state-root', path.dirname(directory), 'stop']);
    await call('show_turn_summary', { source: 'manual' }, { threadId });
    assert.equal(await readFile(file, 'utf8'), text);
    await writeFile(path.join(directory, 'routing-capture.json'), JSON.stringify(config));
    await call('show_turn_summary', { source: 'manual' }, { threadId,
      oversized: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`field${i}`, 'x'.repeat(4096)])) });
    assert.equal(await readFile(file, 'utf8'), text);
    config.expiresAt = new Date(Date.now() - 1000).toISOString();
    await writeFile(path.join(directory, 'routing-capture.json'), JSON.stringify(config));
    await call('show_turn_summary', { source: 'manual' }, { threadId });
    assert.equal(await readFile(file, 'utf8'), text);
  } finally { await client.close(); }
});

test('routing capture failure cannot break tools or leak to stdout', async () => {
  const home = await mkdtemp(path.join(testHome, 'capture-invalid-'));
  const directory = path.join(home, 'token-monitor-embedded', 'diagnostics');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'routing-capture.json'), 'malformed JSON');
  const { client } = await connectedClient({ CODEX_HOME: home });
  try {
    const result = await client.callTool({ name: 'show_turn_summary', arguments: { source: 'manual' } });
    assert.equal(result.isError, undefined);
    assert.equal(result._meta.monitor.presentation, 'turn-summary');
  } finally { await client.close(); }
});
