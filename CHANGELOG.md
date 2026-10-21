# Changelog

## 1.5.0

- Check stable GitHub releases on each live-panel opening without waiting on network responses.
- Add compact version-label update controls, platform selection, persistence, and per-version dismissal.
- Add verified guided installation, recovery, and rollback using the bundled runtime and Codex CLI.
- Include `d9f1fe6`: remove Expand/Compact and preserve controls and selections during incremental refresh.
- Validate native release packages and clean install/update/rollback across the platform CI matrix.
- Preserve all six hooks, telemetry behavior, plugin identity, and user data.

## 1.4.0

- Move all telemetry collection and calculations into the bundled Node/TypeScript MCP server.
- Preserve existing panel tools, metrics, task selection, automatic opening and direct UI refreshes.
- Package macOS Apple silicon/Intel and Windows x64/ARM64 runtimes with platform launchers and pinned checksums.
- Add cross-platform file/path handling, read-only SQLite metadata discovery, bounded collector entries and concurrent hook writes.
- Remove the retired native application, its collector executable, installers and obsolete distribution material.
- Add captured metric parity fixtures, lifecycle and package validation.

Historical release; current validation requirements are documented in CONTRIBUTING.md.
