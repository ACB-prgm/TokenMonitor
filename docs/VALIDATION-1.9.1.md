# TokenMonitor 1.9.1 validation

The maintainer authorized production deployment and publication on November 2, 2026.

The patch restores percentage badge colors and fixes the display precision of Context / call and Cost / call. All 255 plugin regression tests, TypeScript checking and the production build passed locally. Existing KPI tests also verify four decimal places across comparison periods. Comparison calculations retain their full precision, and provisional comparisons retain their neutral color.

Release preparation runs release metadata checks, native macOS ARM64 package validation, isolated installation/update/rollback and hook-discovery checks. Protected-branch CI and annotated-tag release workflows validate packages on macOS ARM64, Windows x64 and Windows ARM64. Publication requires successful native workflows and six ZIPs with matching SHA-256 companions identifying the same tagged main commit; the GitHub Actions runs record those final results.

These automated checks do not grant hook trust or establish real desktop lifecycle delivery. A local headless Chrome check could not start in the execution environment, so no new browser-rendering result is claimed. Windows desktop interaction remains unverified locally.
