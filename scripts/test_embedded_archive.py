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
        manifest = json.loads((repo / 'plugins/token-monitor-embedded/plugin.json').read_text())
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
            node = package / 'runtime/node'
            node.chmod(0o755)
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
            portable = json.loads((package / 'plugin.json').read_text())
            self.assertEqual(portable['$schema'], 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
            legacy = json.loads((package / '.codex-plugin/plugin.json').read_text())
            self.assertEqual((portable['name'], portable['version']), (legacy['name'], legacy['version']))
            extension = portable['extensions']['com.openai']
            self.assertEqual(extension['interface'], legacy['interface'])
            self.assertTrue(extension['requires_local_executor'])
            self.assertEqual(extension['hooks'], './hooks/hooks.json')
            self.assertLessEqual(len(extension['interface']['shortDescription']), 30)
            icon = (package / extension['interface']['logo']).read_bytes()
            self.assertEqual(icon, (repo / 'plugins/token-monitor/assets/icon.png').read_bytes())
            self.assertEqual(extension['interface']['logo'], extension['interface']['composerIcon'])
            self.assertFalse(any(package.rglob('marketplace.json')))
            mcp = json.loads((package / 'mcp.json').read_text())
            self.assertEqual(mcp['$schema'], 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json')
            config = mcp['mcpServers']['token-monitor-embedded']
            self.assertEqual(config['type'], 'stdio')
            config = {**config, 'args': [arg.replace('${PLUGIN_ROOT}', str(package)) for arg in config['args']],
                      'cwd': config['cwd'].replace('${PLUGIN_ROOT}', str(package))}
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
            first = subprocess.run(['/bin/sh', '-c', command], cwd=directory,
                                   env=hook_env, input=event, text=True, capture_output=True, timeout=5, check=True)
            self.assertIn('open_monitor', json.loads(first.stdout)['hookSpecificOutput']['additionalContext'])
            self.assertNotIn('PRIVATE_PROMPT', first.stdout)
            second = subprocess.run(['/bin/sh', '-c', command], cwd=directory,
                                    env=hook_env, input=event, text=True, capture_output=True, timeout=5, check=True)
            self.assertEqual(second.stdout, '')
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
