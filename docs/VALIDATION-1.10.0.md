# TokenMonitor 1.10.0 validation

The maintainer authorized promotion to main and publication with a minor version increase on November 5, 2026.

All 266 plugin regression tests, TypeScript checking and the production build passed locally for the feature changes. Trend checks cover smooth curves without dots, missing prices, duplicate calls, retained history beyond the chart window, and agreement with KPI accounting through compaction and retained-context adjustments.

The release process validates synchronized metadata, DEV workflow tests, the native macOS ARM64 package, isolated installation/update/rollback, and hook discovery. Protected-branch CI and the annotated-tag release workflow validate packages on macOS ARM64, Windows x64 and Windows ARM64. The GitHub Actions runs record the final platform results. Publication requires successful native workflows and six ZIPs with matching SHA-256 companions identifying the same tagged main commit.

Automated checks do not grant hook trust or establish real desktop lifecycle delivery. Windows desktop interaction remains unverified locally.
