# TokenMonitor 1.8.1 validation

The maintainer authorized deployment and publication of version 1.8.1 on October 29, 2026.

The completed audit was validated at commit `af664aaa059bcaf9f3bcd3995047f9f39e679cf7`, before the version changed from 1.8.0:

- TypeScript typecheck, build, and all 160 plugin tests passed, including regressions for stale task snapshots, replaced-panel selections, keyboard previews, unknown cache readings, deep telemetry nesting, shutdown races, and unread update error bodies.
- Two isolated DEV workflow tests and release metadata checks passed.
- `npm audit` reported zero vulnerabilities after targeted dependency updates.
- Packages for all four supported targets were built and inspected. The native macOS ARM64 package passed runtime/MCP checks, installation/update/rollback, user-state retention, and hook discovery in disposable Codex profiles. Foreign-architecture inspection does not establish native execution on those platforms.

Version 1.8.1 metadata, package, local installation, and protected-branch/native release CI checks are pending at release preparation. Record those results here after they complete; earlier 1.8.0-labelled package checks do not verify the new release artifacts.

Trusted desktop rendering and lifecycle delivery were not verified by this audit. Installation does not grant hook trust. Windows desktop behavior requires separate verification. No telemetry schema, plugin identity, or license change is part of this patch.
