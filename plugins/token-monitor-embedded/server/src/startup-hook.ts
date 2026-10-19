import { requestStartup } from './startup.js';

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
    const additionalContext = await requestStartup(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (additionalContext) process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit', additionalContext,
    } }) + '\n');
  }
} catch {
  process.stderr.write('TokenMonitor startup instruction unavailable; continuing normally.\n');
}
