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
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const testHome = await mkdtemp(path.join(tmpdir(), 'embedded-prototype-'));
after(() => rm(testHome, { recursive: true, force: true }));
async function connectedClient(env = {}) {
  const client = new Client({ name: 'embedded-prototype-tests', version: '0.1.0' });
  const manifest = JSON.parse(await readFile(root + '/.mcp.json', 'utf8'));
  const config = manifest.mcpServers['token-monitor-embedded'];
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(root,'server/dist/index.mjs')], cwd: path.resolve(root, config.cwd), stderr: 'pipe',
    env: { ...process.env, CODEX_HOME: testHome, ...env } });
  await client.connect(transport);
  return { client, transport };
}

test('panel and inline summary are callable by the model; refresh tools remain app-only', async () => {
  const { client } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ['open_monitor', 'get_monitor_state', 'manage_updates', 'list_tasks', 'show_turn_summary']);
    for (const tool of tools) {
      assert.deepEqual(tool._meta.ui.visibility, ['open_monitor', 'show_turn_summary'].includes(tool.name) ? ['model', 'app'] : ['app']);
      assert.equal(tool.annotations.readOnlyHint, tool.name !== 'manage_updates');
      assert.equal(tool.annotations.openWorldHint, tool.name === 'manage_updates');
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

test('explicit inline requests have their own snapshot without changing the live panel placement', async () => {
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
    assert.equal(started._meta.monitor.presentation, 'panel');
    const stopped = await client.callTool({ name: 'show_turn_summary', arguments: { source: 'hook', sessionId: 'test-chat', turnId: 'test-turn' } });
    const frozen = JSON.stringify(stopped);
    assert.equal(stopped._meta.monitor.presentation, 'turn-summary');
    assert.ok(Number.isFinite(Date.parse(stopped._meta.monitor.completedAt)));
    assert.deepEqual(stopped.content, []);
    assert.equal(stopped.structuredContent, undefined);
    const current = await client.callTool({ name: 'get_monitor_state', arguments: {panelId: started._meta.monitor.panelId} });
    assert.equal(current._meta.monitor.panelId, started._meta.monitor.panelId);
    assert.notEqual(stopped._meta.monitor.panelId, started._meta.monitor.panelId);
    assert.equal(JSON.stringify(stopped), frozen);
    const again = await client.callTool({ name: 'open_monitor', arguments: {} });
    assert.equal(again._meta.monitor.presentation, 'panel');
    assert.equal(panel._meta['openai/ui'].preferredModelDisplayMode, 'fullscreen');
    const manual = await client.callTool({ name: 'show_turn_summary', arguments: { source: 'manual' } });
    assert.equal(manual._meta.monitor.presentation, 'turn-summary');
    assert.ok(manual._meta.monitor.panelId);
  } finally { await client.close(); }
});

test('six silent metadata command hooks include one first-prompt instruction, without Stop continuations', async () => {
  const manifest = JSON.parse(await readFile(root + '/.codex-plugin/plugin.json', 'utf8'));
  const hooks = JSON.parse(await readFile(path.resolve(root, manifest.hooks), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['PostCompact','PreCompact','SessionEnd','SessionStart','Stop','UserPromptSubmit']);
  for (const [event, groups] of Object.entries(hooks)) for (const group of groups) for (const handler of group.hooks) {
    assert.equal(handler.type, 'command'); assert.equal(handler.timeout, event==='SessionEnd'?3:10); assert.equal(handler.async, undefined);
  }
  assert.equal(hooks.UserPromptSubmit.length, 1);
  const handler = hooks.UserPromptSubmit[0].hooks[0];
  assert.equal(handler.type, 'command');
  assert.equal(handler.timeout, 10);
  assert.equal(handler.async, undefined);
  const { client } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    assert.match(tools.find(tool => tool.name === 'open_monitor').description, /first-prompt startup instruction/);
  } finally { await client.close(); }
});

async function startupHook(home, event) {
  const hooks = JSON.parse(await readFile(root + '/hooks/hooks.json', 'utf8')).hooks;
  const command = hooks.UserPromptSubmit[0].hooks[0].command;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root,'server/dist/startup-hook.mjs')], { cwd: tmpdir(),
      env: { ...process.env, NODE_NO_WARNINGS: '1', PLUGIN_ROOT: root, CODEX_HOME: home } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(typeof event === 'string' ? event : JSON.stringify(event));
  });
}

test('first-prompt instructions are atomic, once per chat, isolated, and omit prompt data', async () => {
  const home = await mkdtemp(path.join(testHome, 'startup-'));
  const id = randomUUID();
  const event = { hook_event_name: 'UserPromptSubmit', session_id: id, turn_id: 'first',
    prompt: 'PRIVATE_PROMPT', transcript_path: '/PRIVATE_TRANSCRIPT' };
  const attempts = await Promise.all(Array.from({ length: 8 }, () => startupHook(home, event)));
  assert.ok(attempts.every(result => result.code === 0 && result.stderr === ''));
  const emitted = attempts.filter(result => result.stdout);
  assert.equal(emitted.length, 1);
  const output = JSON.parse(emitted[0].stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(output.hookSpecificOutput.additionalContext, /open_monitor/);
  assert.match(output.hookSpecificOutput.additionalContext, /Discover or load/);
  assert.doesNotMatch(emitted[0].stdout, /PRIVATE_PROMPT|PRIVATE_TRANSCRIPT/);
  assert.equal(output.decision, undefined);
  const file = path.join(home, 'token-monitor-embedded/startup', `${id}.json`);
  const record = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(record.sessionId, id);
  assert.ok(record.requestedAt);
  assert.equal(record.launcherCalledAt, undefined);
  assert.deepEqual(Object.keys(record).sort(), ['requestedAt', 'sessionId', 'version']);
  if(process.platform!=='win32')assert.equal((await stat(file)).mode & 0o777, 0o600);
  if(process.platform!=='win32')assert.equal((await stat(path.dirname(file))).mode & 0o777, 0o700);
  assert.equal((await startupHook(home, { ...event, turn_id: 'second' })).stdout, '');
  assert.ok((await startupHook(home, { ...event, session_id: randomUUID() })).stdout);
});

test('launcher acknowledgement uses host identity and suppresses later requests after manual opening', async () => {
  const home = await mkdtemp(path.join(testHome, 'startup-ack-'));
  const id = randomUUID(), other = randomUUID();
  const event = { hook_event_name: 'UserPromptSubmit', session_id: id };
  await startupHook(home, event);
  const { client } = await connectedClient({ CODEX_HOME: home });
  try {
    const result = await client.callTool({ name: 'open_monitor', arguments: { source: 'manual', sessionId: other }, _meta: { threadId: id } });
    assert.ok(result._meta.monitor.startup.requestedAt);
    assert.ok(result._meta.monitor.startup.launcherCalledAt);
    await assert.rejects(stat(path.join(home, 'token-monitor-embedded/startup', `${other}.json`)), { code: 'ENOENT' });
    assert.equal((await startupHook(home, event)).stdout, '');
    await client.callTool({ name: 'open_monitor', arguments: {}, _meta: { threadId: other } });
    assert.equal((await startupHook(home, { ...event, session_id: other })).stdout, '');
  } finally { await client.close(); }
});

test('startup ignores malformed events, subagents, unsafe IDs, and oversized input', async () => {
  const home = await mkdtemp(path.join(testHome, 'startup-invalid-'));
  for (const event of ['{', null, {}, { hook_event_name: 'Stop', session_id: 'valid' },
    { hook_event_name: 'UserPromptSubmit', session_id: '../escape' },
    { hook_event_name: 'UserPromptSubmit', session_id: 'valid', agent_id: 'subagent' },
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'valid', prompt: 'x'.repeat(1024 * 1024) })]) {
    const result = await startupHook(home, event);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
  }
  await assert.rejects(stat(path.join(home, 'token-monitor-embedded')), { code: 'ENOENT' });
});

test('startup storage failures never block the prompt or break the launcher', async () => {
  const home = await mkdtemp(path.join(testHome, 'startup-blocked-'));
  await writeFile(path.join(home, 'token-monitor-embedded'), 'not a directory');
  const result = await startupHook(home, { hook_event_name: 'UserPromptSubmit', session_id: randomUUID() });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  const { client } = await connectedClient({ CODEX_HOME: home });
  try {
    const opened = await client.callTool({ name: 'open_monitor', arguments: {}, _meta: { threadId: randomUUID() } });
    assert.equal(opened._meta.monitor.presentation, 'panel');
    assert.equal(opened._meta.monitor.startup, null);
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
    const opened = await client.callTool({name:'open_monitor',arguments:{}});
    const panelId = opened._meta.monitor.panelId;
    const first = await app.callServerTool({ name: 'get_monitor_state', arguments: {panelId} });
    const next = await app.callServerTool({ name: 'get_monitor_state', arguments: {panelId,revision:first._meta.monitor.revision} });
    assert.equal(first._meta.monitor.version, 1);
    assert.equal(next._meta.monitor.unchanged, true);
    assert.deepEqual(first.content, []);
    assert.equal(messages, 0);
    assert.equal(contextUpdates, 0);
  } finally { await app.close(); await bridge.close(); await client.close(); }
});

test('host metadata diagnostics expose field shapes only', async () => {
  const { client } = await connectedClient();
  try {
    const result = await client.callTool({ name: 'open_monitor', arguments: {},
      _meta: { widget: { conversationId: 'PRIVATE_TASK_ID' }, secret: 'DO_NOT_EXPOSE', workspaces: {'/PRIVATE/workspace': {kind: 'local'}} } });
    assert.deepEqual(result._meta.monitor.metadataShape, { widget: { conversationId: 'string' }, secret: 'string', workspaces: {'[path]': {kind: 'string'}} });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TASK_ID|DO_NOT_EXPOSE|\/PRIVATE/);
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
    if(process.platform!=='win32')assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(model), /model-call|window-1|model-item|MUST_NOT_RECORD|PRIVATE_PROMPT/);
    assert.equal(hook._meta.monitor.presentation, 'turn-summary');
    const helper = path.resolve(root, '../../scripts/routing_capture.py');
    const result = JSON.parse(execFileSync(process.platform==='win32'?'python':'python3', [helper, '--state-root', path.dirname(directory), 'compare'], { encoding: 'utf8' }));
    assert.equal(result.status, 'captured');
    assert.equal(result.onlyManual['/callId'], 'model-call');
    assert.equal(result.httpHeaders.manual, null);
    assert.equal(result.httpHeaders.hook, null);
    assert.equal(result.sameTurn, true);
    const watched = JSON.parse(execFileSync(process.platform==='win32'?'python':'python3', [helper, '--state-root', path.dirname(directory), 'watch', '--seconds', '1'], { encoding: 'utf8' }));
    assert.equal(watched.captureStopped, true);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'routing-capture.json'), 'utf8')).enabled, false);
    config.maxRecords = 10;
    await writeFile(path.join(directory, 'routing-capture.json'), JSON.stringify(config));
    execFileSync(process.platform==='win32'?'python':'python3', [helper, '--state-root', path.dirname(directory), 'stop']);
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
