# Testing



Use Node 24 LTS, npm and Python 3.12+ (archive extraction at build time). In `plugins/token-monitor-embedded`, run `npm ci`, `npm run build`, `npm run typecheck` and `npm test`. From the repository root, run `node scripts/check-release.mjs` and `node scripts/build-release.mjs --target PLATFORM`. Use `all` to package all four macOS/Windows targets. Runtime downloads are pinned by official archive SHA-256 values in the runtime manifest.

Run `node scripts/test-package.mjs --target PLATFORM` against the native package. On a Mac with Codex installed, also run `python3 scripts/test_embedded_hook_discovery.py` and `python3 scripts/test_release_install.py`. Host discovery tests use a disposable profile and do not grant hook trust. Desktop rendering and real lifecycle delivery require an enabled, trusted installation and user verification.

Tests cover captured collector reference fixtures, parser accounting, pricing, attribution, file changes, concurrent hooks, database contention, Windows path rules, direct MCP Apps refresh, and installed package behavior. Use synthetic fixtures without private transcript content.


See [development](development.md) for isolated DEV validation and [historical dashboard evidence](../evidence/dashboard-validation.md) for prior visual checks.
