#!/usr/bin/env python3
"""Exercise the actual SSH controller with disposable fake transports; no user state changes."""
import glob
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class RemoteRuntimeTests(unittest.TestCase):
    def test_controller_transport_failures_reconnect_and_shutdown(self):
        objects = glob.glob(str(ROOT / '.build/debug/MonitorCore.build/*.o'))
        if not objects:
            self.skipTest('Build the Swift package before runtime tests')
        with tempfile.TemporaryDirectory(prefix='TokenMonitor controller ') as temporary:
            folder = Path(temporary)
            transport = folder / 'fake-ssh'
            transport.write_text('''#!/usr/bin/python3
import json,os,sys,time
mode=open(os.path.join(os.path.dirname(__file__),'mode')).read().strip()
if mode=='auth':
    print('Permission denied (publickey).',file=sys.stderr);sys.exit(255)
if mode=='host':
    print('Host key verification failed.',file=sys.stderr);sys.exit(255)
if mode=='missing':sys.exit(127)
if mode=='invalid':
    print(json.dumps({'version':999,'kind':'hello'}),flush=True);sys.exit(0)
print(json.dumps({'version':1,'kind':'hello'}),flush=True)
if mode=='reconnect':sys.exit(0)
sys.stdin.buffer.read()
''')
            transport.chmod(0o755)
            (folder / 'identity').write_text('test placeholder, not a credential')
            main = folder / 'main.swift'
            main.write_text('''import Foundation
import MonitorCore
var config = RemoteConfiguration()
config.label = "Test"; config.host = "fixture.invalid"
config.identityFile = CommandLine.arguments[1]
let expected = CommandLine.arguments[3]
let connection = RemoteConnection(configuration: config, sshExecutable: URL(fileURLWithPath: CommandLine.arguments[2]))
var connects = 0
var finished = false
var statuses: [String] = []
connection.onStatus = { status in
    statuses.append(status)
    if status == "Connected" { connects += 1 }
    let matched: Bool
    switch expected {
    case "auth": matched = status.contains("Authentication failed")
    case "host": matched = status.contains("Host key needs verification")
    case "missing": matched = status.contains("helper missing or outdated")
    case "invalid": matched = status.contains("Invalid or incompatible")
    case "reconnect": matched = connects >= 2
    default: matched = status == "Connected"
    }
    if matched {
        connection.stop()
        let count = statuses.count
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            precondition(statuses.count == count, "Callbacks continued after stop")
            finished = true
        }
    }
}
connection.start()
let deadline = Date().addingTimeInterval(8)
while !finished && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
connection.stop()
precondition(finished, "Failed expected case: " + expected + " statuses: " + statuses.joined(separator: ","))
print("PASS: " + expected)
''')
            executable = folder / 'controller'
            env = dict(os.environ)
            env['CLANG_MODULE_CACHE_PATH'] = str(ROOT / '.build/module-cache')
            subprocess.run(['swiftc', '-module-cache-path', str(ROOT / '.build/module-cache'),
                            '-I', str(ROOT / '.build/debug/Modules'),
                            str(ROOT / 'Sources/CodexUsageMonitor/RemoteConnection.swift'), str(main),
                            *objects, '-lsqlite3', '-o', str(executable)], check=True, env=env, capture_output=True, text=True)
            for mode in ['connected', 'auth', 'host', 'missing', 'invalid', 'reconnect']:
                with self.subTest(mode=mode):
                    (folder / 'mode').write_text(mode)
                    completed = subprocess.run([str(executable), str(folder / 'identity'), str(transport), mode],
                                               capture_output=True, text=True, timeout=12)
                    self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)

if __name__ == '__main__':
    unittest.main()
