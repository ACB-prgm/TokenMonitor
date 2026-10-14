import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from manage_hooks import merge, update
spec = importlib.util.spec_from_file_location('bridge', Path(__file__).resolve().parents[1] / 'hooks/codex_usage_monitor_hook.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class HooksTests(unittest.TestCase):
    def test_preservation_idempotency_uninstall(self):
        home = Path('/Users/example')
        keep = {'type': 'command', 'command': 'echo unrelated'}
        old = {'type': 'command', 'command': '/usr/bin/python3 "/Users/example/.codex/hooks/codex_usage_stop.py"'}
        cfg = {'description': 'retain', 'hooks': {'Stop': [{'matcher': '*', 'hooks': [keep, old]}]}}
        result = merge(cfg, home)
        self.assertEqual(result, merge(result, home))
        self.assertEqual(result['description'], 'retain')
        self.assertEqual(result['hooks']['Stop'][0], {'matcher': '*', 'hooks': [keep]})
        self.assertEqual(len(result['hooks']['Stop']), 2)
        undone = merge(result, home, uninstall=True)
        self.assertEqual(undone['hooks']['Stop'], [{'matcher': '*', 'hooks': [keep]}])
        self.assertEqual(len(cfg['hooks']['Stop'][0]['hooks']), 2)
    def test_backup_and_repeated_update(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config = home / '.codex/hooks.json'
            config.parent.mkdir()
            original = '{"description":"keep","hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo hi"}]}]}}'
            config.write_text(original)
            update(home)
            first = json.loads(config.read_text())
            update(home)
            self.assertEqual(first, json.loads(config.read_text()))
            backups = list(config.parent.glob('hooks.json.usage-monitor-backup-*'))
            self.assertEqual(len(backups), 2)
            self.assertIn(original, [p.read_text() for p in backups])
            update(home, uninstall=True)
            self.assertEqual(json.loads(config.read_text())['hooks']['Stop'], [{'hooks':[{'type':'command','command':'echo hi'}]}])
    def test_no_substring_removal(self):
        home = Path('/Users/example')
        handler = {'type': 'command', 'command': 'echo /Users/example/.codex/hooks/codex_usage_stop.py'}
        cfg = {'hooks': {'Stop': [{'hooks': [handler]}]}}
        self.assertEqual(merge(cfg, home)['hooks']['Stop'][0]['hooks'], [handler])
    def test_switch_stop_suppression_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); launched = []
            def send(session, event, pid=123):
                bridge.process({'session_id': session, 'transcript_path': '/tmp/' + session, 'hook_event_name': event}, root, pid, lambda: launched.append(pid))
            send('a', 'SessionStart'); self.assertEqual(launched, [123])
            send('b', 'UserPromptSubmit'); send('a', 'Stop')
            self.assertEqual(bridge.read_json(root / 'active-session.json')['session_id'], 'a')
            bridge.atomic_json(root / 'suppression.json', {'suppress_auto_launch_for_codex_pid': 123})
            send('b', 'SessionStart'); send('b', 'Stop'); self.assertEqual(launched, [123, 123, 123])
            send('c', 'SessionStart', 456); self.assertEqual(launched, [123, 123, 123, 456])
            send('c', 'SessionEnd', 456)
            self.assertTrue(bridge.read_json(root / 'active-session.json')['ended'])
    def test_compaction_hooks(self):
        config = merge({}, Path('/Users/example'))
        for event in ('PreCompact', 'PostCompact'):
            self.assertEqual(len(config['hooks'][event]), 1)
            self.assertNotIn('matcher', config['hooks'][event][0])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); launched = []
            for event in ('PreCompact', 'PostCompact'):
                bridge.process({'session_id': 'a', 'transcript_path': '/tmp/a', 'hook_event_name': event}, root, 123, lambda: launched.append(True))
                state = bridge.read_json(root / 'active-session.json')
                self.assertEqual(state['hook_event_name'], event)
                self.assertFalse(state['ended'])
            self.assertEqual(len(launched), 2)
    def test_invalid_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bridge.process({'session_id': 'a', 'transcript_path': 'relative', 'hook_event_name': 'SessionStart'}, root, 1, lambda: self.fail('launch'))
            self.assertFalse((root / 'active-session.json').exists())

if __name__ == '__main__':
    unittest.main()
