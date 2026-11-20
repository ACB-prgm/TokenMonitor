import {cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const skill = 'skills/token-monitor-help';

export async function copyPluginHelp(pluginRoot) {
  const destination = path.join(pluginRoot, skill);
  await cp(path.join(repo, 'plugins/token-monitor-embedded', skill), destination, {recursive: true});
  for (const reference of [
    'docs/guides/using-token-monitor.md',
    'docs/guides/installation.md',
    'docs/reference/dashboard.md',
    'docs/reference/account-allowances.md',
    'docs/reference/efficiency-metrics.md',
    'docs/reference/compaction.md',
    'docs/reference/history-storage.md',
    'pricing.json',
  ]) {
    await cp(path.join(repo, reference), path.join(destination, 'references', reference));
  }
}
