#!/usr/bin/python3
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import time
from manage_hooks import merge, update

home = Path.home()
root = home / '.codex/usage-monitor'
# Validate before making any installed changes.
config = home / '.codex/hooks.json'
merge(json.loads(config.read_text()) if config.exists() else {}, home)
candidates = [Path('/Applications/ChatGPT.app'), Path('/Applications/Codex.app'), home / 'Applications/Codex.app']
desktop = None
for candidate in candidates:
    try:
        info = plistlib.loads((candidate / 'Contents/Info.plist').read_bytes())
        if info.get('CFBundleIdentifier') == 'com.openai.codex':
            desktop = candidate
            break
    except (OSError, ValueError):
        pass
if desktop is None:
    sys.exit('Could not locate Codex Desktop; no installed configuration changed.')
agent = home / 'Library/LaunchAgents/local.codex.usage-monitor.launcher.plist'
if agent.exists():
    previous_agent = plistlib.loads(agent.read_bytes())
    if previous_agent.get('Label') != 'local.codex.usage-monitor.launcher' or previous_agent.get('ProgramArguments', [''])[0] not in (str(root / 'CodexUsageLauncher'), str(home / 'Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageLauncher')):
        sys.exit('Refusing to replace an unrelated launch agent.')
    subprocess.run(['/bin/launchctl', 'bootout', 'gui/' + str(os.getuid()), str(agent)], capture_output=True)
root.mkdir(mode=0o700, parents=True, exist_ok=True)
app = home / 'Applications/Codex Usage Monitor.app'
app.parent.mkdir(parents=True, exist_ok=True)
# Stop only our exact executable before replacing the bundle.
subprocess.run(['/usr/bin/pkill', '-x', 'CodexUsageMonitor'], check=False)
for _ in range(30):
    if subprocess.run(['/usr/bin/pgrep', '-x', 'CodexUsageMonitor'], capture_output=True).returncode != 0:
        break
    time.sleep(0.1)
else:
    sys.exit('Monitor did not stop; refusing to replace its running bundle.')
if app.exists():
    installed = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    if installed.get('CFBundleIdentifier') != 'local.codex.usage-monitor':
        sys.exit('Refusing to replace an unrelated app.')
    shutil.rmtree(app)
shutil.copytree('build/Codex Usage Monitor.app', app)
print('Installed ' + str(app))
hook = home / '.codex/hooks/TokenMonitor.py'
hook.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2('hooks/codex_usage_monitor_hook.py', hook)
print('Installed ' + str(hook))
settings = dict(bundle_id=info['CFBundleIdentifier'], desktop_path=str(desktop), executable_path=str(desktop / 'Contents/MacOS' / info['CFBundleExecutable']), app_path=str(app))
(root / 'installation.json').write_text(json.dumps(settings, indent=2) + '\n')
print('Wrote ' + str(root / 'installation.json'))
update(home)
print('Review and trust the changed user hooks in Codex /hooks. Restart/resume a task to load them. No trust bypass was installed.')
sys.path.insert(0, str(hook.parent))
from TokenMonitor import desktop_pid
agent.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(app / 'Contents/MacOS/CodexUsageLauncher', root / 'CodexUsageLauncher')
print('Installed ' + str(root / 'CodexUsageLauncher'))
agent.write_bytes(plistlib.dumps(dict(Label='local.codex.usage-monitor.launcher', ProgramArguments=[str(root / 'CodexUsageLauncher'), '--watch-codex'], RunAtLoad=True, KeepAlive=True, ThrottleInterval=10)))
subprocess.run(['/bin/launchctl', 'bootstrap', 'gui/' + str(os.getuid()), str(agent)], check=True)
print('Installed event-driven Codex startup launcher: ' + str(agent))

if desktop_pid(settings):
    for attempt in range(5):
        launched = subprocess.run(['/usr/bin/open', '-g', str(app)], capture_output=True)
        if launched.returncode == 0:
            print('Launched monitor for smoke test.')
            break
        time.sleep(0.5)
    else:
        sys.exit('Installed successfully, but macOS could not open the monitor. Open the installed app manually.')
