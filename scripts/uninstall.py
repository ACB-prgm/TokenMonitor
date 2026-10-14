#!/usr/bin/python3
from pathlib import Path
import plistlib
import os
import shutil
import subprocess
import sys
from manage_hooks import update
home = Path.home()
update(home, uninstall=True)
agent = home / 'Library/LaunchAgents/local.codex.usage-monitor.launcher.plist'
if agent.exists():
    info = plistlib.loads(agent.read_bytes())
    if info.get('Label') != 'local.codex.usage-monitor.launcher' or info.get('ProgramArguments', [''])[0] not in (str(home / '.codex/usage-monitor/CodexUsageLauncher'), str(home / 'Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageLauncher')):
        sys.exit('Refusing to remove an unrelated launch agent.')
    subprocess.run(['/bin/launchctl', 'bootout', 'gui/' + str(os.getuid()), str(agent)], capture_output=True)
    agent.unlink()
    print('Removed ' + str(agent))
subprocess.run(['/usr/bin/pkill', '-x', 'CodexUsageMonitor'], check=False)
app = home / 'Applications/Codex Usage Monitor.app'
if app.exists():
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    if info.get('CFBundleIdentifier') != 'local.codex.usage-monitor':
        sys.exit('Refusing to delete an unrelated app.')
    shutil.rmtree(app)
    print('Removed ' + str(app))
hook = home / '.codex/hooks/TokenMonitor.py'
if hook.exists():
    hook.unlink()
    print('Removed ' + str(hook))
launcher = home / '.codex/usage-monitor/CodexUsageLauncher'
if launcher.exists():
    launcher.unlink()
    print('Removed ' + str(launcher))
if '--purge' in sys.argv:
    root = home / '.codex/usage-monitor'
    if root.exists():
        shutil.rmtree(root)
    subprocess.run(['/usr/bin/defaults', 'delete', 'local.codex.usage-monitor'], check=False, capture_output=True)
    print('Removed monitor state, logs and preferences (--purge requested).')
else:
    print('Kept monitor state and preferences. Use --purge to remove them explicitly.')
