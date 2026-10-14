#!/usr/bin/python3
"""Silent local hook bridge. No transcript reads, network, or model-visible output."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def atomic_json(path, value):
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def desktop_pid(settings):
    expected = settings.get('executable_path')
    if not expected:
        return None
    result = subprocess.run(['/bin/ps', '-axo', 'pid=,comm='], capture_output=True, text=True, timeout=0.6)
    for line in result.stdout.splitlines():
        fields = line.strip().split(None, 1)
        if len(fields) == 2 and fields[1] == expected:
            return int(fields[0])
    return None


def process(payload, root, pid, launch):
    event = payload.get('hook_event_name')
    if event not in ('SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd', 'PreCompact', 'PostCompact'):
        return
    session = payload.get('session_id')
    transcript = payload.get('transcript_path')
    if not isinstance(session, str) or not session:
        return
    if transcript is not None and (not isinstance(transcript, str) or not os.path.isabs(transcript)):
        return
    # Serialize hooks: the most recent event selects the automatic task.
    # Explicit locking is handled by the monitor, not by the bridge.
    with (root / 'bridge.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = read_json(root / 'active-session.json')
        state = {k: payload[k] for k in ('session_id', 'transcript_path', 'cwd', 'model', 'turn_id', 'hook_event_name', 'title') if k in payload}
        if previous.get('session_id') == session:
            state = {**previous, **state}
            if not transcript:
                state['transcript_path'] = previous.get('transcript_path')
        state.update(updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), codex_pid=pid, ended=event == 'SessionEnd')
        atomic_json(root / 'active-session.json', state)
        suppression = read_json(root / 'suppression.json')
        suppressed = suppression.get('suppress_auto_launch_for_codex_pid')
        if pid and suppressed and suppressed != pid:
            atomic_json(root / 'suppression.json', {})
        if event in ('SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact', 'PostCompact') and pid and suppressed != pid:
            launch()


def main():
    root = Path.home() / '.codex/usage-monitor'
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            return
        settings = read_json(root / 'installation.json')
        pid = desktop_pid(settings)
        def launch():
            subprocess.Popen(['/usr/bin/open', '-g', settings['app_path']], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        process(payload, root, pid, launch)
    except Exception as error:
        # Bounded diagnostics contain only error classes, never prompts or tool output.
        logs = root / 'logs'
        logs.mkdir(mode=0o700, exist_ok=True)
        path = logs / 'hook.log'
        if path.exists() and path.stat().st_size > 32768:
            path.write_text('')
        with path.open('a') as stream:
            stream.write(datetime.datetime.now(datetime.timezone.utc).isoformat() + ' ' + type(error).__name__ + '\n')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
