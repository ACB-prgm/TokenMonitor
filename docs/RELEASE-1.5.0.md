# TokenMonitor 1.5.0

Background update discovery and guided cross-platform installation, with all six lifecycle hooks preserved.

- Check stable GitHub releases in the background whenever the live panel opens. Checks default to enabled and can be disabled; manual checks remain available.
- Open update options from the button beside the version number: release notes, matching platform download and checksum, architecture override, and per-version dismissal.
- Preserve monitoring responsiveness, direct refreshes without model turns, and cached/incremental telemetry collection.
- Include `d9f1fe6`: remove Expand/Compact, retain enabled refresh/selector controls, and queue task changes made during a poll.
- Add a shared verified installer with macOS/Windows entry points, retained previous sources, installation journal, and recovery through Codex's CLI.
- Preserve all six lifecycle hooks and their normal trust requirements. Restart Codex after updating.

Download the complete `token-monitor-1.5.0-TARGET.zip` and its `.sha256` companion. Verify before extracting, then follow [installation/update instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/INSTALL.md). Plugin-only ZIPs remain available for existing direct/account deployments.

The source Git marketplace is not a self-contained cross-platform installation. Use generated release marketplaces. Packages include pinned, verified Node runtimes and require no user-installed Node, Python, npm, or compiler. The Codex CLI is required for the guided installer.

The maintainer confirmed the local macOS panel and update-menu changes. Native package, installation, rollback, and hook-discovery checks run in the four-target release workflow. Windows desktop rendering and trusted event delivery remain separate from automated launcher checks. Restart Codex after installation and review hook trust if prompted.
