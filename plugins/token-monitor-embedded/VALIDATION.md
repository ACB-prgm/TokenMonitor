# Embedded prototype validation

Status: **inline rendering, refresh, and expanded view confirmed by the user;
automatic turn-end inline rendering did not appear in the reported test;
the effect of expanded placement remains unresolved**.

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
different, inline-only resource and is app-only. A successful model launcher call
is not a successful test of the Stop summary resource. Do not conflate these
tools or infer a cause from the absence of a new inline card alone.

The next host check is a normal response with the expanded monitor closed and
no explicit model launch request. Automatic summary appearance in that condition
has not been established. A controlled comparison of the same resource/call path
with expanded placement open and closed is still needed before claiming a
placement-specific cause.

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

Executed on Apple silicon macOS with the bundled Node 24.21.0 runtime:

- MCP initialization, tool discovery, and UI resource reads.
- Only `open_monitor` is model- and app-visible; refresh, listing, and the new
  `show_turn_summary` remain app-only. The launcher and summary use separate UI
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
