#!/usr/bin/env python3
"""Build the standalone plugin plus a complete release marketplace from this checkout."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile

repo = Path(__file__).resolve().parents[1]
plugin = repo / 'plugins/token-monitor-embedded'
def run(*args, cwd=repo):
    subprocess.run(args, cwd=cwd, check=True)
run(sys.executable, 'scripts/check-release.py')
pin = json.loads((plugin / 'scripts/runtime.json').read_text())
archive = repo / '.build/embedded-runtime' / pin['archive']
archive.parent.mkdir(parents=True, exist_ok=True)
if not archive.exists():
    with urllib.request.urlopen(pin['url'], timeout=120) as response, archive.open('wb') as out:
        shutil.copyfileobj(response, out)
if hashlib.sha256(archive.read_bytes()).hexdigest() != pin['sha256']:
    raise SystemExit('Official Node archive checksum mismatch; remove invalid cache and retry')
run(sys.executable, str(plugin / 'scripts/prepare-runtime.py'))
run('npm', 'ci', '--ignore-scripts', cwd=plugin)
run('npm', 'run', 'build', cwd=plugin)
run('npm', 'run', 'typecheck', cwd=plugin)
run('npm', 'test', cwd=plugin)
run(sys.executable, 'scripts/package-embedded.py')
version = (repo / 'VERSION').read_text().strip()
output = repo / 'dist/public-release/TokenMonitor'
if output.parent.exists():
    shutil.rmtree(output.parent)
(output / 'plugins').mkdir(parents=True)
shutil.copytree(repo / 'dist/token-monitor-embedded', output / 'plugins/token-monitor-embedded')
(output / '.agents/plugins').mkdir(parents=True)
shutil.copy2(repo / '.agents/plugins/marketplace.json', output / '.agents/plugins/marketplace.json')
for name in ['README.md', 'LICENSE', 'NOTICE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'DEPRECATION.md']:
    shutil.copy2(repo / name, output / name)
shutil.copytree(repo / 'docs', output / 'docs')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
dirty = bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=repo))
(output / 'BUILD.json').write_text(json.dumps({'version': version, 'commit': commit, 'dirty': dirty}, indent=2) + '\n')
archive = repo / 'dist' / f'token-monitor-{version}-macos-arm64.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(output.rglob('*')):
        if path.is_file():
            bundle.write(path, 'TokenMonitor/' + path.relative_to(output).as_posix())
archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
print('Built ' + str(archive))
