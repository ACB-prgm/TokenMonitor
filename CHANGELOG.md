# Changelog

## Unreleased

- Replace compaction heuristics and the secondary break-even with a single numeric, model-priced 20-call forecast and consistent payoff calculation.
- Measure bounded per-thread rolling context growth and median billed output; disclose defaults, minima and active-model selection.
- Account for per-call long-context rates, one replacement-context cache write and compaction output; keep cache temperature separate.
- Show forecast economics and capacity limitations in compact/expanded layouts, with deterministic pricing and telemetry regression coverage.

## 1.7.0

- Replace ZIP and SHA download buttons with **Update and install** for existing local release marketplace installations.
- Download and verify the native release in a background worker, report progress and failures in the panel, and preserve existing rollback and hook-trust behavior.

## 1.6.0

- Restyle recent-call details to match the panel and remove the duplicate bar tooltip.
- Pin call details by clicking a bar; click the same bar again to clear the selection, with equivalent keyboard controls.
- Add bounded Activity excerpts, tool requests, and explicit file targets to call details.
- Set latest-call normal text to 12px at the default scale.
- Recalibrate compaction value labels to reachable break-even ranges without changing the estimate.
- Add an isolated Token Monitor DEV build and local installation workflow.

## 1.5.0

- Check stable GitHub releases on each live-panel opening without waiting on network responses.
- Add compact version-label update controls, platform selection, persistence, and per-version dismissal.
- Add verified guided installation, recovery, and rollback using the bundled runtime and Codex CLI.
- Include `d9f1fe6`: remove Expand/Compact and preserve controls and selections during incremental refresh.
- Validate native release packages and clean install/update/rollback across the platform CI matrix.
- Preserve all six hooks, telemetry behavior, plugin identity, and user data.

## 1.4.0

- Move all telemetry collection and calculations into the bundled Node/TypeScript MCP server.
- Preserve existing panel tools, metrics, task selection, automatic opening and direct UI refreshes.
- Package macOS Apple silicon/Intel and Windows x64/ARM64 runtimes with platform launchers and pinned checksums.
- Add cross-platform file/path handling, read-only SQLite metadata discovery, bounded collector entries and concurrent hook writes.
- Remove the retired native application, its collector executable, installers and obsolete distribution material.
- Add captured metric parity fixtures, lifecycle and package validation.

Historical release; current validation requirements are documented in CONTRIBUTING.md.
