#!/usr/bin/env python3
"""Build-time only: verify and unpack the pinned official Node runtime."""
import hashlib
import json
from pathlib import Path
import shutil
import tarfile

plugin = Path(__file__).resolve().parents[1]
repo = plugin.parents[1]
pin = json.loads((plugin / 'scripts/runtime.json').read_text())
archive = repo / '.build/embedded-runtime' / pin['archive']
if hashlib.sha256(archive.read_bytes()).hexdigest() != pin['sha256']:
    raise SystemExit('Node runtime archive checksum mismatch')
runtime = plugin / 'runtime'
runtime.mkdir(exist_ok=True)
with tarfile.open(archive, 'r:gz') as tar:
    prefix = pin['archive'].removesuffix('.tar.gz')
    for source, target in [('bin/node', 'node'), ('LICENSE', 'NODE-LICENSE.txt')]:
        member = tar.getmember(prefix + '/' + source)
        if not member.isfile():
            raise SystemExit('Unexpected runtime archive member')
        with tar.extractfile(member) as stream, (runtime / target).open('wb') as output:
            shutil.copyfileobj(stream, output)
(runtime / 'node').chmod(0o755)
(runtime / 'NODE-LICENSE.txt').chmod(0o644)
print('Prepared verified Node ' + pin['version'] + ' arm64 runtime')
