# TokenMonitor 1.6.0 validation

The maintainer authorized private deployment and GitHub release preparation on October 24, 2026. Public distribution follows the protected main-branch PR and annotated-tag workflow; the resulting GitHub release stays in draft.

- TypeScript typecheck, build, and 103 plugin tests passed for the feature changes, including compaction boundaries and bounded activity association, resets, deduplication, escaping inputs, and excluded transcript content.
- Two isolated DEV workflow tests passed.
- Browser checks passed for hover previews, click and keyboard pin/toggle/clear, restoration of a pinned selection, mode and chat changes, evicted samples, activity/empty states, HTML escaping, and narrow layouts. The dark narrow panel was visually inspected.
- Native package, installation/update/rollback, and hook-discovery validation is rerun for release preparation. Four-platform CI and release workflows supply native OS/CPU results.

Activity is heuristic metadata attached to the next accepted usage event, not a message locator. Explicit file targets come from edit requests and are not verified successful changes. Windows desktop rendering and trusted lifecycle delivery remain unverified locally. No hook trust or sharing changes are part of this release.
