#!/usr/bin/env python3
"""Synchronize the active release metadata; legacy native history is unchanged."""
import json
from pathlib import Path
import re
import sys

repo = Path(__file__).resolve().parents[1]
version = sys.argv[1] if len(sys.argv) == 2 else ''
if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
    raise SystemExit('Usage: python3 scripts/set-version.py MAJOR.MINOR.PATCH')
plugin = repo / 'plugins/token-monitor-embedded'
old = json.loads((plugin / 'package.json').read_text())['version']
(repo / 'VERSION').write_text(version + '\n')
for name in ['package.json', 'package-lock.json', '.codex-plugin/plugin.json']:
    path = plugin / name
    data = json.loads(path.read_text())
    data['version'] = version
    if name == 'package-lock.json':
        data['packages']['']['version'] = version
    path.write_text(json.dumps(data, indent=2) + '\n')
for name in ['server/src/index.ts', 'ui/src/main.tsx', 'ui/src/view.tsx']:
    path = plugin / name
    path.write_text(path.read_text().replace(old, version))
path = plugin / 'README.md'
path.write_text(re.sub(r'^# TokenMonitor Embedded \S+', '# TokenMonitor Embedded ' + version, path.read_text()))
print('Synchronized active version ' + version)
