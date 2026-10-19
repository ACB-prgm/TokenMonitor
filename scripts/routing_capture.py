#!/usr/bin/env python3
"""Arm, inspect, compare, or stop an opt-in embedded MCP routing capture."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import time
import uuid


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with open(temporary, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as out:
            json.dump(value, out, indent=2)
            out.write('\n')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def load(directory):
    control = json.loads((directory / 'routing-capture.json').read_text())
    capture_id = str(uuid.UUID(control['captureId']))
    if capture_id != control['captureId']:
        raise ValueError('Noncanonical capture ID')
    return control, directory / f'routing-{capture_id}.jsonl'


def records(file):
    if not file.exists():
        return []
    if file.is_symlink() or file.stat().st_size > 256 * 1024:
        raise ValueError('Unsafe or oversized trace file')
    # A concurrent writer may still be appending its final line.
    return [json.loads(line) for line in file.read_text().split('\n')[:-1] if line]


def flatten(value, prefix=''):
    if isinstance(value, dict) and value:
        out = {}
        for key, item in value.items():
            pointer = prefix + '/' + key.replace('~', '~0').replace('/', '~1')
            out.update(flatten(item, pointer))
        return out
    return {prefix: value}


def compare(values, tool):
    manual = [r for r in values if r['tool'] == tool and r['originHint'] == 'manual']
    hooks = [r for r in values if r['tool'] == tool and r['originHint'] == 'hook']
    if not manual or not hooks:
        return {'status': 'waiting', 'tool': tool, 'manualCalls': len(manual), 'hookCalls': len(hooks)}
    model = manual[-1]
    def turn(record):
        return record['arguments'].get('turnId') or record['requestMetadata'].get('x-codex-turn-metadata', {}).get('turn_id')
    model_turn = turn(model)
    same_turn = [r for r in hooks if model_turn and turn(r) == model_turn]
    if model_turn and not same_turn and all(turn(r) for r in hooks):
        return {'status': 'waiting', 'tool': tool, 'reason': 'No hook for the latest manual call turn yet',
                'manualCalls': len(manual), 'hookCalls': len(hooks)}
    hook = same_turn[-1] if same_turn else hooks[-1]
    left, right = flatten(model['requestMetadata']), flatten(hook['requestMetadata'])
    common = left.keys() & right.keys()
    return {'status': 'captured', 'tool': tool,
            'sameTurn': model_turn == turn(hook) if model_turn and turn(hook) else None,
            'manualRecordedAt': model['recordedAt'], 'hookRecordedAt': hook['recordedAt'],
            'manualArguments': model['arguments'], 'hookArguments': hook['arguments'],
            'onlyManual': {key: left[key] for key in sorted(left.keys() - right.keys())},
            'onlyHook': {key: right[key] for key in sorted(right.keys() - left.keys())},
            'different': {key: {'manual': left[key], 'hook': right[key]}
                          for key in sorted(common) if left[key] != right[key]},
            'equalFields': sorted(key for key in common if left[key] == right[key]),
            'httpHeaders': {'manual': model['httpHeaders'], 'hook': hook['httpHeaders']},
            'note': 'Origin labels come from the source argument. Captured metadata is evidence of delivery, not proof that replaying it creates UI.'}


def main():
    default_root = Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex') / 'token-monitor-embedded'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-root', type=Path, default=default_root)
    commands = parser.add_subparsers(dest='command', required=True)
    arm = commands.add_parser('arm')
    arm.add_argument('--thread', required=True)
    arm.add_argument('--minutes', type=int, default=15, choices=range(1, 61), metavar='1-60')
    arm.add_argument('--max-records', type=int, default=24, choices=range(1, 65), metavar='1-64')
    commands.add_parser('status')
    comparison = commands.add_parser('compare')
    comparison.add_argument('--tool', choices=['open_monitor', 'show_turn_summary'], default='show_turn_summary')
    watch = commands.add_parser('watch')
    watch.add_argument('--seconds', type=int, default=900, choices=range(1, 901), metavar='1-900')
    commands.add_parser('stop')
    commands.add_parser('clear')
    args = parser.parse_args()
    directory = args.state_root / 'diagnostics'
    if args.command == 'arm':
        # Only exact IDs are supported, never titles or workspace guesses.
        thread = str(uuid.UUID(args.thread))
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        now = datetime.now(timezone.utc)
        control = {'version': 1, 'captureId': str(uuid.uuid4()), 'enabled': True,
                   'targetThreadId': thread, 'createdAt': now.isoformat(),
                   'expiresAt': (now + timedelta(minutes=args.minutes)).isoformat(),
                   'maxRecords': args.max_records}
        atomic_json(directory / 'routing-capture.json', control)
    control, file = load(directory)
    if args.command == 'watch':
        deadline = time.monotonic() + args.seconds
        capture_id = control['captureId']
        while True:
            current, _ = load(directory)
            if current['captureId'] != capture_id:
                print(json.dumps({'status': 'capture_replaced'}))
                return
            result = compare(records(file), 'show_turn_summary')
            atomic_json(file.with_suffix('.comparison.json'), result)
            if result['status'] == 'captured':
                current['enabled'] = False
                atomic_json(directory / 'routing-capture.json', current)
                print(json.dumps({'status': 'captured', 'comparisonFile': str(file.with_suffix('.comparison.json')),
                                  'captureStopped': True}))
                return
            if not current['enabled'] or datetime.fromisoformat(current['expiresAt']) <= datetime.now(timezone.utc) or time.monotonic() >= deadline:
                print(json.dumps({'status': 'waiting', 'comparisonFile': str(file.with_suffix('.comparison.json'))}))
                return
            time.sleep(1)
    if args.command in ['stop', 'clear']:
        control['enabled'] = False
        atomic_json(directory / 'routing-capture.json', control)
        if args.command == 'clear':
            file.unlink(missing_ok=True)
            file.with_suffix('.comparison.json').unlink(missing_ok=True)
    values = records(file)
    if args.command == 'compare':
        result = compare(values, args.tool)
        atomic_json(file.with_suffix('.comparison.json'), result)
        print(json.dumps(result, indent=2))
    else:
        expires = datetime.fromisoformat(control['expiresAt'])
        print(json.dumps({'enabled': bool(control['enabled']) and expires > datetime.now(timezone.utc),
                          'expiresAt': control['expiresAt'], 'maxRecords': control['maxRecords'],
                          'records': len(values), 'traceFile': str(file),
                          'calls': [{'tool': r['tool'], 'originHint': r['originHint'],
                                     'recordedAt': r['recordedAt']} for r in values]}, indent=2))


if __name__ == '__main__':
    main()
