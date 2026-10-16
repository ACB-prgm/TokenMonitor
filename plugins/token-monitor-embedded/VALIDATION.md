# Embedded prototype validation

Status: **inline rendering, refresh, and expanded view confirmed by the user;
automatic hook-triggered rendering unverified**.

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
Hook-triggered rendering, hiding/reopening behavior, and
host-chat identity remain unverified.

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
presents the called resource is unverified. Hook invocation counts in the live
panel distinguish execution from presentation. Check two successive prompts for
automatic opening, duplicate panels, turn-end summary rendering, and continued
live-panel visibility before claiming automatic behavior. Merely switching to an
existing chat does not trigger UserPromptSubmit.
