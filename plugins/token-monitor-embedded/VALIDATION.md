# Embedded prototype validation

Status: **inline rendering confirmed by user; persistent placement unverified**.

Executed on Apple silicon macOS with the bundled Node 24.21.0 runtime:

- MCP initialization, tool discovery, and UI resource reads.
- Only `open_monitor` is model- and app-visible; refresh and listing remain
  app-only. Only the launcher declares a UI resource and a thread entrypoint.
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
Hook-triggered rendering, persistent placement, hiding/reopening behavior, and
host-chat identity remain unverified.

No lifecycle hooks or full telemetry interface have been added before that gate.
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
buttons. Actual persistent placement still requires testing in this host. The
native `/status` composer panel is not a documented plugin attachment surface.
