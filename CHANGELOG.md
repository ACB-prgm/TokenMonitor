# Changelog

## Unreleased

## 1.11.0

- Account for verified recorded compaction usage, disclose remaining estimates, and show separate gray compaction bars with break-even markers.
- Keep spending comparisons in the KPI container and focus insights on context capacity and evidence-backed compaction guidance.
- Share live app-bridge account usage and add persistent Off, Current thread and All threads continuation settings for confirmed usage-limit interruptions.
- Harden continuation capacity checks, atomic scope changes, offline revocation, uncertain delivery and restart recovery.
- Count valid active compactions at break-even and retain recovery checks beyond the visible chart window.
- Consolidate documentation into canonical guides, references and release records with checked navigation.

- Count valid active compactions as paid back immediately when they reach break-even, while continuing to track savings and validity until the epoch closes.

## 1.10.0

- Add a **KPIs** tab to Recent calls with smooth Context / call and Cost / call USD trends, without data dots. Each point represents the running thread average through that call, including earlier calls outside the visible window. Cost / call includes compaction charges; the Cost tab retains its call cost bars.
- Show compaction progress in the context ring.
- Preserve queued history updates from concurrent panels and refresh saved history metadata independently of transcript changes.
- Preserve saved thread titles when catalogue metadata is unavailable.
- Avoid repeated remainder copies when reading JSONL records.

## 1.9.1

- Display Context / call and Cost / call with four decimal places in both KPI rows and expanded calculation results.
- Restore KPI percentage badge colors: amber above 10%, red above 30%, and green at least 10% lower. Provisional comparisons remain neutral.

## 1.9.0

- Redesign the dashboard with consolidated thread usage, compact expandable efficiency KPIs, accessible controls, fixed health thresholds, and responsive call details.
- Add searchable historical thread discovery, archive filtering, loaded-skill attribution, and clearer tool-call inspection.
- Compare context, cost and compaction payback against model/effort-matched local history with explicit coverage and provisional results.
- Estimate conservative turn-based compaction payback, suppress guidance when evidence is ambiguous or stale, and show age-based cache warmth.
- Retain local numeric history in SQLite with incremental collection, 90-day detail retention, permanent daily summaries, migration, compatible repricing, recovery and on-demand storage diagnostics.

- Forecast context growth from recent same-model personal history until the current segment has 20 intervals, then use its latest-20 mean. Remove the observed-growth floor, retain the 2K fallback, and disclose the estimate source and counts.

## 1.8.1

- Retry transient Windows updater status-file locks without losing explicit failure reporting.

- Clear stale task snapshots before switching chats and discard queued selections when a panel is replaced.
- Preserve unknown cache readings in latest-call metrics and history; tolerate deeply nested telemetry and malformed workspace metadata.
- Keep keyboard call previews aligned with focus and stop queued allowance refreshes after shutdown.
- Release unread HTTP error responses during update checks and downloads; update vulnerable validation and transport dependencies.
- Bound title truncation work, avoid duplicate startup-hook JSON parsing, and restore the browser preview with current forecast fixtures.

## 1.8.0

- Remove the extra allowance source/status row; retain source and freshness information in hover help.
- Smooth recent-call previews with immediate switching, delayed animated dismissal, keyboard/pinning support and reduced-motion handling.
- Refresh account allowances from the signed-in Codex account, with bounded cross-chat catalogue fallback and per-window source/freshness indicators.

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
