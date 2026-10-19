#!/usr/bin/env python3
"""Probe MCP presentation through an isolated Codex app-server, without a model turn.

Uses a temporary CODEX_HOME and a temporary test thread. Does not connect to or
modify the desktop's active chats, user config, hook trust, or transcript files.
"""

import argparse
import json
import os
from pathlib import Path
import select
import subprocess
import tempfile
import time


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
import json, subprocess, sys, threading
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


def probe(cli, plugin):
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
                outputs = []
                for tool in ["open_monitor", "show_turn_summary"]:
                    result = rpc.request("mcpServer/tool/call", {
                        "threadId": thread_id, "server": "token-monitor-embedded", "tool": tool,
                        "arguments": {"source": "manual", "sessionId": thread_id},
                        # Match the desktop's callMcpTool wrapper exactly.
                        "_meta": {"thread_id": thread_id, "threadId": thread_id}})
                    monitor = result.get("_meta", {}).get("monitor", {})
                    if result.get("isError") or not monitor.get("presentation"):
                        raise RuntimeError(f"{tool} did not return the expected UI result")
                    outputs.append({"tool": tool, "isError": result.get("isError", False),
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
                if len(delivered) != 2 or not all(
                    call["sessionMatchesThreadId"] and call["sessionMatchesThreadIdSnake"]
                    for call in delivered
                ):
                    raise RuntimeError("Thread metadata did not reach both MCP tool handlers")
                return {"isolated": True, "temporaryThread": True, "modelTurnsRequested": 0,
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
    args = parser.parse_args()
    print(json.dumps(probe(args.cli.resolve(), args.plugin.resolve()), indent=2))
