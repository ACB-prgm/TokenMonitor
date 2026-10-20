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

## Private deployment completed

- Updated the existing private workspace plugin to 1.4.0 without changing its identity or audience: [TokenMonitor Embedded](https://chatgpt.com/plugins/Plugin_df57c7c0b9d08191936d851916050a02).
- Backend release: `pluginrel_6ad7821f44908191aa391a22d0843d59`. Full read-back inventory contains the new Node modules and excludes the obsolete collector executable. The uploaded package was built from clean commit `3005c6f77946762c37ceb43ec19ae268a3745189`.
- Refreshed the existing local account-plugin cache with the exact verified package. The account plugin was not exposed through the CLI marketplace refresh selector, so the existing remote-identity marker was preserved while replacing its version cache.
- Gracefully stopped three old server processes, removed the obsolete local version cache, and verified no retired application, collector or old server process remained. User telemetry and plugin state were retained.
- Started the actual installed launcher with developer tools absent from PATH. MCP reported 1.4.0, all four tools, available live metrics for the active chat, and the 1.4.0 UI resource. The smoke-test connection was then closed.
- Existing desktop connections require a Codex reload. Mac visual behavior and trusted lifecycle delivery await the user's confirmation; Windows execution remains unverified locally.
- No GitHub push, tag, release change or public asset removal occurred during this migration.
