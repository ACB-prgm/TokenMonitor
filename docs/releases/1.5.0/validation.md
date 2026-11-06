# TokenMonitor 1.5.0 validation

Local verification on October 20, 2026, using macOS ARM64 and the existing Codex CLI `0.163.0-alpha.10.2`. The source commit for each final package is recorded in its `release.json`. These are development verification artifacts; public release artifacts must be rebuilt from an annotated, validated `main` tag.

## Passed locally

- TypeScript build and typecheck; 96 automated tests, including SemVer, release validation, all target mappings, request deadlines, failures, rate limits, ETag/304, cache age, preference persistence, cross-process request coordination, concurrent preference writes, dismissal, and disabled automatic checks.
- UI tests leave an update request pending while telemetry refresh and task selection complete. Unchanged telemetry responses independently update release status. Inline summary cards and normal polling do not initiate checks.
- Actual bundled UI inspected in light/dark themes and at 600/320-pixel panel widths using synthetic telemetry and a synthetic available release. The version-position menu stays within the narrow panel, remains open while settings change, and records zero messages/model-context updates in the fixture host.
- Live public GitHub API smoke test: check returned while fetching, then identified published 1.4.0 as older than development 1.5.0; correct macOS ARM64 package/checksum metadata was resolved. No user telemetry was sent.
- All four target ZIPs and checksum companions built and inspected: file inventories, version/target metadata, runtime digests, native binary CPU formats, platform launchers and six hook definitions.
- macOS ARM64 packaged launcher execution: offline runtime expansion, cache corruption recovery, raw UTF-8 stdin, MCP initialization and metrics, app-only update tool visibility, pipe shutdown and signal shutdown.
- Isolated packaged installation: verify-only, clean installation of a synthetic prior package, upgrade to 1.5.0, explicit rollback, uninstall, and settings/history retention. Both versions start real MCP servers. The prior package is a test fixture, not an assertion about historical 1.4.0 code.
- All six installed hook commands execute from an unrelated working directory. Codex discovers all six as untrusted plugin hooks; tests never grant trust.
- Disposable Git marketplace probe: `codex plugin marketplace upgrade tokenmonitor` updates the installed cached files on this CLI. An already-running MCP connection still advertises the prior version; a fresh connection loads 1.5.0. Restart/reload is required. This does not make the development repository a self-contained cross-platform marketplace.

## Still required before publication

- Run the committed four-target GitHub Actions matrix, including native macOS x64, Windows x64 and Windows ARM64 execution. Those targets were inspected locally but cannot execute natively on this Mac.
- Verify the pinned CI CLI `0.163.0`; local results above use the installed alpha CLI and do not establish every supported desktop client's update semantics.
- Test trusted desktop installation, actual lifecycle event delivery, panel startup, update-menu links/downloads, hook reapproval and restart behavior on Windows and macOS. Browser fixtures, command execution and untrusted-hook discovery are separate evidence.
- Push and PR `dev` to protected `main` when authorized. After checks and merge, create the annotated 1.5.0 tag on `main`, run the draft workflow, review checksums/notes and complete platform confirmation before publishing. No existing 1.4.0 release assets should be changed.

## Distribution decision

Use the generated platform-specific release marketplace ZIPs for this release. The source catalog points at unbuilt files, and the source MCP manifest selects `/bin/sh`; no verified universal package is being claimed. All packages share the same application and packaging code. Universal public directory publication is unsuitable while TokenMonitor retains its six lifecycle hooks. Installers use documented CLI operations and do not edit managed cache files or hook trust.

The development source catalog is marked `NOT_AVAILABLE` and labeled as requiring a build. The shared packager changes that policy to `AVAILABLE` only inside complete release marketplace ZIPs.

## Maintainer macOS confirmation

On October 20, 2026, the maintainer confirmed that the locally installed 1.5.0 panel and updated version control look correct and explicitly authorized pushing, promotion through a PR to main, and release publication. The installed package reports 1.5.0, includes all six hooks, and has automatic opening checks enabled. The clickable version control and default-enabled behavior have focused regression coverage. Windows desktop interaction remains unverified locally; release automation must execute each target natively before publishing.
