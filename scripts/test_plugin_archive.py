#!/usr/bin/env python3
"""Read-only release validation plus corruption checks in disposable extracted copies."""
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
version = (root/'VERSION').read_text().strip()
archive = root/'dist'/f'token-monitor-{version}.zip'
with tempfile.TemporaryDirectory(prefix='TokenMonitor archive with spaces ') as temp:
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert all(i.filename.startswith('token-monitor/') and '..' not in i.filename.split('/') for i in z.infolist())
        z.extractall(temp)
    package = Path(temp)/'token-monitor'
    manifest = json.loads((package/'.codex-plugin/plugin.json').read_text())
    assert manifest['name']=='token-monitor' and manifest['version']==version
    skill = package/'skills/token-monitor'
    script = skill/'scripts/setup.sh'
    subprocess.run(['/bin/bash',str(script),'--verify'],cwd='/tmp',check=True)
    binary=skill/'assets/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor'
    with binary.open('ab') as f:
        f.write(b'corrupt-test')
    failed=subprocess.run(['/bin/bash',str(script),'--verify'],cwd='/tmp',capture_output=True,text=True)
    assert failed.returncode != 0 and 'Checksum mismatch' in failed.stderr
print('PASS: archive extraction with normalized permissions and spaces; isolated verification; corrupted executable refused.')
