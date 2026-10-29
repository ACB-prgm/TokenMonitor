# TokenMonitor 1.8.1

Reliability and security fixes from a repository audit, preserving the existing panel, telemetry contracts, and installation workflow.

- Clear the previous chat's cached snapshot before a task switch, so a failed refresh cannot show its metrics under the new selection. Discard queued task selections when the host replaces a panel.
- Keep missing or invalid cache readings unavailable in latest-call metrics and history instead of treating them as measured zero cache reads.
- Parse deeply nested telemetry without recursive fingerprinting, tolerate malformed workspace metadata, stop title truncation after 90 graphemes, and parse startup-hook input once.
- Keep keyboard call previews aligned with focus and prevent queued account-allowance work from starting after shutdown.
- Retry transient Windows updater status-file locks with bounded asynchronous waits and retain explicit failure reporting.
- Cancel unread HTTP error bodies during update checks and downloads. Update Zod, body-parser, fast-uri, and qs to address reported dependency vulnerabilities.
- Restore the browser preview's host connection and current compaction forecast fixtures.

Version 1.8.1 passed 164 plugin tests, two DEV workflow tests, typecheck, build, and native package/install/rollback/hook-discovery checks. The dependency audit reported zero vulnerabilities. The protected-branch and annotated-tag workflows validate all four native packages before publication; see the [validation record](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/VALIDATION-1.8.1.md). Automated hook discovery does not verify trusted desktop lifecycle delivery or rendering.

Existing local release installations can use **Update and install** after publication. For manual installation, use the complete `token-monitor-1.8.1-TARGET.zip` and matching checksum, following the [installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/INSTALL.md). Restart Codex after installation and review hook trust if prompted. Account and Git installations retain their original update mechanism.
