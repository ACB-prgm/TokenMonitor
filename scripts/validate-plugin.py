#!/usr/bin/env python3
"""Repository-owned scaffold validation when the optional system validator is absent."""
import json
from pathlib import Path
import re
import sys

package = Path(sys.argv[1]).resolve()
manifest = json.loads((package / '.codex-plugin/plugin.json').read_text())
assert manifest['name'] == 'token-monitor'
assert re.fullmatch(r'\d+\.\d+\.\d+', manifest['version'])
assert isinstance(manifest['description'], str) and manifest['description'].strip()
assert manifest['skills'] == './skills/'
interface = manifest['interface']
for field in ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']:
    assert isinstance(interface[field], str) and interface[field].strip(), field
assert interface['defaultPrompt'] and all(isinstance(p, str) for p in interface['defaultPrompt'])
for field in ['composerIcon', 'logo']:
    path = (package / interface[field]).resolve()
    assert path.is_relative_to(package) and path.is_file(), field
skill = package / 'skills/token-monitor'
assert (skill / 'SKILL.md').is_file()
assert (skill / 'scripts/setup.sh').is_file()
assert (skill / 'assets/release.json').is_file()
assert (skill / 'assets/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor').is_file()
assert not (package / '.mcp.json').exists()
print('PASS: repository plugin manifest and scaffold validation.')
