#!/usr/bin/env python3
"""Package the independently versioned embedded monitor without developer dependencies."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

repo = Path(__file__).resolve().parents[1]
source = repo / 'plugins/token-monitor-embedded'
manifest = json.loads((source / 'plugin.json').read_text())
version = manifest['version']
output = repo / 'dist/token-monitor-embedded'
if output.exists():
    shutil.rmtree(output)
output.mkdir(parents=True)
for name in ['plugin.json', 'mcp.json', 'assets', '.codex-plugin', '.mcp.json', 'hooks', 'scripts/launch.sh', 'server/dist', 'ui/dist', 'runtime', 'README.md', 'VALIDATION.md']:
    src, dest = source / name, output / name
    if src.is_dir():
        shutil.copytree(src, dest)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)

# Include licenses for the bundled SDK/UI dependency graph. No dependency code
# or package-manager paths are included in this notice file.
notices = []
for package in sorted((source / 'node_modules').glob('**/package.json')):
    if package.parent.name == 'node_modules':
        continue
    info = json.loads(package.read_text())
    licenses = [p for p in package.parent.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING'))]
    if licenses:
        notices.append(f"{info.get('name', package.parent.name)} {info.get('version', '')}\n" +
                       '\n'.join(p.read_text(errors='replace') for p in licenses))
(output / 'THIRD-PARTY-NOTICES.txt').write_text('\n\n---\n\n'.join(notices))

files = []
for path in sorted(output.rglob('*')):
    if path.is_symlink() or (not path.is_file() and not path.is_dir()):
        raise SystemExit('Unsupported package member')
    if path.is_file():
        if path.name != 'node' and b'/Users/' in path.read_bytes():
            raise SystemExit('Personal home path found in package: ' + str(path.relative_to(output)))
        files.append({'path': path.relative_to(output).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
pin = json.loads((source / 'scripts/runtime.json').read_text())
(output / 'release.json').write_text(json.dumps({'version': version, 'stage': 'private-desktop-plugin',
    'architecture': 'arm64', 'minimumOS': '13.5', 'nodeVersion': pin['version'], 'files': files}, indent=2) + '\n')
subprocess.run([str(output / 'runtime/node'), '--version'], check=True)
archive = repo / 'dist' / f'token-monitor-embedded-{version}.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(output.rglob('*')):
        if path.is_file():
            bundle.write(path, 'token-monitor-embedded/' + path.relative_to(output).as_posix())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(digest + '  ' + archive.name + '\n')
print('Packaged ' + str(archive))
