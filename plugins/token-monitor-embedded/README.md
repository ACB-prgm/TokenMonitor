# TokenMonitor Embedded 1.4.0

A local Codex token monitor with a React panel and an in-process TypeScript collector. Platform packages bundle Node; no system Node, Python, compiler, telemetry daemon, or API key is required.

The panel shows recorded input, cache reads and writes, output and reasoning, context capacity, account allowances, call history, tool attribution estimates, and API-equivalent costs. These estimates are not a bill or an exact measure of subscription consumption.

Open the monitor through `open_monitor`, or enable its first-prompt hook. UI refreshes call the local MCP server directly without additional model turns. Session hooks record only selected metadata. Compaction temporarily clears cache/fresh readings until another measured call arrives.

Install the package matching your OS and processor. macOS packages use a shell bootstrap; Windows packages use Windows PowerShell. Both verify and unpack the included Node runtime into private plugin storage. Collection, SQLite metadata reads, parsing, calculations and hooks share the same TypeScript implementation. Runtime operation requires no downloads.

Telemetry is read from `CODEX_HOME`, defaulting to `.codex` in your user home. Codex databases are opened read-only. Raw transcript text and absolute transcript paths are not returned to the panel. Plugin state remains under `CODEX_HOME/token-monitor-embedded`; `PLUGIN_DATA` takes precedence for the runtime cache when the host provides it.

If a task disappears, its last cached snapshot remains available until the idle collector entry expires. File replacement and truncation are detected on polling. Missing or incompatible database metadata is handled without modifying Codex data. Unknown pricing remains visibly unavailable.

This release retains the existing Codex-compatible manifest layout because the tested host discovers its six command hooks through that layout. Trust and enable hooks through Codex's normal controls.

License: PolyForm Noncommercial 1.0.0. See LICENSE, NOTICE, THIRD-PARTY-NOTICES.txt, and runtime/NODE-LICENSE.txt in the package.
