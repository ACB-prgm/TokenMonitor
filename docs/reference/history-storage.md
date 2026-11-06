# History storage



The private `efficiency.sqlite` in each plugin state directory is durable storage for imported numeric telemetry. DEV and release keep separate databases. Typed tables hold recent calls and numeric lifecycle boundaries, daily aggregates, materialized cohort totals, compaction outcomes, and small import checkpoints. Model/pricing dimensions and calculation definitions are interned. Chat labels and workspace names support saved-chat selection; prompts, excerpts, tool arguments, transcript content and reasoning text are not retained. Codex databases and transcripts remain read-only.

Recent call, turn, compaction-boundary, charge and replay detail expires after 90 UTC calendar days including today. Daily spending and completed-compaction summaries remain permanently. Small current-epoch/parser checkpoints retain the state required to continue an active chat. Retention therefore limits detailed history rather than imposing a fixed database size. Missing source files do not erase imported summaries; saved chats remain searchable, with source availability and retained-detail coverage disclosed.

Existing lifecycle hooks import only their affected chat, even without an open panel. Each invocation reads at most 4 MiB of transcript body and targets 500 ms of ingestion, checking its time budget between complete records. Header/checkpoint verification and transaction commit add bounded overhead; the time target is not a hard real-time guarantee. Incomplete records stay in the source file. Work that exceeds a batch resumes at the next hook or panel import; disabled hooks or source loss before import cannot be recovered by the database.

A lazy worker shared by a server's panels performs backfill, compatible repricing and retention. It is not a detached service. Imports commit numeric contributions and their byte checkpoint together. Replacement, truncation and checkpoint changes trigger a staged rebuild; the previous contribution remains published until replacement completes. Replay fingerprints and numeric checkpoints prevent duplicate accounting across process restarts. No raw partial lines are saved in checkpoints. Old replay windows are bounded during backfill and expired keys are removed incrementally.

Normal refreshes reuse catalogue metadata and stat signatures, importing only selected/hook activity. Full discovery is reserved for opening, discovery changes and explicit rescan. Historical queries use indexed daily data and materialized lifetime totals. Snapshots are cached by storage revision, chat, UTC day and import state, limited to 64 entries and 16 MiB of serialized results; that limit is not a total-process RAM cap. Unchanged historical refreshes do not rewrite analytics or read transcript bodies. Live transcript tails also skip reads when their identity and stat signature are unchanged.

Legacy per-chat JSON migrates one chat per transaction and is removed only after conversion. Obsolete numeric baseline buffers are reduced to aggregate metadata. Compatible retained numeric sequences can be replayed for repricing, including compactions when their required context is complete. Partial retained days can reprice ordinary calls when completeness is established. Older or incompatible estimates remain visible under their recorded calculation version; mixed historical versions make comparisons provisional.

The bundled runtime includes a SQLite version with the multi-connection WAL-reset fix; unsupported older runtimes pause durable history rather than risking the database. SQLite uses WAL, durable commits, short transactions, bounded lock waits and an approximately 4 MiB automatic checkpoint target. The journal target is not an absolute cap while readers or writes are active. Maintenance prunes bounded batches, checkpoints the journal and incrementally vacuums fresh stores. Migrated databases reuse free pages without an automatic full-database vacuum. No recurring backups or snapshot archives are created. Storage errors preserve the last committed cursor/data and surface paused collection while live telemetry continues. A database from a newer schema is not reset or overwritten.

Use **Settings → History storage → Inspect storage** to read database/journal bytes, reusable space, retention, import backlog and frozen-version coverage on demand. These diagnostics do not run on every poll.

## Validation

Run `npm --prefix plugins/token-monitor-embedded run history:bench` for the reproducible scale fixture: one million calls across 10,000 chats, 100,000 recent detailed calls, realistic numeric checkpoints, append-only import and ten source replacement/retention cycles. The fixture is temporary and removed afterward. [Recorded measurements](../evidence/history-benchmark.json) include Node/SQLite versions, storage and journal bytes, RSS growth, and timings. Cached cold means a reopened store with the OS file cache warm; timings exclude MCP transport and UI rendering. RSS growth describes the benchmark process, not a guaranteed application memory limit.

On the bundled macOS ARM64 Node 24.21.0 / SQLite 3.53.4 runtime, the recorded run passed the p95 targets of 50 ms warm and 250 ms cached cold. The database was approximately 107 MiB with detail and 37 MiB after expiry, with no backup copies. Repeated replacement/prune cycles stabilized around 35 MiB. These are synthetic workload measurements, not a hard storage cap or a promise for every machine.

The automated suites cover accounting parity, partial lines, large records, duplicate/replayed events, transaction rollback, retention, orphaned legacy data, compatible repricing, compaction closure, hook-only collection, and fresh DEV MCP restart/source restoration. The bundled panel's on-demand storage settings were inspected at 600 px and 320 px widths. Installed desktop presentation still requires the host restart that loads a newly installed DEV build.

## Discovery

The catalogue combines Codex metadata with validated local JSONL headers. Initial discovery scans sessions and archived sessions; warm launches reuse the discovery cache. Hooks and unknown host IDs use targeted lookup. Rescan threads discovers subsequently restored files. Missing source files cannot be reconstructed; already imported numeric summaries remain available.

[Discovery implementation](../../plugins/token-monitor-embedded/server/src/discovery.ts) and [DEV cold-start checks](../../scripts/dev.test.mjs) cover this boundary.

## Source and tests

[Implementation](../../plugins/token-monitor-embedded/server/src/history-database.ts) · [Regression tests](../../plugins/token-monitor-embedded/tests/history-import.test.mjs) · [Documentation index](../index.md)
