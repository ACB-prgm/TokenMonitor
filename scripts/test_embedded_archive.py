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
        archive = repo / 'dist' / ('token-monitor-embedded-' + manifest['version'] + '-prototype.zip')
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
            release = json.loads((package / 'release.json').read_text())
            for entry in release['files']:
                self.assertEqual(hashlib.sha256((package / entry['path']).read_bytes()).hexdigest(), entry['sha256'])
            requests = [
                {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
                    'protocolVersion': '2025-11-25', 'capabilities': {},
                    'clientInfo': {'name': 'archive-test', 'version': '1'}}},
                {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
                {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'},
                {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'get_monitor_state', 'arguments': {}}},
            ]
            config = json.loads((package / '.mcp.json').read_text())['mcpServers']['token-monitor-embedded']
            self.assertNotIn('${PLUGIN_ROOT}', json.dumps(config))
            process = subprocess.Popen([config['command'], *config['args']],
                cwd=package / config['cwd'], env={'PATH': '/usr/bin:/bin', 'NODE_PATH': ''},
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
                self.assertTrue(state['_meta']['monitor']['prototype'])
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
