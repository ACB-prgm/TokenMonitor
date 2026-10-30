# TokenMonitor Embedded 1.8.1

A local Codex token monitor with a React panel and an in-process TypeScript collector. Platform packages bundle Node; no system Node, Python, compiler, telemetry daemon, or API key is required.

The panel shows recorded input, cache reads and writes, output and reasoning, context capacity, account allowances, call history, tool attribution estimates, and API-equivalent costs. These estimates are not a bill or an exact measure of subscription consumption.

Open the monitor through `open_monitor`, or enable its first-prompt hook. UI refreshes call the local MCP server directly without additional model turns. Each poll checks task metadata and incrementally reads appended transcript bytes into a cached parser, then compares revisions; unchanged responses retain the current view. File replacement, truncation or rewriting resets the parser. Polling keeps the task selector and refresh control enabled, and selections made during a pending poll are processed afterward. Session hooks record only selected metadata. Compaction temporarily clears cache/fresh readings until another measured call arrives.

Install the package matching your OS and processor. macOS packages use a shell bootstrap; Windows packages use Windows PowerShell. Both verify and unpack the included Node runtime into private plugin storage. Collection, SQLite metadata reads, parsing, calculations and hooks share the same TypeScript implementation. Runtime operation requires no downloads.

Telemetry is read from `CODEX_HOME`, defaulting to `.codex` in your user home. Codex databases are opened read-only. Raw transcript text and absolute transcript paths are not returned to the panel. Plugin state remains under `CODEX_HOME/token-monitor-embedded`; `PLUGIN_DATA` takes precedence for the runtime cache when the host provides it.

If a task disappears, its last cached snapshot remains available until the idle collector entry expires. File replacement and truncation are detected on polling. Missing or incompatible database metadata is handled without modifying Codex data. Unknown pricing remains visibly unavailable.

This release retains the existing Codex-compatible manifest layout because the tested host discovers its six command hooks through that layout. Trust and enable hooks through Codex's normal controls.

License: PolyForm Noncommercial 1.0.0. See LICENSE, NOTICE, THIRD-PARTY-NOTICES.txt, and runtime/NODE-LICENSE.txt in the package.

## Release updates

The version label opens the update menu. Stable GitHub release checks run in the background at every live-panel opening by default; they do not gate telemetry, run from hooks, or add model turns. Disable automatic checks, check manually, select a package, or dismiss a version from the menu. Offline failures remain unknown. Update settings and cached release metadata use `PLUGIN_DATA/updates`, falling back to `CODEX_HOME/token-monitor-embedded/updates`.

For a first installation, download the complete marketplace ZIP and its checksum, verify before extracting, then run its root `install.sh` or `install.ps1`. For an existing local release marketplace installation, choose **Update and install** in the version menu. A background worker downloads and verifies the native package, then runs the existing installer through Codex while monitoring continues. The helper uses the bundled runtime and existing Codex CLI and preserves previous release sources for rollback. Restart Codex and review hook trust after installation. Direct/account and Git deployments must update through their original source. See the repository's `docs/INSTALL.md` for commands and recovery details. The development source Git marketplace is not a self-contained cross-platform installation.

## Compaction Value

The latest-call bar shows CV as a score out of 100. Expand it for classification, context reduction, growth, typical billed output, 20-call horizon, break-even, overhead, net savings, model and assumptions. CV measures net savings against avoidable context-processing costs using the active model/tier/regional rates and each projected call’s long-context pricing. Growth uses your recent same-model average until the current context segment has 20 valid intervals (21 calls), then its latest-20 average. Observed growth is unclamped; 2,000 tokens/call is only a fallback when personal history is insufficient. The expanded panel identifies the source and interval counts. It assumes 40K retained context, 3,600 compaction output tokens and one replacement cache write.

Growth is the rolling mean of up to 20 valid intervals after the latest compaction/context reset, floored at 2K tokens per call (default 2K with fewer than three samples). Typical output is the rolling median of up to 20 recorded calls including reasoning, preferably from the active model, floored at 1K (default 3K with fewer than three samples). Zero observations count. Break-even is the first forecast call that recovers overhead; **>20 calls** means the horizon does not recover it.

The fixed 20-call horizon provides a consistent comparison; the fixed 40K retained context is an assumption, not a preservation guarantee. The forecast assumes warm-prefix reuse. Cache temperature does not change CV; future cache misses may change realized savings. Unsupported pricing and incomplete/currently compacting context remain unavailable. A reported context-window limit stops impossible projections and shows an explicit limitation. These are API-equivalent estimates, not subscription charges or invoices. A financial score does not measure semantic context quality. No new model turns, telemetry persistence or network requests are used for CV.

## Account allowances and history previews

Account allowances use the installed, signed-in Codex CLI through a shared stdio app-server connection. Live account reads refresh every 30 seconds while monitoring, with five-second deadlines and bounded retries. The connection closes after 60 seconds without state requests. This may make account network requests, but creates no model turns or logins. If unavailable, the newest timestamped quota events across the local catalogue supply each window independently. Catalogue scans are limited to the last 1 MiB of changed, validated transcripts and may be incomplete. Sources and observation times are disclosed; expired resets show “Awaiting refresh.” Chat selection still controls thread-specific metrics.

Recent-call previews switch immediately and stay mounted between columns. Leaving starts a 200 ms hide delay followed by a 140 ms fade/collapse; re-entry cancels dismissal. Focus, pinning, Clear selection, Escape and reduced-motion preferences are supported.
