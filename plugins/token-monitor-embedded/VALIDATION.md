# Embedded prototype validation

Status: **prototype ready; actual Codex panel check pending**.

Executed on Apple silicon macOS with the bundled Node 24.21.0 runtime:

- MCP initialization, tool discovery, and UI resource reads.
- All three tools are app-visible only; only the launcher declares a UI resource
  and a thread entrypoint.
- MCP Apps UI-to-host-to-server tool calls return private result metadata without
  sending conversation messages or updating model context.
- Diagnostics report metadata field names and types without recording values.
- TypeScript checking and offline asset packaging.
- Native monitor regression suite: 62 Swift tests and 7 Python tests pass.
- Official Node archive checksum verified; executable declares minimum macOS 13.5.

The separate local plugin was installed through the Codex CLI. Installation does
not prove that its panel rendered. Computer Use refused access to the Codex app;
therefore user-click opening, actual host delivery of result metadata, live
refresh, hiding/reopening, and host chat identity remain unverified.

No lifecycle hooks or full telemetry interface have been added before that gate.
The prototype does not read transcripts, query the Codex database, or change
native monitor state. The future full-port acceptance scenarios remain in the
approved implementation plan.
