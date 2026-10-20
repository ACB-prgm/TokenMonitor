# TokenMonitor

Portable, local Codex token telemetry in an embedded panel. A React interface and bundled Node/TypeScript server show usage without additional model turns or an external service.

![TokenMonitor panel](docs/tokenmonitor-preview.png)

## What it shows

- Recorded input, cache reads and writes, output and reasoning totals.
- Context capacity, recent calls, cache temperature, and compaction state.
- Account allowances and clearly labeled thread allowance estimates.
- Tool and skill attribution estimates, and API-equivalent costs with explicit coverage limitations.
- Separate live-panel and inline-summary views, with independent task selection.

Costs are estimates using the bundled rate table, not invoices. Subscription allowance estimates are calibrated approximations. Missing telemetry and unsupported pricing remain unavailable rather than displaying invented zeros.

## Platforms and installation

Packages target macOS Apple silicon (`macos-arm64`), macOS Intel (`macos-x64`), Windows x64 (`windows-x64`), and Windows ARM64 (`windows-arm64`). Use the package matching the machine running Codex. The runtime's minimum is macOS 13.5 or Windows 10 1809; Codex's own host requirements also apply. Windows desktop behavior is pending user verification for 1.4.0.

Version 1.4.0 is undergoing private Mac validation. GitHub distribution will be prepared after that confirmation and remain a draft until Windows validation. Existing published downloads belong to the previous architecture.

Once the matching release is available:

1. Download `token-monitor-VERSION-PLATFORM.zip` and its `.sha256` companion from [Releases](https://github.com/ACB-prgm/TokenMonitor/releases). Verify its SHA-256 checksum and extract the archive.
2. Register the extracted `TokenMonitor` directory with `codex plugin marketplace add "ABSOLUTE_PATH_TO_TokenMonitor"`.
3. Install with `codex plugin add token-monitor-embedded@tokenmonitor`. Enable and trust the six plugin hooks through Codex's normal controls if you want automatic startup and lifecycle updates.
4. Reload the plugin or restart Codex when requested by the host. Open TokenMonitor in a local chat. The first-prompt instruction opens it once per chat when enabled; subsequent updates happen directly in the panel.

The smaller `token-monitor-embedded-VERSION-PLATFORM.zip` contains the plugin alone for account deployment or a host's direct plugin installation. The source checkout does not include its bundled runtime or compiled assets; build a package before installing.

No system Node, Python, development tools, or API key is needed by an installed plugin. Platform launchers unpack a checksum-verified runtime already inside the package. Runtime operation requires no network downloads.

## Update and removal

For a marketplace installation, register the newly extracted directory and reinstall/update `token-monitor-embedded@tokenmonitor` through Codex. Reload the host connection so the new server replaces the running version. For an account installation, update the existing plugin through its original account entry.

Remove with `codex plugin remove token-monitor-embedded@tokenmonitor`, then `codex plugin marketplace remove tokenmonitor`. Account installations can be removed through Codex's plugin controls. Plugin telemetry state and runtime caches remain under `CODEX_HOME/token-monitor-embedded` unless explicitly removed; Codex chat data remains intact.

## Privacy and behavior

The server reads local Codex JSONL telemetry and schema-checked SQLite thread metadata. It opens databases read-only and does not modify chats. It returns aggregate metrics and task labels to the panel; raw transcripts, prompts and absolute transcript paths are not returned. Runtime state uses the configured Codex home, with private plugin storage preferred for runtime caches when supplied by the host.

UI refreshes do not request model turns or update model context. The optional first-prompt hook emits one startup instruction. Other lifecycle hooks record bounded metadata and do not launch a window. Diagnostics are off unless explicitly enabled locally.

## Development

Use Node 24 LTS and Python 3.12+ for build-time archive extraction only. Run `npm ci` in `plugins/token-monitor-embedded`, followed by `node scripts/build-release.mjs --target macos-arm64` from the repository root. Supported `--target` values are the four platform names above and `all`. Archives and SHA-256 files are written to `dist/`.

See [Contributing](CONTRIBUTING.md) for tests and the staged release process. The shared TypeScript collector runs inside the MCP server. Platform adapters cover path validation, data locations, safe writes and runtime launch. Linux packaging is deferred.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Noncommercial use only under the license terms. Bundled dependencies retain their own licenses and notices.
