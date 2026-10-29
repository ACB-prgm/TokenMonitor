# TokenMonitor 1.8.1 validation

The maintainer authorized deployment and publication of version 1.8.1 on October 29, 2026.

The completed audit was validated at commit `af664aaa059bcaf9f3bcd3995047f9f39e679cf7`, before the version changed from 1.8.0:

- TypeScript typecheck, build, and all 160 plugin tests passed, including regressions for stale task snapshots, replaced-panel selections, keyboard previews, unknown cache readings, deep telemetry nesting, shutdown races, and unread update error bodies.
- Two isolated DEV workflow tests and release metadata checks passed.
- `npm audit` reported zero vulnerabilities after targeted dependency updates.
- Packages for all four supported targets were built and inspected. The native macOS ARM64 package passed runtime/MCP checks, installation/update/rollback, user-state retention, and hook discovery in disposable Codex profiles. Foreign-architecture inspection does not establish native execution on those platforms.

Version 1.8.1 was then validated at release-preparation commit `4a429ca`:

- Build, typecheck, all 160 plugin tests, two DEV workflow tests, release metadata checks, and diff checks passed after the version change.
- The clean macOS ARM64 package passed offline runtime startup, checksum repair, MCP metrics, hooks, and shutdown.
- Two disposable-profile installation tests passed clean installation, update, rollback, user-state retention, and Git marketplace refresh. A separate hook-discovery test found all six hooks without granting trust.

The [protected-branch CI](https://github.com/ACB-prgm/TokenMonitor/actions/workflows/ci.yml) and [annotated-tag release workflow](https://github.com/ACB-prgm/TokenMonitor/actions/workflows/release.yml) validate the promoted source on native macOS ARM64/Intel and Windows ARM64/x64 runners. Publication requires both workflows to succeed and all eight ZIPs and matching checksum files to identify the same tagged source commit. Consult the `v1.8.1` release workflow for the final artifact evidence.

Trusted desktop rendering and lifecycle delivery were not verified by this audit. Installation does not grant hook trust. Windows desktop behavior requires separate verification. No telemetry schema, plugin identity, or license change is part of this patch.

Native CI exposed an intermittent Windows ARM64 status-file replacement failure. The updater now retries only transient Windows lock errors with bounded asynchronous waits and retains explicit failure status if persistence fails. Four fault-injection regressions cover transient recovery, exhausted retries, unrelated errors, and unchanged POSIX behavior; the expanded suite contains 164 tests.
