# TokenMonitor 1.2.0 — verification

- Swift suite: 62 tests passed, including source-qualified locks, bounded framing, snapshot privacy/parity, baseline ordering, current compaction hooks without database rows, unavailable tasks and source-home path restrictions.
- Python suite: 7 tests passed. The runtime controller test covers connected streams, authentication failure, host-key failure, missing helper, protocol mismatch, reconnect and cancellation using disposable transports.
- Release: arm64 macOS 13+ build, ad-hoc signature, checksum inventory, repository manifest/scaffold validator fallback, installed skill validator and isolated bootstrap verification passed. Archive corruption is refused.
- Installed native apps updated through normal bootstrap on two Macs; hooks remain registered and trust is reported separately.
- Live SSH: protocol handshake, recent-task listing, task selection, refresh, path redaction, no baseline hook replay and clean EOF exit verified.
- Dedicated public-key entry restricted with a backup and rollback protection; telemetry verified and requested general shell command blocked. Unrelated keys preserved.
- Ordinary SSH administration verified independently of the restricted key. A backed-up host/user-scoped SSH identity match prevents the agent from selecting the telemetry key for ordinary shell login.
- Actual HUD state controller: configured remote connected, task snapshot published, lock toggled, and connection shut down cleanly.
- Built-in native UI checks: HUD lifecycle/presentation, size/corner anchoring, click-through recovery, settings-window key capability and menu-bar Settings entry passed. Accessibility inspection confirmed the gear; subsequent accessibility inspection timed out, so the full settings form's visual layout has not been manually verified.
- Pending manual acceptance: real sleep/wake on both Macs, a source compaction observed live across SSH, and outside-LAN connectivity using the recipient's VPN. Unit/fixture coverage does not substitute for these physical checks.

## Historical 1.1.0 verification

# TokenMonitor 1.1.0 — local verification

Completed on Apple silicon macOS 26.6.2. This is local verification, not public-directory approval.

## Passed

- 53 Swift tests: existing telemetry/UI helpers plus 15 new packaging/native bridge tests.
- Six existing Python hook tests retained as legacy behavior coverage.
- New tests cover fresh/repeated setup, repair, exact-match Python migration, unrelated-hook preservation, quoting/spaces, rollback at each mutation stage, fresh-install rollback, failed-rollback recovery files, concurrent setup rejection, staged-copy verification, unsupported platforms, missing Codex, malformed configuration, unrelated apps/helpers/agents, symlinked destinations, corrupted/extra assets, uninstall/purge, hook selection/suppression and compaction events.
- Release build for arm64; stripped debug symbols, valid ad-hoc signature and matching app/release version.
- Plugin-creator scaffold/validator and skill-creator validator; explicitly invoked skill metadata.
- Native bootstrap verification from outside the repository; archive CRC, paths, member types, size limits and SHA-256 checks.
- Archive extraction with normalized executable permissions into a temporary path containing spaces; --verify succeeds. Altering the app binary causes checksum rejection.
- Registered in the personal marketplace and installed through `codex plugin add`.
- Setup ran through Launch Services from the installed cache copy, not the project source. It migrated the old standalone launcher and Python registrations while preserving settings.
- Second cached-copy setup was idempotent: hooks.json bytes unchanged, one native handler for each of six events.
- Installed doctor reports app 1.1.0, owned files valid, Codex found, helper loaded, and all six native registrations present.
- Invalid/malformed native hook input exits successfully with empty stdout and stderr.
- Native --verify-ui passed hide/show, mode persistence, floating nonactivating window, click-through recovery, position saving, corner anchoring and screen clamping, accidental-drag recovery, shortcut-handler checks, and foreground-only presentation.
- Installed app files match the release SHA-256 inventory exactly; installed signature verification passed. HUD relaunched.

## Explicitly not verified

- A clean macOS account/machine and Gatekeeper first-open behavior for a downloaded/quarantined archive. Local setup used an existing development machine. No quarantine or trust bypass was performed.
- macOS 13 runtime on a separate machine; the app targets macOS 13 but this host is macOS 26.6.2.
- A fresh agent invoking the installed skill; start a new task to discover it.
- User hook trust after migration. The native command changes the definition. Review all six hooks in Codex Settings > Hooks and restart/resume a task. The existing bridge timestamp does not establish that new hooks have fired.
- A forced quit/reopen of the user's live Codex app during this task, or physical keyboard/cross-desktop interaction. Existing behavior is preserved; launcher load and native handlers were checked without interrupting Codex.
- Public-directory upload/scans/review, publisher identity, attestations or publication. Native executable acceptance is a review outcome, not established by the local validators.

## Installed plugin

Personal marketplace: `~/.agents/plugins/marketplace.json`.
Plugin: `token-monitor@personal`.
Installed development cache version: `1.1.0+codex.20260921031216`.
The distribution ZIP remains version `1.1.0`; the suffix only refreshes Codex's local cache.

## Publisher

The package currently uses **TokenMonitor contributors** as a development label, not a verified legal identity. Replace `author.name` and `interface.developerName` with the owner's actual verified publisher name before public submission. No name was inferred from this computer's user account.

## Reproduction

Run `swift test`, `python3 scripts/test_hooks.py`, `python3 scripts/package-plugin.py`, and `python3 scripts/test_plugin_archive.py`. Developer validator setup is documented in README.md. Recipients need neither Python nor Xcode.
