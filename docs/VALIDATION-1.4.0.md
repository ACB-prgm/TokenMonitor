# TokenMonitor 1.4.0 validation

## Completed before private deployment

- 42 Node tests passed using the bundled Node 24.21.0 runtime; TypeScript checking passed.
- Six captured reference scenarios match the migrated collector: pricing, compaction, retained history, malformed/replayed records, attribution, and incomplete accounting.
- Tests cover partial/oversized lines, truncation/regrowth and atomic replacement; drive/UNC/case/traversal paths; symlink escapes; read-only SQLite contention and corrupt-schema fallback; concurrent hook processes; unavailable-file recovery; entry pruning and collector shutdown.
- The extracted macOS ARM64 package runs without developer Node or Python on PATH. It verifies and expands the bundled runtime, repairs a damaged cache, honors plugin cache storage precedence, records hooks, serves all four MCP tools and UI-only metrics, preserves unchanged revisions, and exits on stdin closure and SIGTERM.
- macOS x64 and Windows x64/ARM64 packages were inspected for pinned archive digests, executable format and CPU, package hashes, platform launchers, manifests and six hook declarations. They were not executed on those processors/operating systems locally.
- Disposable real Codex profiles discovered all six hooks without warnings, preserving their untrusted state. Clean marketplace install, update and removal passed while retaining a sentinel user state file. No existing hook trust was changed by these tests.
- A read-only smoke check against the active local chat produced available live telemetry through the TypeScript collector. Raw transcript content was not printed.
- Current sources and new packages contain no retired application or collector executable. Git history is preserved.

## Confirmation gates

The existing private account plugin is the deployment target. Its backend identity and audience must stay unchanged; obsolete uploaded files must be explicitly deleted and the full inventory read back. Existing TokenMonitor server/collector processes must be stopped during replacement.

Mac desktop rendering, real trusted lifecycle delivery and user confirmation remain separate from automated checks. Windows desktop testing remains pending. No GitHub push, tag, release edit, asset removal or publication is authorized before Mac confirmation in this sequence. After confirmation, prepare distribution through the protected GitHub flow and keep the new release in draft pending Windows testing.
