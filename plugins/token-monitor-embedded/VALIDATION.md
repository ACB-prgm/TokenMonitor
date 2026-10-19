# Embedded prototype validation

Version 0.1.5 adds explicitly armed, exact-thread routing capture. Tests cover
capture-off behavior, exclusion of refreshes and other chats, preservation of
routing values, redaction of credentials/prompt fields, private file modes,
record and size caps, expiry, explicit stopping, comparison output, and graceful
handling of malformed capture control. Type checking and all seven protocol
tests pass. Live model/hook capture is a separate installation check.

Version 0.1.5 was installed and a temporary capture was armed for the current
chat. The first post-install model call still registered the 0.1.4 summary
resource and produced no trace, so live capture remains pending connection
refresh. A bounded watcher can compare the next manual summary with its real
Stop-hook summary and automatically disarm; no manually simulated hook calls
are used for the live comparison. Tests verify this watcher's stop behavior.

Version 0.1.4 exposes the existing `show_turn_summary` tool to the model for an
explicit inline-only test requested by the user. It retains its separate
resource and inline preference; only `open_monitor` has a thread entrypoint.
Manual summary calls do not increment hook counters. Refresh and task-list tools
remain app-only. The hook definitions are unchanged. Build, type checking, five
protocol tests, packaging, and the extracted archive test passed. Version 0.1.4
was installed through the CLI. After the user re-mentioned the plugin, the model
called the inline tool and the user confirmed it rendered. This establishes
model-driven presentation of the same summary resource used by Stop.

Inspection of that successful call's saved event found incoming metadata fields
not included in the earlier Python wrapper probe: `callId`, `plugin_id`,
`windowId`, `itemId`, `sessionId`, and `x-codex-turn-metadata`, including thread,
session, turn, workspace, model, client, and sandbox fields. The saved prototype
diagnostic contains their shapes rather than their original values. The event
also contains `mcpAppResourceUri` and `mcpAppUi.preferredModelDisplayMode=inline`.
The desktop log ties that item to an inline sandbox session. The Python probe
therefore did not reproduce the full successful model-call context. The new
recorder is intended to compare actual delivered values; it does not assume
that replaying those values is sufficient to recreate presentation.

Status: **inline rendering, refresh, and expanded view confirmed by the user;
automatic turn-end inline rendering did not appear in the reported test;
closing the expanded panel did not restore automatic summaries**.

## Automatic-presentation result (2026-10-18)

Host: Codex desktop 26.1013.40934 (build 20770), embedded prototype 0.1.3.

The user reports no inline summary after Codex responses in any tested chats.
Do not advertise the Stop hook as a working automatic-summary feature. Automatic
expanded opening is also not established by a successful model-driven launch.

Read-only diagnosis found persisted trust hashes for both embedded hook
definitions and successful MCP startup in multiple local chats. The user then
reported these live-panel diagnostics:

- Hook open requests: **3**
- Hook turn-end requests: **2**
- Last hook: **Stop**

These counters increment only inside the corresponding server tool handlers
when `source` is `hook`. They confirm both hook calls reached the MCP server,
including two calls to `show_turn_summary`. Combined with the user's report of
no inline summaries, this establishes execution without a visible new summary
in the reported state. It does not establish that hook presentation is impossible
in every display mode.

The user clarified that an explicit model launch worked in another chat but did
not produce the expected result while the monitor was expanded. Expanded
placement is therefore a variable to isolate. In this prototype, `open_monitor`
requests the fullscreen panel resource, while `show_turn_summary` requests a
different, inline-only resource (app-only in 0.1.3). A successful model launcher call
is not a successful test of the Stop summary resource. Do not conflate these
tools or infer a cause from the absence of a new inline card alone.

The user subsequently completed the closed-panel check: a normal response with
no explicit model launch still produced no automatic inline summary. Expanded
placement alone therefore does not explain the failed hook behavior. The user
also confirmed that an explicit launcher opens expanded and closing its tab
returns that same widget inline, matching the desktop's tab-close handler. This
is not creation of a separate Stop summary.

The installed desktop's `hook/started` and `hook/completed` notification handler
updates a turn's hook-run records; it does not create an MCP tool-call item or
present a UI resource. The generated `HookRunSummary` protocol contains text
output entries, with no MCP result or UI metadata field. That handler is evidence
against presentation through the hook-completion event itself, not proof that
there is no other host presentation path. The live panel's hook counters independently
confirm execution; further trust review or an @ mention is not the missing step
in this tested chat.

Official MCP hook documentation specifies an existing-connection tool call and
the command-hook output contract, not presentation of an MCP App result:
https://learn.chatgpt.com/docs/hooks#mcp-tool-hooks

The supported presentation path demonstrated here remains a model call to
`open_monitor`, followed by independent UI refresh. Global AGENTS.md can request
that launch once per new local chat when the tool is available; this is a model
instruction, not a native automatic panel attachment. No global instructions,
hook trust settings, or installed runtime were changed by this diagnosis.

## Python host-API investigation (2026-10-19)

`scripts/probe_embedded_host.py` now reproduces the desktop's MCP RPC from Python.
It starts the installed CLI's app-server in a temporary CODEX_HOME, configures
only this MCP server, and creates a disposable test thread. It neither starts a
model turn nor connects to the desktop's active chats. The test home is removed
on exit. A transparent stdio proxy checks delivered field names and equality
without recording IDs or other metadata values.

The exact request shape tested is:

```json
{
  "method": "mcpServer/tool/call",
  "params": {
    "threadId": "<test-thread-id>",
    "server": "token-monitor-embedded",
    "tool": "open_monitor",
    "arguments": {"source": "manual", "sessionId": "<test-thread-id>"},
    "_meta": {"thread_id": "<test-thread-id>", "threadId": "<test-thread-id>"}
  }
}
```

The desktop's `callMcpTool` wrapper adds those same two metadata keys. The probe
also calls `show_turn_summary` with the same request context. Both calls succeed
and return their expected private `presentation` values (`panel`, `turn-summary`).
The proxy confirms the delivered `sessionId` equals both metadata thread IDs for
both tools. The server receives the two thread-ID keys and an SDK progress token.
No `item/started`, `item/completed`, `turn/started`, or `turn/completed` notification
is emitted by these calls through the final synchronization round trip.

This tests tool execution and event behavior, not visible rendering in the live
desktop. The bundled host rejects `thread/items/list` and `thread/read` with
`includeTurns`, so persisted conversation-item counts could not be compared. The
probe reports those errors explicitly rather than treating unavailable history
as an empty conversation.

There is no Python launcher in the installed plugin: its current definitions are
native `mcp_tool` hooks. They template `sessionId` from `${session_id}` and
`turnId` from `${turn_id}`. Those are tool arguments, not instructions to append
or render a conversation item. The prototype validates their basic types but
does not use either ID for selection, attribution, or widget placement. Exact
identity matching and the real collector remain unimplemented. The reported
hook counts prove execution, not the exact identity values received by those
past hook calls; they were not recorded.

The generated client protocol has 108 request methods. No dedicated app-panel,
widget-present, or conversation-tool-item append method was found. The two
relevant methods are `mcpServer/tool/call` and `thread/inject_items`; the latter's
documented purpose is writing model-visible Responses history, not presenting an
MCP App. It was not used to insert fabricated calls into the user's history.
The desktop's hook-completion path and widget registration/rendering code were
also inspected read-only. Rendering is additional client-side state, not a
missing `threadId`, client name, or MCP tool argument.

Replaying the desktop's MCP request is therefore possible and has been tested.
A working external request that also performs its UI registration has not been
found. Private renderer/IPC state manipulation is not a verified presentation API
and was not used to inject widgets into the desktop. No claim is made that every
possible unsupported host modification is impossible.

Sources: [app-server API](https://learn.chatgpt.com/docs/app-server#api-overview),
[plugin extensions](https://developers.openai.com/plugins/build/extensions), and
read-only inspection of the installed desktop and generated protocol.

Executed on Apple silicon macOS with the bundled Node 24.21.0 runtime:

- MCP initialization, tool discovery, and UI resource reads.
- In 0.1.3 only `open_monitor` was model- and app-visible; 0.1.4 also exposes
  `show_turn_summary` for explicit testing. Refresh and listing remain app-only.
  The launcher and summary use separate UI
  resources; only the launcher declares a thread entrypoint.
- MCP Apps UI-to-host-to-server tool calls return private result metadata without
  sending conversation messages or updating model context.
- Diagnostics report metadata field names and types without recording values.
- TypeScript checking and offline asset packaging.
- Native monitor regression suite: 62 Swift tests and 7 Python tests pass.
- Official Node archive checksum verified; executable declares minimum macOS 13.5.

Host diagnosis: the legacy `.mcp.json` loader in this Codex build does not expand
`${PLUGIN_ROOT}` in the command, arguments, or working directory. `codex mcp list`
showed a literal placeholder and a nonexistent working directory; desktop logs
confirmed startup failed with `No such file or directory`. The launcher now uses
`/bin/sh`, relative script arguments, and `cwd: "."`, which Codex resolves against
the installed plugin directory. Tests launch the exact manifest configuration,
including an extracted package directory containing spaces.

The separate local plugin was installed through the Codex CLI. The user later
confirmed the explicit-launch inline widget test worked. Computer Use refused
access to the Codex app, so automated native UI verification remains unavailable.
Automatic turn-end rendering failed the user's test despite confirmed hook
execution. Hiding/reopening behavior and host-chat identity remain unverified.

Version 0.1.3 adds two experimental MCP display hooks, but no full telemetry interface.
The prototype does not read transcripts, query the Codex database, or change
native monitor state. The future full-port acceptance scenarios remain in the
approved implementation plan.

User feedback confirmed that selecting the plugin in the composer only attaches
it, equivalent to an @ mention, and that the proposed manual launch route has
not worked in their Codex surface. That does not constitute a rendered-panel
test. The initial all-app-only tool visibility left no verified usable launcher.
The prototype now exposes `open_monitor` for an explicit model-driven diagnostic
launch, keeping ongoing refresh tools app-only. Manual, zero-model-turn opening
remains unverified; it is not a completed acceptance criterion.

The user subsequently confirmed that the launch test worked, but that the
result renders inline in chat and scrolls away. This confirms inline rendering,
not side-panel placement or hook-triggered rendering. Version 0.1.2 adds explicit
host display-mode diagnostics and capability-gated PiP/fullscreen request
buttons. The user subsequently confirmed expanded view works for their needs. The
native `/status` composer panel is not a documented plugin attachment surface.

Version 0.1.3 requests expanded view by default. Tests verify separate resources
for the live panel and frozen, inline-only completion summary. The Stop tool
does not change the live panel's display mode, and summary UI does not poll.
Five SDK/protocol tests cover discovery, presentation contracts, hook definition
contents, UI-only refresh, and private metadata handling.

The two new definitions require review and trust in Codex before they run.
`UserPromptSubmit` requests expanded view and `Stop` requests an inline summary.
These hooks return no prompts, model context, blocking decisions, or requests to
continue the turn. They use the existing MCP connection with a three-second timeout.

Execution is not proof of rendering: the generated host hook-completion protocol
carries text output entries, not an MCP UI result. Whether this host separately
presents the called resource was not established, and the user's turn-end test
produced no visible summary. Hook invocation counts in the live panel distinguish
execution from presentation. Do not claim automatic opening or summaries from
these experimental hooks. Merely switching to an existing chat does not trigger
UserPromptSubmit.
