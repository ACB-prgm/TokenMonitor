#!/usr/bin/env python3
"""Verify the prototype distribution independently of developer Node and node_modules."""
import hashlib
import json
from pathlib import Path
import selectors
import subprocess
import tempfile
import unittest
import zipfile

repo = Path(__file__).resolve().parents[1]

class EmbeddedArchiveTests(unittest.TestCase):
    def test_archive_runs_offline_with_bundled_runtime(self):
        manifest = json.loads((repo / 'plugins/token-monitor-embedded/.codex-plugin/plugin.json').read_text())
        archive = repo / 'dist' / ('token-monitor-embedded-' + manifest['version'] + '.zip')
        if not archive.exists():
            self.skipTest('Build the independent embedded prototype archive first')
        with tempfile.TemporaryDirectory(prefix='TokenMonitor Embedded ') as directory:
            with zipfile.ZipFile(archive) as bundle:
                for entry in bundle.infolist():
                    self.assertFalse(entry.filename.startswith('/'))
                    self.assertNotIn('..', Path(entry.filename).parts)
                    self.assertNotIn('node_modules', Path(entry.filename).parts)
                bundle.extractall(directory)
            package = Path(directory) / 'token-monitor-embedded'
            self.assertFalse((package / 'runtime/node').exists())
            self.assertTrue((package / 'runtime/node.gz').is_file())
            (package / 'runtime/TokenMonitorCollector').chmod(0o755)
            release = json.loads((package / 'release.json').read_text())
            for entry in release['files']:
                self.assertEqual(hashlib.sha256((package / entry['path']).read_bytes()).hexdigest(), entry['sha256'])
            requests = [
                {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
                    'protocolVersion': '2025-11-25', 'capabilities': {},
                    'clientInfo': {'name': 'archive-test', 'version': '1'}}},
                {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
                {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'},
                {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'open_monitor', 'arguments': {}}},
            ]
            # Root Agent Plugins manifests currently suppress command hooks in Codex.
            self.assertFalse((package / 'plugin.json').exists())
            self.assertFalse((package / 'mcp.json').exists())
            manifest = json.loads((package / '.codex-plugin/plugin.json').read_text())
            self.assertTrue(manifest['author']['name'].strip())
            self.assertTrue(manifest['requires_local_executor'])
            self.assertEqual(manifest['hooks'], './hooks/hooks.json')
            interface = manifest['interface']
            self.assertLessEqual(len(interface['shortDescription']), 30)
            self.assertEqual((package / interface['logo']).read_bytes(),
                             (repo / 'plugins/token-monitor/assets/icon.png').read_bytes())
            self.assertEqual(interface['logo'], interface['composerIcon'])
            self.assertFalse(any(package.rglob('marketplace.json')))
            config = json.loads((package / '.mcp.json').read_text())['mcpServers']['token-monitor-embedded']
            config = {**config, 'args': [arg.replace('${PLUGIN_ROOT}', str(package)) for arg in config['args']],
                      'cwd': str(package / config['cwd'])}
            # Run the actual packaged hook from an unrelated cwd with no
            # developer Node/Python on PATH. Package paths contain spaces.
            hooks = json.loads((package / 'hooks/hooks.json').read_text())['hooks']
            self.assertEqual(set(hooks), {'SessionStart','UserPromptSubmit','Stop','SessionEnd','PreCompact','PostCompact'})
            command = hooks['UserPromptSubmit'][0]['hooks'][0]['command']
            hook_env = {'PATH': '/usr/bin:/bin', 'PLUGIN_ROOT': str(package),
                        'CODEX_HOME': str(Path(directory) / 'codex-home')}
            codex_home = Path(hook_env['CODEX_HOME'])
            codex_home.mkdir()
            transcript = codex_home / 'archive.jsonl'
            transcript.write_text(json.dumps({'type':'session_meta','payload':{'id':'archive-chat','source':'cli'}}) + '\n' +
                json.dumps({'type':'event_msg','timestamp':'2026-10-19T12:00:00Z','payload':{'type':'token_count','info':{
                    'model':'gpt-6.1-sol', 'model_context_window':200000, 'last_token_usage':{'input_tokens':100000,'cached_input_tokens':80000,'cache_write_input_tokens':0,'output_tokens':100,'reasoning_output_tokens':40},
                    'total_token_usage':{'output_tokens':1000,'reasoning_output_tokens':400}}}}) + '\n')
            event = json.dumps({'hook_event_name': 'UserPromptSubmit', 'session_id': 'archive-chat',
                                'transcript_path': str(transcript), 'prompt': 'PRIVATE_PROMPT'})
            # A fresh cache is expanded and verified by the first hook invocation.
            first = subprocess.run(['/bin/sh', '-c', command], cwd=directory,
                                   env=hook_env, input=event, text=True, capture_output=True, timeout=5, check=True)
            expected = (package / 'runtime/node.sha256').read_text().strip()
            cached_node = codex_home / 'token-monitor-embedded/runtime' / expected / 'node'
            self.assertEqual(hashlib.sha256(cached_node.read_bytes()).hexdigest(), expected)
            self.assertEqual(cached_node.stat().st_mode & 0o777, 0o700)
            self.assertIn('open_monitor', json.loads(first.stdout)['hookSpecificOutput']['additionalContext'])
            self.assertNotIn('PRIVATE_PROMPT', first.stdout)
            second = subprocess.run(['/bin/sh', '-c', command], cwd=directory,
                                    env=hook_env, input=event, text=True, capture_output=True, timeout=5, check=True)
            self.assertEqual(second.stdout, '')
            launcher = ['/bin/sh', str(package / 'scripts/launch.sh'), '--node-version']
            # A damaged writable cache is rebuilt from the bundled archive.
            cached_node.write_bytes(b'not an executable')
            repaired = subprocess.run(launcher, cwd=directory, env=hook_env,
                                      capture_output=True, text=True, timeout=5, check=True)
            self.assertTrue(repaired.stdout.startswith('v24.'))
            self.assertEqual(hashlib.sha256(cached_node.read_bytes()).hexdigest(), expected)
            # Host-provided plugin storage takes precedence over CODEX_HOME.
            private_data = Path(directory) / 'plugin data'
            subprocess.run(launcher, cwd=directory, env={**hook_env, 'PLUGIN_DATA': str(private_data)},
                           capture_output=True, text=True, timeout=5, check=True)
            self.assertTrue((private_data / 'runtime' / expected / 'node').is_file())
            process = subprocess.Popen([config['command'], *config['args']],
                cwd=config['cwd'], env={'PATH': '/usr/bin:/bin', 'NODE_PATH': '', 'CODEX_HOME': str(codex_home)},
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                def call(request):
                    process.stdin.write(json.dumps(request) + '\n'); process.stdin.flush()
                    with selectors.DefaultSelector() as ready:
                        ready.register(process.stdout, selectors.EVENT_READ)
                        self.assertTrue(ready.select(timeout=5), 'Packaged MCP server response timed out')
                    return json.loads(process.stdout.readline())
                self.assertIn('result', call(requests[0]))
                process.stdin.write(json.dumps(requests[1]) + '\n'); process.stdin.flush()
                tools = call(requests[2])['result']['tools']
                self.assertEqual(len(tools), 4)
                for tool in tools:
                    self.assertEqual(tool['_meta']['ui']['visibility'],
                                     ['model', 'app'] if tool['name'] in ['open_monitor', 'show_turn_summary'] else ['app'])
                state = call(requests[3])['result']
                self.assertEqual(state['_meta']['monitor']['input'], 100000)
                self.assertEqual(state['_meta']['monitor']['outputTotals']['total'], 1000)
                self.assertEqual(state['_meta']['monitor']['outputTotals']['reasoning'], 400)
                self.assertEqual(state['_meta']['monitor']['followingMode'], 'latest-hook')
                usage = state['_meta']['monitor']['usage']
                self.assertEqual(usage['input'], 100000)
                self.assertEqual(usage['pricedCalls'], 1)
                self.assertAlmostEqual(usage['cost'], 0.049)
                self.assertTrue(usage['cumulativeMismatch'])
                self.assertEqual(usage['unpricedCalls'], 0)
                self.assertNotIn(str(codex_home), json.dumps(state))
                self.assertEqual(state['content'], [])
            finally:
                process.stdin.close()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait(timeout=5)
                errors = process.stderr.read()
                process.stdout.close(); process.stderr.close()
            self.assertEqual(process.returncode, 0, errors)

if __name__ == '__main__':
    unittest.main()
