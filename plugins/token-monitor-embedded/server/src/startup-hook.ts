import { requestStartup } from './startup.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Command hook: consume the event without retaining prompt/transcript data.
// Oversized/malformed events and state failures never block the user's task.
try {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024 * 1024) { process.stdin.destroy(); break; }
    chunks.push(chunk);
  }
  if (size <= 1024 * 1024) {
    const input = Buffer.concat(chunks);
    // Every prompt updates telemetry metadata, even after the one-time startup
    // instruction is consumed. The helper is silent and never opens a window.
    spawnSync(fileURLToPath(new URL('../../runtime/TokenMonitorCollector', import.meta.url)), ['--hook'],
      { input, timeout: 1500, stdio: ['pipe', 'ignore', 'ignore'] });
    const additionalContext = await requestStartup(JSON.parse(input.toString('utf8')));
    if (additionalContext) process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit', additionalContext,
    } }) + '\n');
  }
} catch {
  process.stderr.write('TokenMonitor startup instruction unavailable; continuing normally.\n');
}
