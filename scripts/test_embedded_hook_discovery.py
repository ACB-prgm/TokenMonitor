#!/usr/bin/env python3
"""Verify real Codex discovers packaged hooks without executing or trusting them."""
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import tempfile
import time
import unittest
import zipfile

REPO = Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which('codex'), 'Codex runtime is required for hook discovery')
class EmbeddedHookDiscoveryTests(unittest.TestCase):
    def test_release_hooks_are_discovered_as_untrusted_plugin_hooks(self):
        manifest = json.loads((REPO / 'plugins/token-monitor-embedded/.codex-plugin/plugin.json').read_text())
        name, version = manifest['name'], manifest['version']
        archive = REPO / 'dist' / f'{name}-{version}-macos-arm64.zip'
        self.assertTrue(archive.is_file(), 'Build the release archive first')
        with tempfile.TemporaryDirectory(prefix='embedded-hook-discovery-') as directory:
            root = Path(directory)
            home = root / 'home'
            plugin = home / 'plugins/cache/hook-test' / name / version
            plugin.mkdir(parents=True)
            with zipfile.ZipFile(archive) as bundle:
                self.assertNotIn(f'{name}/plugin.json', bundle.namelist(), 'Portable manifest shadows hook support')
                for relative in ['.codex-plugin/plugin.json', 'hooks/hooks.json']:
                    target = plugin / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(bundle.read(f'{name}/{relative}'))
            # Only manifests are copied: no hook executable can run during this test.
            (root / '.agents/plugins').mkdir(parents=True)
            (root / '.agents/plugins/marketplace.json').write_text(json.dumps({
                'name': 'hook-test', 'plugins': [{'name': name, 'source': {'source': 'local', 'path': './fixture'}}]}))
            (home / 'config.toml').write_text(f'[features]\nhooks = true\nplugins = true\n[plugins."{name}@hook-test"]\nenabled = true\n')
            with (root / 'stderr.log').open('w+') as errors:
                process = subprocess.Popen(['codex', 'app-server', '--stdio'], cwd=root,
                    env={**os.environ, 'CODEX_HOME': str(home)}, stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE, stderr=errors, text=True)
                try:
                    def call(identifier, method, params):
                        process.stdin.write(json.dumps({'id': identifier, 'method': method, 'params': params}) + '\n')
                        process.stdin.flush()
                        deadline = time.monotonic() + 15
                        while time.monotonic() < deadline:
                            with selectors.DefaultSelector() as ready:
                                ready.register(process.stdout, selectors.EVENT_READ)
                                if not ready.select(timeout=1):
                                    continue
                            line = process.stdout.readline()
                            self.assertTrue(line, 'Codex app-server exited')
                            response = json.loads(line)
                            if response.get('id') == identifier:
                                self.assertNotIn('error', response)
                                return response['result']
                        self.fail(f'Timed out reading {method}')
                    call(1, 'initialize', {'clientInfo': {'name': 'embedded-hook-test', 'version': '1'},
                                          'capabilities': {'experimentalApi': True}})
                    result = call(2, 'hooks/list', {'cwds': [str(root)]})
                    found = [hook for item in result['data'] for hook in item['hooks']
                             if hook.get('pluginId') == f'{name}@hook-test']
                    self.assertEqual({hook['eventName'] for hook in found},
                        {'preCompact', 'postCompact', 'sessionStart', 'sessionEnd', 'userPromptSubmit', 'stop'})
                    self.assertEqual(len(found), 6)
                    self.assertTrue(all(hook['source'] == 'plugin' and hook['trustStatus'] == 'untrusted' for hook in found))
                    self.assertTrue(all(not item['errors'] and not item['warnings'] for item in result['data']), json.dumps([{'errors': item['errors'], 'warnings': item['warnings']} for item in result['data']]))
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=3)
                    process.stdin.close()
                    process.stdout.close()

if __name__ == '__main__':
    unittest.main()
