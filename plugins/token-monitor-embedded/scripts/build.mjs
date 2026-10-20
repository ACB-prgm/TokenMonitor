import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(path.join(root, 'server/dist'), { recursive: true });
await mkdir(path.join(root, 'ui/dist'), { recursive: true });
const ui = await build({
  entryPoints: [path.join(root, 'ui/src/main.tsx')], bundle: true,
  platform: 'browser', format: 'iife', target: 'es2022', write: false,
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true,
});
const script = ui.outputFiles[0].text.replaceAll('</script', '<\\/script');
for (const view of ['panel', 'summary']) {
await writeFile(path.join(root, `ui/dist/${view}.html`), `<!doctype html>
<html lang="en" data-monitor-view="${view}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TokenMonitor Embedded</title><style>${await readFile(path.join(root, 'ui/src/style.css'), 'utf8')}</style></head>
<body><div id="root"></div><script>${script}</script></body></html>`);
}
for (const entry of ['index', 'startup-hook', 'hook', 'panels', 'collector', 'parser', 'metrics', 'platform', 'tail']) await build({
  entryPoints: [path.join(root, `server/src/${entry}.ts`)], bundle: true,
  platform: 'node', format: 'esm', target: 'node24',
  outfile: path.join(root, `server/dist/${entry}.mjs`),
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});
console.log('Built portable telemetry modules, embedded panel, and MCP server.');
