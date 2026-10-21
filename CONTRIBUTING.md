# Contributing

Use `dev` for ongoing work. Keep `main` stable and promote through a validated pull request. Preserve history and make focused local commits after verified milestones. Do not push private validation changes until the maintainer confirms the Mac deployment.

## Build and test

Use Node 24 LTS, npm and Python 3.12+ (archive extraction at build time). In `plugins/token-monitor-embedded`, run `npm ci`, `npm run build`, `npm run typecheck` and `npm test`. From the repository root, run `node scripts/check-release.mjs` and `node scripts/build-release.mjs --target PLATFORM`. Use `all` to package all four macOS/Windows targets. Runtime downloads are pinned by official archive SHA-256 values in the runtime manifest.

Run `node scripts/test-package.mjs --target PLATFORM` against the native package. On a Mac with Codex installed, also run `python3 scripts/test_embedded_hook_discovery.py` and `python3 scripts/test_release_install.py`. Host discovery tests use a disposable profile and do not grant hook trust. Desktop rendering and real lifecycle delivery require an enabled, trusted installation and user verification.

Tests cover captured collector reference fixtures, parser accounting, pricing, attribution, file changes, concurrent hooks, database contention, Windows path rules, direct MCP Apps refresh, and installed package behavior. Use synthetic fixtures without private transcript content.

## Release sequence

Develop, validate and commit on `dev`. Open a PR to protected `main` and merge after required checks pass. Create an annotated version tag on the validated `main` commit. The release workflow validates that source, builds each package on its native OS/CPU, runs install/update/rollback and hook-discovery checks, and creates a draft. Publish only after platform and desktop validation are satisfactory. Never build a public release from `dev`, replace an existing release, or change published 1.4.0 artifacts.

Local builds on `dev` are verification artifacts. Distributable installation helpers reject packages marked dirty; commit validated changes before final package testing. All platform artifacts record the source commit and come from the same tag. The release notes path follows `VERSION`.

Run `python3 scripts/test_release_install.py` with Codex and Git available to exercise two distinct runnable package versions, native installation, rollback, user-data retention, and a disposable HTTP Git marketplace. The older version is a synthetic fixture, not the historical 1.4.0 release. The Git probe prints whether refresh also updates cached plugin files and verifies a fresh MCP connection. It serves only temporary package fixtures on loopback. `TOKENMONITOR_TEST_TARGET` selects an explicit native target for CI.

Real Codex desktop rendering, lifecycle event delivery, renewed hook approval and reload behavior still require a trusted desktop installation on the tested OS. Isolated tests never grant hook trust. Record these results separately from automated package validation. Preserve plugin identity, user data, and the PolyForm Noncommercial license.
