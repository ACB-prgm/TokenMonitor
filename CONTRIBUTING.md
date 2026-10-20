# Contributing

Use `dev` for ongoing work. Keep `main` stable and promote through a validated pull request. Preserve history and make focused local commits after verified milestones. Do not push private validation changes until the maintainer confirms the Mac deployment.

## Build and test

Use Node 24 LTS, npm and Python 3.12+ (archive extraction at build time). In `plugins/token-monitor-embedded`, run `npm ci`, `npm run build`, `npm run typecheck` and `npm test`. From the repository root, run `node scripts/check-release.mjs` and `node scripts/build-release.mjs --target PLATFORM`. Use `all` to package all four macOS/Windows targets. Runtime downloads are pinned by official archive SHA-256 values in the runtime manifest.

Run `node scripts/test-package.mjs --target PLATFORM` against the native package. On a Mac with Codex installed, also run `python3 scripts/test_embedded_hook_discovery.py` and `python3 scripts/test_release_install.py`. Host discovery tests use a disposable profile and do not grant hook trust. Desktop rendering and real lifecycle delivery require an enabled, trusted installation and user verification.

Tests cover captured collector reference fixtures, parser accounting, pricing, attribution, file changes, concurrent hooks, database contention, Windows path rules, direct MCP Apps refresh, and installed package behavior. Use synthetic fixtures without private transcript content.

## Release sequence

Version 1.4.0 first deploys privately to the existing account plugin, preserving identity and audience. Explicitly remove obsolete uploaded paths; uploads otherwise overlay existing files. Verify the read-back inventory and stop old TokenMonitor processes before reporting readiness for Mac testing.

After Mac confirmation, push `dev`, run the macOS/Windows CI matrix and promote through the protected branch flow. Prepare an annotated version tag and draft GitHub release with per-platform plugin ZIPs, complete marketplace ZIPs, notices and checksums. Keep it a draft until the maintainer completes Windows testing. Retire obsolete downloadable assets after Mac confirmation while preserving historical commits and tags. Do not claim architectures or desktop hosts were tested when only package inspection or path tests ran.

The release workflow creates drafts and refuses to replace an existing release. Only publish after platform confirmation. Changes to public tool names or the panel snapshot contract need corresponding integration tests and release notes.
