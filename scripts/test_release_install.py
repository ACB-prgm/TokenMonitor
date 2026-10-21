#!/usr/bin/env python3
"""Exercise packaged installs and actual Git marketplace refresh in disposable profiles.
The prior version is a synthetic runnable package, not the published 1.4.0 release.
"""
import hashlib
import http.server
import json
import os
from pathlib import Path
import platform
import queue
import shutil
import subprocess
import tempfile
import threading
import unittest
import zipfile

REPO = Path(__file__).resolve().parents[1]
TARGET = os.environ.get('TOKENMONITOR_TEST_TARGET') or ('windows' if os.name == 'nt' else 'macos') + '-' + ('arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x64')
VERSION = (REPO / 'VERSION').read_text().strip()
PRIOR = '0.0.0-install-fixture'


def unpack(root):
    archive = REPO / 'dist' / f'token-monitor-{VERSION}-{TARGET}.zip'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == archive.with_suffix('.zip.sha256').read_text().split()[0]
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        for entry in bundle.infolist():
            assert not entry.filename.startswith('/') and '..' not in Path(entry.filename).parts
        bundle.extractall(root)
    return root / 'TokenMonitor'


def prior_package(source, destination):
    shutil.copytree(source, destination)
    plugin = destination / 'plugins/token-monitor-embedded'
    for relative in ['.codex-plugin/plugin.json', 'server/dist/index.mjs', 'ui/dist/panel.html', 'ui/dist/summary.html']:
        f = plugin / relative
        f.write_text(f.read_text().replace(VERSION, PRIOR))
    f = plugin / 'release.json'
    release = json.loads(f.read_text())
    release['version'] = PRIOR
    for entry in release['files']:
        entry['sha256'] = hashlib.sha256((plugin / entry['path']).read_bytes()).hexdigest()
    f.write_text(json.dumps(release))


def mcp_version(plugin, env):
    config = json.loads((plugin / '.mcp.json').read_text())['mcpServers']['token-monitor-embedded']
    args = [str(plugin / a) if a.startswith('./') else a for a in config['args']]
    p = subprocess.Popen([config['command'], *args], cwd=plugin.parent.parent, env=env,
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    lines = queue.Queue()
    reader = threading.Thread(target=lambda: [lines.put(line) for line in p.stdout], daemon=True)
    reader.start()
    try:
        p.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'release-install-test', 'version': '1'}}}) + '\n')
        p.stdin.flush()
        response = json.loads(lines.get(timeout=15))
        return response['result']['serverInfo']['version']
    finally:
        p.stdin.close()
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait(timeout=5)
        reader.join(timeout=2)
        p.stdout.close()
        p.stderr.close()


@unittest.skipUnless(shutil.which('codex'), 'Codex CLI required; desktop rendering/trust is a separate test')
class ReleaseInstallTests(unittest.TestCase):
    def setup_profile(self, root):
        home = root / 'profile'
        home.mkdir()
        cli = Path(shutil.which('codex')).resolve()
        if cli.suffix.lower() == '.cmd':
            cli = cli.parent / 'node_modules/@openai/codex/bin/codex.js'
        env = {**os.environ, 'CODEX_HOME': str(home), 'CODEX_CLI_PATH': str(cli)}
        # Test commands may use the development Node; the packaged helper uses its bundled Node.
        prefix = [shutil.which('node'), str(cli)] if cli.suffix == '.js' else [str(cli)]
        def codex(*args):
            r = subprocess.run([*prefix, 'plugin', *args], cwd=root, env=env, capture_output=True, text=True, timeout=60)
            self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
            return r.stdout
        return home, env, codex

    def installed(self, home):
        return [(p.parent.parent, json.loads(p.read_text())['version']) for p in (home / 'plugins/cache').rglob('.codex-plugin/plugin.json')]

    def test_clean_install_update_rollback_remove(self):
        with tempfile.TemporaryDirectory(prefix='TokenMonitor clean install ') as temporary:
            root = Path(temporary)
            source = unpack(root)
            old = root / 'previous release/TokenMonitor'
            prior_package(source, old)
            home, env, codex = self.setup_profile(root)
            def install(folder, verify=False):
                args = ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(folder / 'install.ps1')] if os.name == 'nt' else ['/bin/sh', str(folder / 'install.sh')]
                if verify:
                    args.append('-VerifyOnly' if os.name == 'nt' else '--verify-only')
                r = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=90)
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            install(old, True)
            self.assertFalse(self.installed(home))
            install(old)
            plugin = next(p for p, v in self.installed(home) if v == PRIOR)
            self.assertEqual(mcp_version(plugin, env), PRIOR)
            state = home / 'token-monitor-embedded'
            state.mkdir(exist_ok=True)
            (state / 'history-test').write_text('retain historical telemetry')
            updates = state / 'updates'
            updates.mkdir(exist_ok=True)
            (updates / 'preferences.json').write_text(json.dumps({'automatic': False, 'dismissedVersion': '9.0.0'}))
            install(source)
            plugin = next(p for p, v in self.installed(home) if v == VERSION)
            self.assertEqual(mcp_version(plugin, env), VERSION)
            # Execute all six installed hook commands, without trusting hooks or creating a model turn.
            hooks = json.loads((plugin / 'hooks/hooks.json').read_text())['hooks']
            self.assertEqual(len(hooks), 6)
            for event, groups in hooks.items():
                command = groups[0]['hooks'][0]['command']
                args = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command] if os.name == 'nt' else ['/bin/sh', '-c', command]
                r = subprocess.run(args, cwd=root, env={**env, 'PLUGIN_ROOT': str(plugin)},
                                   input=json.dumps({'hook_event_name': event, 'session_id': 'installed-' + event}),
                                   capture_output=True, text=True, timeout=15)
                self.assertEqual(r.returncode, 0, r.stderr)
                if event == 'UserPromptSubmit':
                    self.assertIn('open_monitor', r.stdout)
            self.assertEqual((state / 'history-test').read_text(), 'retain historical telemetry')
            self.assertFalse(json.loads((updates / 'preferences.json').read_text())['automatic'])
            install(old)  # Explicit rollback uses the same installer and retained extraction.
            plugin = next(p for p, v in self.installed(home) if v == PRIOR)
            self.assertEqual(mcp_version(plugin, env), PRIOR)
            codex('remove', 'token-monitor-embedded@tokenmonitor')
            codex('marketplace', 'remove', 'tokenmonitor')
            self.assertEqual((state / 'history-test').read_text(), 'retain historical telemetry')
            self.assertTrue((updates / 'preferences.json').exists())
            print(f'Clean install {PRIOR} -> {VERSION} -> rollback; six hooks execute; user state retained: {TARGET}')

    @unittest.skipUnless(shutil.which('git'), 'Git required for native marketplace refresh probe')
    def test_git_marketplace_upgrade_observation(self):
        with tempfile.TemporaryDirectory(prefix='TokenMonitor Git upgrade ') as temporary:
            root = Path(temporary)
            source = unpack(root)
            work = root / 'work'
            prior_package(source, work)
            def git(*args, cwd=work):
                return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.STDOUT, text=True, timeout=60)
            git('init', '-b', 'stable')
            git('add', '.')
            git('-c', 'user.name=Package Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Synthetic prior package')
            bare = root / 'catalog.git'
            git('clone', '--bare', str(work), str(bare), cwd=root)
            git('--git-dir', str(bare), 'update-server-info', cwd=root)
            class Handler(http.server.SimpleHTTPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=str(root), **kwargs)
                def log_message(self, *args):
                    pass
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                home, env, codex = self.setup_profile(root)
                url = f'http://127.0.0.1:{server.server_port}/catalog.git'
                codex('marketplace', 'add', url, '--ref', 'stable')
                codex('add', 'token-monitor-embedded@tokenmonitor')
                plugin = next(p for p, v in self.installed(home) if v == PRIOR)
                self.assertEqual(mcp_version(plugin, env), PRIOR)
                shutil.copytree(source / 'plugins', work / 'plugins', dirs_exist_ok=True)
                git('add', '.')
                git('-c', 'user.name=Package Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Current package')
                git('--git-dir', str(bare), 'fetch', str(work), 'stable:stable', cwd=root)
                git('--git-dir', str(bare), 'update-server-info', cwd=root)
                result = codex('marketplace', 'upgrade', 'tokenmonitor', '--json')
                versions = {v for p, v in self.installed(home)}
                refreshed = VERSION in versions
                if not refreshed:
                    codex('add', 'token-monitor-embedded@tokenmonitor')
                plugin = next(p for p, v in self.installed(home) if v == VERSION)
                self.assertEqual(mcp_version(plugin, env), VERSION)
                print(f'Git refresh observation: refresh_installed_current={refreshed}; new MCP connection={VERSION}; CLI={subprocess.check_output([shutil.which("codex"), "--version"], text=True).strip()}; result={result.strip()}')
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=3)

if __name__ == '__main__':
    unittest.main()
