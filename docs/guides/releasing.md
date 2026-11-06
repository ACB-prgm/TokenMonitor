# Releasing



Develop, validate and commit on `dev`. Open a PR to protected `main` and merge after required checks pass. Create an annotated version tag on the validated `main` commit. The release workflow validates that source, builds each package on its native OS/CPU, runs install/update/rollback and hook-discovery checks, and creates a draft. Publish only after platform and desktop validation are satisfactory. Never build a public release from `dev`, replace an existing release, or change published 1.4.0 artifacts.

Local builds on `dev` are verification artifacts. Distributable installation helpers reject packages marked dirty; commit validated changes before final package testing. All platform artifacts record the source commit and come from the same tag. The release notes path follows `VERSION`.

Run `python3 scripts/test_release_install.py` with Codex and Git available to exercise two distinct runnable package versions, native installation, rollback, user-data retention, and a disposable HTTP Git marketplace. The older version is a synthetic fixture, not the historical 1.4.0 release. The Git probe prints whether refresh also updates cached plugin files and verifies a fresh MCP connection. It serves only temporary package fixtures on loopback. `TOKENMONITOR_TEST_TARGET` selects an explicit native target for CI.

Real Codex desktop rendering, lifecycle event delivery, renewed hook approval and reload behavior still require a trusted desktop installation on the tested OS. Isolated tests never grant hook trust. Record these results separately from automated package validation. Preserve plugin identity, user data, and the PolyForm Noncommercial license.
