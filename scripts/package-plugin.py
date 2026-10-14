#!/usr/bin/env python3
"""Developer release builder. Recipients use only the packaged app and shell bootstrap."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def run(*args, **kwargs):
    subprocess.run([str(a) for a in args], check=True, **kwargs)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-build', action='store_true', help='Package an already built matching app')
    args = parser.parse_args()
    version = (ROOT/'VERSION').read_text().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('VERSION must contain a release semantic version')
    if not args.skip_build:
        run(ROOT/'scripts/build-app.sh', cwd=ROOT)
    dist = ROOT/'dist'
    package = dist/'token-monitor'
    if package.exists():
        shutil.rmtree(package)
    shutil.copytree(ROOT/'plugins/token-monitor', package)
    manifest_path = package/'.codex-plugin/plugin.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['version'] = version
    manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
    assets = package/'skills/token-monitor/assets'
    bundle = assets/'Codex Usage Monitor.app'
    shutil.copytree(ROOT/'build/Codex Usage Monitor.app', bundle)
    files = []
    for path in sorted(bundle.rglob('*')):
        if path.is_symlink():
            raise ValueError('Bundle must not contain symlinks: '+str(path))
        if path.is_file():
            files.append(dict(path=path.relative_to(assets).as_posix(), sha256=digest(path)))
    (assets/'release.json').write_text(json.dumps(dict(version=version, architecture='arm64', minimumOS='13.0', fileCount=len(files), files=files),indent=2)+'\n')
    # Explicit package exclusions and hygiene checks, including embedded build paths.
    for path in package.rglob('*'):
        if path.is_symlink() or (not path.is_dir() and not path.is_file()):
            raise ValueError('Unsupported package member: '+str(path))
        if path.is_file():
            if path.name in {'.DS_Store','.app.json','.mcp.json','mcp.json','hooks.json'} or path.suffix in {'.jsonl','.pyc'} or '__pycache__' in path.parts:
                raise ValueError('Unwanted package content: '+str(path))
            if str(Path.home()).encode() in path.read_bytes():
                raise ValueError('Personal home path in release: '+str(path))
    # Use the installed system skill validators when available; releases must pass them.
    skills = Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))/'skills/.system'
    validator_python = ROOT/'.build/plugin-tools/bin/python'
    if not validator_python.exists():
        raise RuntimeError('Create developer validator environment: python3 -m venv .build/plugin-tools; .build/plugin-tools/bin/pip install -r scripts/release-requirements.txt')
    plugin_validator = skills/'plugin-creator/scripts/validate_plugin.py'
    if not plugin_validator.exists():
        plugin_validator = ROOT/'scripts/validate-plugin.py'
    run(validator_python, plugin_validator, package)
    run(validator_python, skills/'skill-creator/scripts/quick_validate.py', package/'skills/token-monitor')
    run('/bin/bash', package/'skills/token-monitor/scripts/setup.sh', '--verify', cwd='/tmp')
    archive = dist/f'token-monitor-{version}.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in sorted(package.rglob('*')):
            if path.is_file():
                info = zipfile.ZipInfo('token-monitor/'+path.relative_to(package).as_posix(), date_time=(2026,1,1,0,0,0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | (0o755 if os.access(path,os.X_OK) else 0o644)) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info,path.read_bytes())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.infolist()) <= 5000
        assert sum(i.file_size for i in z.infolist()) <= 512*1024*1024
        assert all(len(i.filename.split('/'))<=20 and '..' not in i.filename.split('/') for i in z.infolist())
    assert archive.stat().st_size < 100_000_000
    (dist/'SHA256SUMS').write_text(f'{digest(archive)}  {archive.name}\n')
    shutil.copytree(ROOT/'release-materials',dist/'submission',dirs_exist_ok=True)
    (dist/'RELEASE-VERIFICATION.md').write_text(f'''# TokenMonitor {version} package verification

- Plugin scaffold/manifest validator: passed ({plugin_validator.name}; repository fallback used when system validator is absent).
- Skill validator: passed.
- Bundled bootstrap --verify from outside repository: passed.
- SHA-256 app inventory, arm64 architecture, app identity/version, ad-hoc code signature: passed.
- Archive CRC, size, path, member type and entry-count checks: passed.
- Personal home paths, transcripts, caches and connector/hook auto-discovery config: excluded.
- Archive: {archive.name} ({archive.stat().st_size:,} bytes).

See LOCAL-VERIFICATION.md for tests and installed-cache verification from this release session. This generated report does not claim those checks ran during packaging.

Not verified here: clean-account Gatekeeper first open, clean-machine setup, a fresh agent's skill invocation, and public-directory security scan/review. The app is ad-hoc signed and unnotarized. Publisher identity is not verified by this build.
''')
    print('Packaged '+str(archive))

if __name__ == '__main__':
    main()
