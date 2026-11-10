# TokenMonitor 1.11.0 validation

The maintainer authorized merging all development work to main and publishing version 1.11.0 on November 10, 2026. The release includes the unpublished development commits and preserves main's documentation reorganization and active-payback fix.

Local merged-source validation passed: all 318 plugin regression tests, TypeScript checking, production build, six DEV/usage-comparison tests, documentation checker regression tests, documentation navigation and Git diff checks. Merge regression coverage includes active compaction payback across imports/restarts, recorded usage accounting, continuation scope races, offline revocation and uncertain delivery.

Protected-branch CI and the annotated-tag release workflow validate native packages on macOS ARM64, Windows x64 and Windows ARM64, including installation/update/rollback and hook discovery. Publication requires successful native workflows and six ZIPs plus matching SHA-256 companions identifying the same tagged main commit. Final workflow outcomes are recorded in GitHub Actions.

Earlier installed DEV read-only smoke checks confirmed live account usage, selected-thread identity and settings visibility; see [app bridge cutover evidence](../../APP-BRIDGE-CUTOVER.md). No continuation messages were sent by those checks. Sustained usage-source comparison across a reset, real capped-work recovery, full desktop restart acceptance, and Windows desktop interaction remain unverified. Native automated checks do not grant hook trust or establish desktop lifecycle delivery. Automatic continuation remains opt-in and depends on a private app bridge.
