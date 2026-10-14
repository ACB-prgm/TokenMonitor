#!/usr/bin/python3
"""Exact-command hook merging; unknown config is preserved or rejected, never overwritten."""
import copy
import datetime
import json
from pathlib import Path
import shlex
import sys
import os
import tempfile

EVENTS = ('SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd', 'PreCompact', 'PostCompact')


def is_ours(command, home, obsolete=False):
    try:
        parts = shlex.split(command)
    except (ValueError, TypeError):
        return False
    names = ['TokenMonitor.py', 'codex_usage_monitor_hook.py']
    if obsolete:
        names += ['codex_usage_stop.py', 'codex_usage_stop_wrapper.sh']
    targets = {str(home / '.codex/hooks' / name) for name in names}
    # Only exact known commands, never substring matches or shell pipelines.
    return (len(parts) == 1 and parts[0] in targets) or (len(parts) == 2 and parts[0] in ('/usr/bin/python3', 'python3', '/bin/bash', '/bin/sh') and parts[1] in targets)


def merge(config, home, uninstall=False):
    result = copy.deepcopy(config)
    hooks = result.setdefault('hooks', {})
    if not isinstance(hooks, dict):
        raise ValueError('hooks must be an object')
    for event, groups in hooks.items():
        if not isinstance(groups, list):
            raise ValueError('hook groups must be arrays')
        kept = []
        for group in groups:
            if not isinstance(group, dict) or not isinstance(group.get('hooks'), list):
                raise ValueError('unknown hook group schema; refusing to modify')
            handlers = [h for h in group['hooks'] if not (isinstance(h, dict) and h.get('type') == 'command' and is_ours(h.get('command'), home, obsolete=not uninstall))]
            if handlers or not group['hooks']:
                group['hooks'] = handlers
                kept.append(group)
        hooks[event] = kept
    if not uninstall:
        command = '/usr/bin/python3 ' + shlex.quote(str(home / '.codex/hooks/TokenMonitor.py'))
        for event in EVENTS:
            hooks.setdefault(event, []).append({'hooks': [{'type': 'command', 'command': command, 'timeout': 3}]})
    return result


def update(home, uninstall=False):
    path = home / '.codex/hooks.json'
    original = path.read_bytes() if path.exists() else b'{}'
    result = merge(json.loads(original), home, uninstall)
    if path.exists():
        backup = path.with_name('hooks.json.usage-monitor-backup-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        backup.write_bytes(original)
        os.chmod(backup, 0o600)
        print('Backed up ' + str(backup))
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.hooks-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(result, stream, indent=2)
            stream.write('\n')
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print(('Removed monitor registrations from ' if uninstall else 'Merged six monitor events; removed exact obsolete usage registrations in ') + str(path))

if __name__ == '__main__':
    update(Path.home(), '--uninstall' in sys.argv)
