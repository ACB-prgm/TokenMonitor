import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
export class CollectorBridge {
  private child?: ChildProcessWithoutNullStreams;
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private buffer = '';
  private failures = 0;
  private nextRetry = 0;
  private idle?: NodeJS.Timeout;
  private fail(child: ChildProcessWithoutNullStreams, error: Error) {
    if (this.child !== child) return;
    this.child = undefined; this.buffer = ''; child.kill();
    this.nextRetry = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5));
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }
  private start() {
    if (this.child) return this.child;
    if (Date.now() < this.nextRetry) throw new Error('Collector reconnecting');
    const child = spawn(path.join(root, 'runtime/TokenMonitorCollector'), [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.on('error', () => this.fail(child, new Error('Local collector unavailable')));
    child.on('exit', () => this.fail(child, new Error('Local collector disconnected')));
    // Never forward source paths or transcript diagnostics through MCP stdout.
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      if (this.child !== child) return;
      this.buffer += data;
      if (this.buffer.length > 2 * 1024 * 1024) { this.fail(child, new Error('Collector response exceeded limit')); return; }
      let end: number;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        try {
          const response = JSON.parse(line);
          const request = this.pending.get(response.id);
          if (!request) continue;
          this.pending.delete(response.id); clearTimeout(request.timer);
          this.failures = 0; this.nextRetry = 0;
          request.resolve(response.result);
        } catch { this.fail(child, new Error('Invalid collector response')); return; }
      }
    });
    return child;
  }
  async request(method: 'catalog' | 'state', params: Record<string, unknown> = {}): Promise<any> {
    if (this.pending.size >= 32) throw new Error('Collector busy');
    const child = this.start();
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { if (!this.pending.size) this.close(); }, 60000);
    this.idle.unref();
    const id = randomUUID();
    const line = JSON.stringify({ id, method, ...params }) + '\n';
    if (Buffer.byteLength(line) > 65536) throw new Error('Collector request exceeded limit');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(child, new Error('Collector response timed out')), 10000);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(line, error => { if (error) this.fail(child, new Error('Collector connection closed')); });
    });
  }
  close() {
    clearTimeout(this.idle);
    const child = this.child;
    if (child) {
      this.fail(child, new Error('Collector stopped'));
      this.nextRetry = 0; this.failures = 0;
    }
  }
}
