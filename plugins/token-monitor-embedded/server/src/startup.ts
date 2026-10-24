import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {pluginName,serverDisplayName} from '../../shared/identity.js';

type Startup = { version: 1; sessionId: string; requestedAt?: string; launcherCalledAt?: string };
const directory = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'),
  pluginName, 'startup');

function session(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value) ? value : undefined;
}
function filename(id: string) { return path.join(directory, `${id}.json`); }

// A hard link publishes a complete record only if no other prompt/tool has
// claimed the chat. Renames atomically update acknowledgements afterwards.
async function save(record: Startup, exclusive: boolean): Promise<boolean> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
    if (exclusive) {
      try { await link(temporary, filename(record.sessionId)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error; }
    } else await rename(temporary, filename(record.sessionId));
    return true;
  } finally { await unlink(temporary).catch(() => {}); }
}

export async function startupState(value: unknown): Promise<Startup | null> {
  const id = session(value);
  if (!id) return null;
  try {
    const record = JSON.parse(await readFile(filename(id), 'utf8'));
    return record.version === 1 && record.sessionId === id ? record : null;
  } catch { return null; }
}

export async function requestStartup(event: unknown): Promise<string | undefined> {
  if (!event || typeof event !== 'object') return;
  const input = event as Record<string, unknown>;
  const id = session(input.session_id);
  // Never request panels from subagents or unrelated lifecycle events.
  if (input.hook_event_name !== 'UserPromptSubmit' || !id || input.agent_id) return;
  if (!await save({ version: 1, sessionId: id, requestedAt: new Date().toISOString() }, true)) return;
  return `The user has enabled ${serverDisplayName} automatic opening. Before working on this first prompt, call ${serverDisplayName}'s open_monitor tool once (MCP server: ${pluginName}; tool: open_monitor). Discover or load that tool if needed. Pass source: "manual" and sessionId: "${id}". This opens the expanded monitor; its UI handles subsequent refreshes. Then continue the user's request normally without asking for confirmation. If the tool is unavailable or fails, continue the user's request without shell substitutes or retries. Do not reopen on later turns or automatically call show_turn_summary. Reopen only when the user requests it. This startup instruction is issued once per chat.`;
}

// This acknowledges tool execution, not successful host rendering. Use only
// the host-supplied thread ID; caller-supplied arguments are not chat identity.
export async function acknowledgeStartup(value: unknown): Promise<void> {
  const id = session(value);
  if (!id) return;
  const record = { version: 1 as const, sessionId: id, launcherCalledAt: new Date().toISOString() };
  if (await save(record, true)) return;
  const previous = await startupState(id);
  if (previous && !previous.launcherCalledAt) await save({ ...previous, ...record }, false);
}
