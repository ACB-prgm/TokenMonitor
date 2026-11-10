# Architecture

TokenMonitor runs a local TypeScript collector inside an MCP server and displays its results in a React panel.

## Data flow

Codex JSONL telemetry and read-only SQLite metadata → discovery and incremental parsing → calculations and durable numeric history → MCP responses → React panel. Lifecycle hooks ingest affected chats even when no panel is open. The lazy history worker backfills and maintains storage; it is not a detached service.

Account allowances use a separate installed Codex app-server subprocess and existing authentication. UI polls do not initiate model turns. Raw transcripts stay local; bounded activity excerpts are UI-only.

## Source map

| Subsystem | Source | Tests |
|---|---|---|
| MCP tools and panel transport | [server entry](../plugins/token-monitor-embedded/server/src/index.ts) | [refresh](../plugins/token-monitor-embedded/tests/refresh.test.mjs) |
| Discovery and parsing | [collector](../plugins/token-monitor-embedded/server/src/collector.ts) | [collector robustness](../plugins/token-monitor-embedded/tests/collector-robustness.test.mjs) |
| History worker and SQLite | [history database](../plugins/token-monitor-embedded/server/src/history-database.ts) | [history import](../plugins/token-monitor-embedded/tests/history-import.test.mjs) |
| React panel | [view](../plugins/token-monitor-embedded/ui/src/view.tsx) | [dashboard](../plugins/token-monitor-embedded/tests/dashboard.test.mjs) |

## Ownership and distribution

Codex owns its transcripts, metadata and authentication; TokenMonitor reads these without modifying chats. Plugin state owns caches, preferences and durable numeric history. DEV and release have separate identities, state and installations. See [history storage](reference/history-storage.md).

Release packages bundle Node and platform launchers. DEV uses the build host Node. The updater verifies package checksums and inventory before invoking the existing installer. See [installation](guides/installation.md) and [release procedure](guides/releasing.md).
