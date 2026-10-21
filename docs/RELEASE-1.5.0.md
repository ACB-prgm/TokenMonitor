# TokenMonitor 1.5.0

Planned release; do not publish until platform validation is complete.

- Check stable GitHub releases in the background whenever the live panel opens. Checks default to enabled and can be disabled; manual checks remain available.
- Open update options from the existing version label: release notes, matching platform download and checksum, architecture override, and per-version dismissal.
- Preserve monitoring responsiveness, direct refreshes without model turns, and cached/incremental telemetry collection.
- Include `d9f1fe6`: remove Expand/Compact, retain enabled refresh/selector controls, and queue task changes made during a poll.
- Add a shared verified installer with macOS/Windows entry points, retained previous sources, installation journal, and recovery through Codex's CLI.
- Preserve all six lifecycle hooks and their normal trust requirements. Restart Codex after updating.

Download the complete `token-monitor-1.5.0-TARGET.zip` and its `.sha256` companion. Verify before extracting, then follow [installation/update instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/INSTALL.md). Plugin-only ZIPs remain available for existing direct/account deployments.

The source Git marketplace is not a self-contained cross-platform installation. Use generated release marketplaces. Packages include pinned, verified Node runtimes and require no user-installed Node, Python, npm, or compiler. The Codex CLI is required for the guided installer.

Release sequence: commit and validate on `dev`; PR to protected `main`; tag the validated `main` commit; build that tag in the four-platform release workflow; inspect the draft and complete desktop validation before publishing. Do not modify the existing 1.4.0 release.
