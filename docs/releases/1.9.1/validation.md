# TokenMonitor 1.9.1 validation

The maintainer authorized production deployment and publication on November 2, 2026.

The patch restores percentage badge colors and fixes the display precision of Context / call and Cost / call. All 255 plugin regression tests, TypeScript checking and the production build passed locally. Existing KPI tests also verify four decimal places across comparison periods. Comparison calculations retain their full precision, and provisional comparisons retain their neutral color.

Release metadata, four DEV workflow tests, native macOS ARM64 package validation, both isolated installation/update/rollback tests and hook discovery passed locally using the pinned Node 24.21.0 runtime. The package checks covered runtime startup, inventory, all six hooks, cache repair, MCP metrics and shutdown. Protected-branch CI and annotated-tag release workflows validate packages on macOS ARM64, Windows x64 and Windows ARM64. Publication requires successful native workflows and six ZIPs with matching SHA-256 companions identifying the same tagged main commit; the GitHub Actions runs record those final results.

These automated checks do not grant hook trust or establish real desktop lifecycle delivery. An isolated headless Chrome check verified computed green, amber, red and neutral badge colors for both KPI rows in light and dark themes (16 checks). Windows desktop interaction remains unverified locally.
