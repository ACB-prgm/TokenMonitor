#!/usr/bin/env python3
"""Probe MCP presentation through an isolated Codex app-server, without a model turn.

Uses a temporary CODEX_HOME and a temporary test thread. Does not connect to or
modify the desktop's active chats, user config, hook trust, or transcript files.
Optional capture replay checks what metadata survives the API boundary; it is
not a live desktop presentation test.
"""

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import select
import subprocess
import tempfile
import time
import uuid


class RpcError(RuntimeError):
    def __init__(self, method, error):
        self.error = error
        super().__init__(f"{method}: {error}")


class Rpc:
    def __init__(self, command, env, stderr):
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=stderr, env=env)
        self.buffer = b""
        self.counter = 0
        self.notifications = []

    def send(self, message):
        self.process.stdin.write((json.dumps(message) + "\n").encode())
        self.process.stdin.flush()

    def request(self, method, params, timeout=30):
        self.counter += 1
        request_id = self.counter
        self.send({"id": request_id, "method": method, "params": params})
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if b"\n" not in self.buffer:
                ready, _, _ = select.select([self.process.stdout], [], [],
                                             max(0, deadline - time.monotonic()))
                if not ready:
                    break
                data = os.read(self.process.stdout.fileno(), 65536)
                if not data:
                    raise RuntimeError(f"app-server exited during {method}")
                self.buffer += data
                continue
            line, self.buffer = self.buffer.split(b"\n", 1)
            if not line.strip():
                continue
            message = json.loads(line)
            if message.get("id") == request_id:
                if "error" in message:
                    raise RpcError(method, message["error"])
                return message["result"]
            if "method" in message and "id" not in message:
                self.notifications.append(message)
            elif "id" in message:
                raise RuntimeError("Unexpected server request; this probe must not require approval")
        raise TimeoutError(f"app-server timed out during {method}")

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()


# The proxy records only names and equality checks, never IDs or metadata values.
PROXY = r'''
import hashlib, json, subprocess, sys, threading
launch, audit = sys.argv[1:]
child = subprocess.Popen(['/bin/sh', launch], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
def forward():
    for line in child.stdout:
        sys.stdout.buffer.write(line)
        sys.stdout.buffer.flush()
thread = threading.Thread(target=forward, daemon=True)
thread.start()
try:
    for line in sys.stdin.buffer:
        item = json.loads(line)
        if item.get('method') == 'tools/call':
            params = item.get('params', {})
            args = params.get('arguments', {})
            meta = params.get('_meta', {})
            def matches(key):
                return args['sessionId'] == meta[key] if 'sessionId' in args and key in meta else None
            event = {'tool': params.get('name'), 'argumentKeys': sorted(args),
                     'metadataKeys': sorted(meta), 'sessionMatchesThreadId': matches('threadId'),
                     'sessionMatchesThreadIdSnake': matches('thread_id')}
            stable = {k: v for k, v in meta.items() if k != 'progressToken'}
            event['metadataFingerprint'] = hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            def fields(value, prefix=''):
                if isinstance(value, dict) and value:
                    result = {}
                    for key, item in value.items():
                        result.update(fields(item, prefix + '/' + key.replace('~', '~0').replace('/', '~1')))
                    return result
                return {prefix: hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}
            event['fieldFingerprints'] = fields(stable)
            event['turnMetadataKeys'] = sorted(meta.get('x-codex-turn-metadata', {}))
            with open(audit, 'a') as out:
                out.write(json.dumps(event) + '\n')
        child.stdin.write(line)
        child.stdin.flush()
finally:
    child.stdin.close()
    try: child.wait(timeout=5)
    except subprocess.TimeoutExpired: child.terminate(); child.wait(timeout=5)
    thread.join(timeout=5)
'''


def metadata_fingerprint(meta):
    stable = {key: value for key, value in meta.items() if key != 'progressToken'}
    return hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def field_fingerprints(value, prefix=''):
    if isinstance(value, dict) and value:
        result = {}
        for key, item in value.items():
            result.update(field_fingerprints(item, prefix + '/' + key.replace('~', '~0').replace('/', '~1')))
        return result
    return {prefix: hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}


def read_capture(file):
    if file.stat().st_size > 256 * 1024:
        raise ValueError('Capture exceeds the diagnostic size limit')
    rows = [json.loads(line) for line in file.read_text().splitlines() if line]
    models = [r for r in rows if r.get('tool') == 'show_turn_summary' and r.get('originHint') == 'manual']
    if not models:
        raise ValueError('No manual summary call in the supplied capture')
    metadata = models[-1]['requestMetadata']
    if not isinstance(metadata, dict):
        raise ValueError('Capture request metadata must be an object')
    return models[-1]


def replay_metadata(captured, thread_id, *, routing_only=False, remap=True):
    # Do not send real chat/item IDs to a disconnected test server. Retain the
    # captured structure and context, with coherent disposable fixture IDs.
    meta = copy.deepcopy(captured)
    meta.pop('progressToken', None)
    if remap:
        meta.update(threadId=thread_id, sessionId=thread_id,
                    callId='exec-' + str(uuid.uuid4()), itemId='ctc_' + uuid.uuid4().hex + uuid.uuid4().hex,
                    windowId=thread_id + ':1')
    if routing_only:
        meta.pop('x-codex-turn-metadata', None)
    elif isinstance(meta.get('x-codex-turn-metadata'), dict):
        context = meta['x-codex-turn-metadata']
        if remap:
            context.update(session_id=thread_id, thread_id=thread_id, turn_id=str(uuid.uuid4()))
        # The live recorder over-redacted this object. Omit unavailable values
        # rather than invent a workspace snapshot or replay redaction markers.
        if isinstance(context.get('workspaces'), dict):
            context['workspaces'] = {key: value for key, value in context['workspaces'].items()
                                     if value != '[REDACTED]'}
    return meta


def probe(cli, plugin, captured=None):
    import sys
    with tempfile.TemporaryDirectory(prefix="token-monitor-host-probe-") as temp:
        home = Path(temp)
        proxy, audit = home / "proxy.py", home / "audit.jsonl"
        proxy.write_text(PROXY)
        # JSON basic strings are compatible with TOML basic strings here.
        config = ('[mcp_servers.token-monitor-embedded]\n'
                  f'command = {json.dumps(sys.executable)}\n'
                  f'args = {json.dumps([str(proxy), str(plugin / "scripts/launch.sh"), str(audit)])}\n'
                  f'cwd = {json.dumps(str(plugin))}\n')
        (home / "config.toml").write_text(config)
        with (home / "stderr.log").open("wb") as stderr:
            rpc = Rpc([str(cli), "app-server", "--stdio"],
                      dict(os.environ, CODEX_HOME=temp), stderr)
            try:
                rpc.request("initialize", {"clientInfo": {"name": "token-monitor-host-probe", "version": "0.1.0"},
                                           "capabilities": {"experimentalApi": True}})
                rpc.send({"method": "initialized", "params": {}})
                thread = rpc.request("thread/start", {"cwd": temp, "ephemeral": False,
                                                      "approvalPolicy": "never", "sandbox": "read-only"})
                thread_id = thread["thread"]["id"]
                inventory = rpc.request("mcpServerStatus/list", {"threadId": thread_id,
                                         "serverName": "token-monitor-embedded", "detail": "full"})
                tools = [name for server in inventory.get("data", [])
                         for name in server.get("tools", {})]
                if not {"open_monitor", "show_turn_summary"}.issubset(tools):
                    raise RuntimeError("Embedded MCP tools were not discovered")
                rpc.request("thread/read", {"threadId": thread_id})
                history = {"supported": False, "attempts": []}
                for method, params in [
                    ("thread/items/list", {"threadId": thread_id}),
                    ("thread/read", {"threadId": thread_id, "includeTurns": True}),
                ]:
                    try:
                        snapshot = rpc.request(method, params)
                    except RpcError as error:
                        if error.error.get("code") not in [-32600, -32601]:
                            raise
                        history["attempts"].append({"method": method, "error": error.error})
                    else:
                        history.update(supported=True, method=method)
                        if method == "thread/items/list":
                            history["itemsBefore"] = len(snapshot["data"])
                        else:
                            history["itemsBefore"] = sum(len(t["items"]) for t in snapshot["thread"]["turns"])
                        break
                outputs, expected, expected_fields = [], [], []
                arguments = {"source": "manual", "sessionId": thread_id}
                variants = [("basic-wrapper", {"thread_id": thread_id, "threadId": thread_id}, arguments)]
                if captured is not None:
                    context = captured['requestMetadata']
                    variants.extend([
                        ("captured-routing-fields", replay_metadata(context, thread_id, routing_only=True), arguments),
                        ("captured-routing-and-turn-context", replay_metadata(context, thread_id), arguments),
                        ("captured-original-identifiers", replay_metadata(context, thread_id, remap=False),
                         {key: value for key, value in captured['arguments'].items() if value is not None}),
                    ])
                for variant, metadata, tool_arguments in variants:
                    for tool in ["open_monitor", "show_turn_summary"]:
                        expected.append(metadata_fingerprint(metadata))
                        expected_fields.append(field_fingerprints({k: v for k, v in metadata.items() if k != 'progressToken'}))
                        result = rpc.request("mcpServer/tool/call", {
                            "threadId": thread_id, "server": "token-monitor-embedded", "tool": tool,
                            "arguments": tool_arguments, "_meta": metadata})
                        monitor = result.get("_meta", {}).get("monitor", {})
                        if result.get("isError") or not monitor.get("presentation"):
                            raise RuntimeError(f"{tool} did not return the expected UI result")
                        outputs.append({"variant": variant, "tool": tool, "isError": result.get("isError", False),
                                        "presentation": monitor.get("presentation"),
                                        "metadataShape": monitor.get("metadataShape")})
                rpc.request("thread/read", {"threadId": thread_id})
                if history["supported"]:
                    method = history["method"]
                    snapshot = rpc.request(method, {"threadId": thread_id, **(
                        {"includeTurns": True} if method == "thread/read" else {})})
                    history["itemsAfter"] = (len(snapshot["data"]) if method == "thread/items/list"
                        else sum(len(t["items"]) for t in snapshot["thread"]["turns"]))
                # A final round trip drains earlier ordered notifications.
                rpc.request("thread/loaded/list", {})
                item_events = [n["method"] for n in rpc.notifications
                               if n["method"] in ["item/started", "item/completed", "turn/started", "turn/completed"]]
                delivered = [json.loads(line) for line in audit.read_text().splitlines()]
                if len(delivered) != len(expected):
                    raise RuntimeError('Missing MCP requests in the delivery audit')
                for call, fingerprint, fields in zip(delivered, expected, expected_fields):
                    call['submittedMetadataMatchesDelivered'] = call.pop('metadataFingerprint') == fingerprint
                    actual = call.pop('fieldFingerprints')
                    selected_thread = field_fingerprints(thread_id)['']
                    call['deliveredThreadMatchesRpcThread'] = actual.get('/threadId') == selected_thread
                    call['metadataDifferences'] = {
                        'removed': sorted(fields.keys() - actual.keys()),
                        'added': sorted(actual.keys() - fields.keys()),
                        'changedValuePaths': sorted(k for k in fields.keys() & actual.keys() if fields[k] != actual[k]),
                    }
                return {"isolated": True, "temporaryThread": True, "modelTurnsRequested": 0,
                        "captureReplay": captured is not None,
                        "replayLimits": (["Captured original identifiers replayed in one variant; other variants use disposable fixture IDs",
                                          "Outer RPC thread is always the isolated test thread; captured original IDs have no registered live items there",
                                          "Redacted workspace entries omitted; SDK progress tokens excluded from equality checks",
                                          "No desktop UI attached to test server"]
                                         if captured is not None else []),
                        "discoveredTools": tools, "calls": outputs, "deliveredRequests": delivered,
                        "historyListing": history,
                        "conversationItemEvents": item_events}
            finally:
                rpc.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", type=Path, default=Path(
        "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"))
    parser.add_argument("--plugin", type=Path,
                        default=Path(__file__).resolve().parents[1] / "plugins/token-monitor-embedded")
    parser.add_argument("--capture", type=Path,
                        help="Replay routing metadata from a recorded manual summary in this JSONL capture")
    parser.add_argument("--output", type=Path, help="Save the diagnostic report to this path")
    args = parser.parse_args()
    report = json.dumps(probe(args.cli.resolve(), args.plugin.resolve(),
                              read_capture(args.capture) if args.capture else None), indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report)
    print(report, end='')
