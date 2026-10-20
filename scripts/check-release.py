#!/usr/bin/env python3
"""Fail early on inconsistent release metadata or incomplete plugin wiring."""
import json
from pathlib import Path
import re
import subprocess

repo = Path(__file__).resolve().parents[1]
plugin = repo / 'plugins/token-monitor-embedded'
version = (repo / 'VERSION').read_text().strip()
assert re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version)
for name in ['package.json', 'package-lock.json', '.codex-plugin/plugin.json']:
    data = json.loads((plugin / name).read_text())
    assert data['version'] == version, name
    assert data['license'] == 'PolyForm-Noncommercial-1.0.0', name
    if name == 'package-lock.json':
        assert data['packages']['']['version'] == version
        allowed = {'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'}
        for path, package in data['packages'].items():
            if path:
                assert package.get('license') in allowed, (path, package.get('license'))
for name in ['server/src/index.ts', 'ui/src/main.tsx', 'ui/src/view.tsx']:
    assert version in (plugin / name).read_text(), name
assert not (plugin / 'plugin.json').exists(), 'Keep the verified hook-compatible format'
manifest = json.loads((plugin / '.codex-plugin/plugin.json').read_text())
for name in ['mcpServers', 'hooks']:
    assert (plugin / manifest[name]).is_file()
hooks = json.loads((plugin / 'hooks/hooks.json').read_text())['hooks']
assert set(hooks) == {'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Stop', 'PreCompact', 'PostCompact'}
market = json.loads((repo / '.agents/plugins/marketplace.json').read_text())
assert market['name'] == 'tokenmonitor' and market['interface']['displayName'] == 'TokenMonitor'
entry = market['plugins'][0]
assert entry['name'] == manifest['name']
assert entry['policy'] == {'installation': 'AVAILABLE', 'authentication': 'ON_INSTALL'}
assert (repo / entry['source']['path']).resolve() == plugin.resolve()
assert (repo / 'LICENSE').read_text().startswith('# PolyForm Noncommercial License 1.0.0')
# Check tracked filenames without reading private runtime data.
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=repo).decode().split('\0')
for name in filter(None, tracked):
    assert not re.search(r'(^|/)(node_modules|sessions|archived_sessions|\.env|auth\.json)(/|$)', name), name
    assert not name.endswith(('.jsonl', '.sqlite', '.pem', '.key', '.log')), name
print('PASS: version ' + version + ', manifests, hook wiring, dependency licenses, marketplace and tracked paths')
