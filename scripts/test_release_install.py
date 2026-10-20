#!/usr/bin/env python3
"""Install and update the real release marketplace using an isolated Codex profile."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

repo = Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which('codex'), 'Codex CLI required; this is not a desktop rendering test')
class ReleaseInstallTests(unittest.TestCase):
    def test_clean_profile_install_update_remove(self):
        version = (repo / 'VERSION').read_text().strip()
        archive = repo / 'dist' / f'token-monitor-{version}-macos-arm64.zip'
        self.assertTrue(archive.exists(), 'Build the release before testing installation')
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(),
                         archive.with_suffix('.zip.sha256').read_text().split()[0])
        with tempfile.TemporaryDirectory(prefix='TokenMonitor clean install ') as temporary:
            root = Path(temporary)
            with zipfile.ZipFile(archive) as bundle:
                self.assertIsNone(bundle.testzip())
                for entry in bundle.infolist():
                    self.assertFalse(entry.filename.startswith('/'))
                    self.assertNotIn('..', Path(entry.filename).parts)
                bundle.extractall(root)
            source = root / 'TokenMonitor'
            (root / 'profile').mkdir()
            env = {**os.environ, 'CODEX_HOME': str(root / 'profile')}
            def codex(*args):
                result = subprocess.run(['codex', 'plugin', *args], cwd=root, env=env,
                                        capture_output=True, text=True, timeout=45)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                return result.stdout
            codex('marketplace', 'add', str(source))
            codex('add', 'token-monitor-embedded@tokenmonitor')
            home = root / 'profile'
            installed = list((home / 'plugins/cache').rglob('.codex-plugin/plugin.json'))
            self.assertTrue(installed)
            plugin = installed[0].parent.parent
            self.assertEqual(json.loads(installed[0].read_text())['version'], version)
            for relative in ['runtime/node.gz', 'runtime/TokenMonitorCollector',
                             'ui/dist/panel.html', 'server/dist/index.mjs', 'LICENSE', 'NOTICE']:
                self.assertTrue((plugin / relative).is_file(), relative)
            # Execute the installed hook from a different cwd; no real chat or trust changes.
            event = json.dumps({'hook_event_name': 'UserPromptSubmit', 'session_id': 'clean-install'})
            command = json.loads((plugin / 'hooks/hooks.json').read_text())['hooks']['UserPromptSubmit'][0]['hooks'][0]['command']
            result = subprocess.run(['/bin/sh', '-c', command], cwd=root,
                env={**env, 'PLUGIN_ROOT': str(plugin), 'PATH': '/usr/bin:/bin'}, input=event,
                capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('open_monitor', result.stdout)
            state = home / 'token-monitor-embedded' / 'user-settings-test'
            state.parent.mkdir(exist_ok=True)
            state.write_text('retain')
            # Repeat documented update path, including a new version-directory source.
            replacement = root / 'new version' / 'TokenMonitor'
            shutil.copytree(source, replacement)
            codex('marketplace', 'remove', 'tokenmonitor')
            codex('marketplace', 'add', str(replacement))
            codex('add', 'token-monitor-embedded@tokenmonitor')
            self.assertEqual(state.read_text(), 'retain')
            codex('remove', 'token-monitor-embedded@tokenmonitor')
            codex('marketplace', 'remove', 'tokenmonitor')
            self.assertEqual(state.read_text(), 'retain')

if __name__ == '__main__':
    unittest.main()
