# TokenMonitor 1.9.0 validation

The maintainer authorized pushing development changes to main and publishing the release on November 1, 2026.

Release preparation validates the production build, TypeScript types, plugin regression tests, isolated DEV workflow, release metadata, and native macOS ARM64 package behavior. The production build, TypeScript typecheck, all 255 plugin tests, all four isolated DEV workflow tests, release metadata and diff checks passed using the pinned Node 24.21.0 runtime. Native package results are recorded after final clean-source packaging.

The protected-branch CI and annotated-tag release workflows run package, installation/update/rollback, user-state retention and hook-discovery validation natively on macOS ARM64/Intel and Windows ARM64/x64. Publication requires successful workflows and eight ZIPs with matching SHA-256 companions identifying the same tagged main commit. The GitHub Actions run records provide the final platform results.

Prior dashboard browser checks and durable-history scale measurements are recorded in [DASHBOARD-REDESIGN.md](DASHBOARD-REDESIGN.md), [HISTORICAL-EFFICIENCY.md](HISTORICAL-EFFICIENCY.md), and [HISTORY-BENCHMARK.json](HISTORY-BENCHMARK.json). These are development evidence, not new desktop checks performed during release preparation. Automated hook discovery does not grant trust or verify real desktop lifecycle delivery. Windows desktop interaction remains unverified locally.
