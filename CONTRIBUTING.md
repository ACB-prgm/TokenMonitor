# Contributing

TokenMonitor's maintained product is Embedded. Preserve local-first collection,
existing UI behavior, user data, and hook trust. Do not commit conversations,
credentials, local usage history, runtime caches, or account configuration.

## Development and validation

Use `dev` or a short-lived `feature/*` branch based on dev. Small focused commits
may go directly to dev. See the root README for prerequisites. Run:

```sh
swift test
python3 scripts/test_hooks.py
cd plugins/token-monitor-embedded
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
cd ../..
python3 scripts/check-release.py
python3 scripts/build-release.py
python3 scripts/test_embedded_archive.py
python3 scripts/test_embedded_hook_discovery.py
python3 scripts/test_release_install.py
```

The hook-discovery/install tests need the supported Codex CLI. They use disposable
profiles, never change your real hooks or trust records, and do not issue model
requests. CI does not include desktop rendering; manually check the actual panel
in a fresh desktop chat before tagging. A skipped host test is not a pass.

Submit a PR to dev for normal features, with the problem, behavior, and validation.
A release promotion PR targets main. CI must pass; self-approval is not required
for a sole maintainer. Keep main production-ready and dev as the integration branch.
Contributions to original software use PolyForm Noncommercial 1.0.0. Preserve
third-party notices; discuss commercial authorization with the copyright holder.

## Release process

1. On dev, choose a patch version for compatible fixes, a minor version for
   compatible features, or a major version for breaking behavior/configuration.
2. Run `python3 scripts/set-version.py X.Y.Z`; update CHANGELOG.md and any pinned
   README installation example. Commit the synchronized metadata.
3. Run validation above and check a fresh desktop install, hook trust, panel
   opening, live refresh, task selection, and retained settings.
4. Push dev, open a dev → main PR, wait for the `validate` check, and merge it.
5. Fetch main. On its tested commit, create `git tag -a vX.Y.Z -m "TokenMonitor
   X.Y.Z"`, then `git push origin vX.Y.Z`. The release workflow checks main
   ancestry and VERSION, rebuilds from the tag, tests the extracted package,
   generates checksums, and publishes exactly one GitHub Release. If GitHub does
   not enqueue the tag event, explicitly run `gh workflow run release.yml --ref
   vX.Y.Z`; the same tag/version/ancestry gates still apply.
6. Confirm the run passed, download/check the assets, then merge origin/main back
   into dev and push dev. Leave the local checkout on dev.

Do not move published tags or replace existing stable assets. Fix failed validation
before retrying a tag that has not published. Release jobs use a concurrency group
and refuse to overwrite an existing published release. dev pushes never release.

For an emergency fix, branch from the affected main/tag, make the smallest change,
bump the patch version, and promote through a tested PR to main. Merge the released
fix back into dev before continuing feature work. Supporting an older major version
requires a temporary maintenance branch and an explicit adjustment to release
ancestry policy; do not create a permanent release branch.

Rollback by installing the previous release into its own version directory, switching
the local marketplace source, and starting a fresh chat. Keep newer code in history;
use a reviewed revert and a new patch release for a code rollback. Never force-push
main or delete historical releases.
