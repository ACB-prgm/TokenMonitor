# TokenMonitor 1.9.0 validation

The maintainer authorized pushing development changes to main and publishing the release on November 1, 2026.

Release preparation validates the production build, TypeScript types, plugin regression tests, isolated DEV workflow, release metadata, and native macOS ARM64 package behavior. The production build, TypeScript typecheck, all 255 plugin tests, all four isolated DEV workflow tests, release metadata and diff checks passed using the pinned Node 24.21.0 runtime. Clean-source native macOS ARM64 packaging at `a396e07` passed checksum/inventory and runtime startup, all six hooks, runtime-cache repair, MCP metrics and shutdown. The package test was updated to recognize the new panel-only history-storage diagnostic, verifying the exact six-tool inventory and app-only visibility.

Both disposable-profile installation tests passed clean installation, update, rollback, user-state retention and Git marketplace refresh; a fresh MCP connection loaded 1.9.0. The isolated hook-discovery test found all six hooks without granting trust. The loopback Git marketplace fixture required execution outside the network sandbox.

The protected-branch CI and annotated-tag release workflows run package, installation/update/rollback, user-state retention and hook-discovery validation natively on macOS ARM64 and Windows ARM64/x64. Publication requires successful workflows and six ZIPs with matching SHA-256 companions identifying the same tagged main commit. The GitHub Actions run records provide the final platform results.

Prior dashboard browser checks and durable-history scale measurements are recorded in [DASHBOARD-REDESIGN.md](DASHBOARD-REDESIGN.md), [HISTORICAL-EFFICIENCY.md](HISTORICAL-EFFICIENCY.md), and [HISTORY-BENCHMARK.json](HISTORY-BENCHMARK.json). These are development evidence, not new desktop checks performed during release preparation. Automated hook discovery does not grant trust or verify real desktop lifecycle delivery. Windows desktop interaction remains unverified locally.

The first four-platform run exposed Unix-only file-URL pathname conversion in new tests and the history benchmark, plus an unchanged-revision assertion that could race background history import on Windows. These now use native `fileURLToPath` conversion and a bounded wait for settled background work. All 255 plugin tests passed locally after the corrections; the platform matrix is rerun before promotion.

After path correction, both Windows runs reported a failure deleting the hook fixture directory during cleanup. Cleanup now closes any remaining database handle, preserving earlier assertion errors, and retries transient Windows file locks with a bounded backoff, matching the existing package-test cleanup strategy.

With cleanup corrected, the underlying hook assertion showed that cold SQLite schema initialization on Windows can consume the existing 500 ms best-effort import budget. The integration fixture now allows bounded later lifecycle deliveries to resume that import, then verifies exactly one collected chat/call and idempotence without any panel or background service. Each delivery retains its existing timeout assertion; production hook budgets are unchanged.

Native Intel macOS validation exposed the same background-import revision race in the packaged MCP smoke check. That check now waits up to five seconds for discovery/history to settle before asserting an unchanged refresh, while retaining runtime, metrics, inventory and shutdown assertions.

The maintainer narrowed publication to macOS ARM64, Windows x64 and Windows ARM64. CI and release packaging now use those three native targets, with six ZIPs and six checksum companions. Intel macOS and Linux are excluded from this release; local Intel build support is retained. Earlier four-platform results above describe the investigation before this scope change.
