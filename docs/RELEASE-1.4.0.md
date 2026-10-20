# TokenMonitor 1.4.0

TokenMonitor now uses a bundled Node/TypeScript collector inside its MCP server. This replaces the retired Swift application and collector while preserving the embedded React panel, task selection, metrics and automatic startup.

## Packages

Choose the architecture of the machine running Codex:

| Machine | Package suffix |
| --- | --- |
| Mac Apple silicon | `macos-arm64` |
| Mac Intel | `macos-x64` |
| Windows x64 | `windows-x64` |
| Windows ARM64 | `windows-arm64` |

Download `token-monitor-1.4.0-PLATFORM.zip` and its `.sha256` companion for the complete local marketplace installation. The smaller `token-monitor-embedded-1.4.0-PLATFORM.zip` is the plugin-only package. Each archive includes its matching pinned Node 24.21.0 runtime, launcher, licenses and file checksums. Installed operation needs no system Node, Python or Swift and downloads no runtime.

Follow the included README for checksum verification, installation, hook trust, update and removal. Reload Codex after updating to replace existing server connections. Preserve Codex telemetry and plugin state when removing old installations.

## Validation and status

- Automated coverage includes metric parity, incremental files, Windows paths, read-only SQLite contention, concurrent hooks and server shutdown.
- Maintainer Mac testing confirmed 1.4.0 in the registry and running service, plus automatic opening and operation in a fresh chat.
- GitHub CI executes the packaged runtime and launchers on all four matching OS/CPU runners; consult the linked checks for their results.
- Windows desktop testing remains pending. This release stays in draft until that test is confirmed.

The old Swift-based release is superseded; its obsolete downloadable packages are retired. Historical commits and tags are preserved. Linux packaging is deferred.

Costs and allowance values remain estimates. Collection stays local; Codex databases are read-only and raw transcripts are not returned by the panel tools. License: PolyForm Noncommercial 1.0.0.
