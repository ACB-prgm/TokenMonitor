import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const stateRoot = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'token-monitor-embedded');
const directory = path.join(stateRoot, 'diagnostics');
const controlFile = path.join(directory, 'routing-capture.json');
const maxFileBytes = 256 * 1024;
const maxRecordBytes = 32 * 1024;
let warned = false;

type Extra = { _meta?: unknown; requestId?: string | number; sessionId?: string;
  requestInfo?: { headers: unknown } };
type Args = { source?: 'manual' | 'hook'; sessionId?: string; turnId?: string | null };
type Control = { version: 1; captureId: string; enabled: boolean; targetThreadId: string;
  expiresAt: string; maxRecords: number };

// Values are captured only in an explicitly armed, scoped diagnostic. Never
// record prompts, authInfo, credentials, or arbitrary tool arguments.
function scrub(value: unknown, key = '', depth = 0): unknown {
  if (key !== 'progressToken' && /authorization|cookie|token|secret|credential|password|api.?key|^(prompt|messages?|transcript|instructions?)$/i.test(key)) return '[REDACTED]';
  if (depth > 8) return '[DEPTH LIMIT]';
  if (typeof value === 'string') return value.length > 4096 ? value.slice(0, 4096) + '[TRUNCATED]' : value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 64).map(v => scrub(v, '', depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 64)
    .map(([name, item]) => [name.slice(0, 512), scrub(item, name, depth + 1)]));
  return null;
}

async function control(): Promise<Control | null> {
  const stat = await lstat(controlFile);
  if (!stat.isFile() || stat.size > 4096) return null;
  const value = JSON.parse(await readFile(controlFile, 'utf8')) as Control;
  const expires = Date.parse(value.expiresAt);
  if (value.version !== 1 || !value.enabled || !/^[0-9a-f-]{36}$/i.test(value.captureId)
      || typeof value.targetThreadId !== 'string' || !value.targetThreadId
      || !Number.isInteger(value.maxRecords) || value.maxRecords < 1 || value.maxRecords > 64
      || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 60 * 60 * 1000) return null;
  return value;
}

export async function recordRouting(tool: string, args: Args, extra: Extra): Promise<void> {
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  let lockFile: string | undefined;
  try {
    const armed = await control();
    if (!armed) return;
    const meta = extra._meta as Record<string, unknown> | undefined;
    const turnMeta = meta?.['x-codex-turn-metadata'] as Record<string, unknown> | undefined;
    // Use explicit thread identity, never titles, workspaces, or timing.
    const thread = meta?.threadId ?? meta?.thread_id ?? turnMeta?.thread_id ?? args.sessionId;
    if (thread !== armed.targetThreadId) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    lockFile = path.join(directory, `.routing-${armed.captureId}.lock`);
    lock = await open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const file = path.join(directory, `routing-${armed.captureId}.jsonl`);
    let bytes = 0, count = 0;
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size >= maxFileBytes) return;
      bytes = stat.size;
      count = (await readFile(file, 'utf8')).split('\n').filter(Boolean).length;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (count >= armed.maxRecords || Date.now() >= Date.parse(armed.expiresAt)) return;
    const record = { version: 1, captureId: armed.captureId, recordedAt: new Date().toISOString(),
      processId: process.pid, tool, originHint: args.source ?? 'unspecified',
      requestId: extra.requestId ?? null, transport: 'stdio', transportSessionId: extra.sessionId ?? null,
      arguments: { source: args.source ?? null, sessionId: args.sessionId ?? null, turnId: args.turnId ?? null },
      requestMetadata: scrub(extra._meta ?? {}),
      httpHeaders: extra.requestInfo ? scrub(extra.requestInfo.headers) : null };
    const line = JSON.stringify(record) + '\n';
    // Skip oversized records rather than claim a partial record is an exact capture.
    if (Buffer.byteLength(line) > maxRecordBytes || bytes + Buffer.byteLength(line) > maxFileBytes) return;
    const output = await open(file, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await output.chmod(0o600); await output.writeFile(line); } finally { await output.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // No configuration means tracing is off. A competing writer can capture
    // the next request; tracing must never break the MCP tool or a hook.
    if (code !== 'ENOENT' && code !== 'EEXIST' && !warned) {
      warned = true;
      process.stderr.write('TokenMonitor: routing capture unavailable; tool execution continues.\n');
    }
  } finally {
    if (lock) { await lock.close().catch(() => {}); await unlink(lockFile!).catch(() => {}); }
  }
}
