# TokenMonitor

Portable, local Codex token telemetry in an embedded panel. A React interface and bundled Node/TypeScript server show usage without additional model turns or an external service.

![TokenMonitor panel](docs/tokenmonitor-preview.png)

## What it shows

- Recorded input, cache reads and writes, output and reasoning totals.
- Context capacity, recent calls, cache temperature, and compaction state.
- Numeric Compaction Value (0–100), forecasting API-equivalent savings over 20 calls from active-model pricing and observed thread growth/output.
- Account allowances and clearly labeled thread allowance estimates.
- Tool and skill attribution estimates, and API-equivalent costs with explicit coverage limitations.
- Separate live-panel and inline-summary views, with independent task selection.

Costs are estimates using the bundled rate table, not invoices. Subscription allowance estimates are calibrated approximations. Missing telemetry and unsupported pricing remain unavailable rather than displaying invented zeros.

## Platforms and installation

Packages target macOS Apple silicon (`macos-arm64`), macOS Intel (`macos-x64`), Windows x64 (`windows-x64`), and Windows ARM64 (`windows-arm64`). Use the package matching the machine running Codex. The runtime's minimum is macOS 13.5 or Windows 10 1809; Codex's own host requirements also apply. Windows desktop behavior is pending user verification for 1.4.0.

Version 1.7.0 adds **Update and install** in the version menu, with verified native packages, background installation, and progress reporting. Platform validation results distinguish native launcher tests from desktop hook and rendering checks.

Download a complete `token-monitor-VERSION-TARGET.zip` and its `.sha256` companion from [Releases](https://github.com/ACB-prgm/TokenMonitor/releases). Verify the checksum before extraction, then run the included macOS `install.sh` or Windows `install.ps1`. Restart Codex and review hook trust. The installer requires the existing Codex CLI, but uses the bundled Node runtime.

See [installation, updating, recovery, rollback, and uninstall instructions](docs/INSTALL.md) for copy/paste commands. Keep previous extracted releases for rollback. Preferences, dismissals and historical telemetry remain outside the installation directory.

The smaller `token-monitor-embedded-VERSION-TARGET.zip` is the plugin-only package for direct/account deployments. Update those through their original host entry. The development source marketplace lacks built assets and runtimes and is not a supported cross-platform Git installation. Its catalog is marked `NOT_AVAILABLE`; only complete generated release catalogs enable installation.

## Updates

Open update options from the existing version label. A background check runs at every live-panel opening by default; it never gates rendering or telemetry collection. Disable automatic checks or run a manual check from the menu. **Update and install** downloads the native package, verifies its checksum and inventory, and updates an existing local release marketplace installation through Codex. Progress appears in the panel; restart Codex when complete. Account and Git installations retain their original update mechanism. Release notes, architecture selection, and per-version dismissal remain available.

Checks use only public GitHub release metadata, with a five-second timeout, bounded responses, caching and rate-limit backoff. Offline or failed checks report unknown status. Polls, lifecycle hooks and inline summary cards do not initiate checks; update discovery adds no model turns or model-context updates.

## Privacy and behavior

The server reads local Codex JSONL telemetry and schema-checked SQLite thread metadata. It opens databases read-only and does not modify chats. It returns aggregate metrics, task labels, and bounded call activity to the panel. Activity includes visible assistant excerpts (up to 600 characters), up to six tool requests with short command/query descriptions, and up to eight file targets from explicit edit requests. Activity is associated with the next recorded call usage event; file targets do not confirm successful edits. Raw transcripts, user prompts, reasoning, tool-result dumps and absolute transcript paths are not returned. Activity stays in UI-only tool metadata and does not request model turns or update model context. Runtime state uses the configured Codex home, with private plugin storage preferred for runtime caches when supplied by the host.

UI refreshes do not request model turns or update model context. The optional first-prompt hook emits one startup instruction. Other lifecycle hooks record bounded metadata and do not launch a window. Diagnostics are off unless explicitly enabled locally.

## Development

For everyday local development, run `npm run dev` from the repository root. It
builds and installs a separate **Token Monitor DEV** plugin alongside the release.
Restart Codex, review DEV hook trust, then ask to open Token Monitor DEV. Run the
same command after edits to rebuild and refresh the local installation. See
[the DEV workflow](docs/DEVELOPMENT.md) for setup, build-only, and removal commands.

Use Node 24 LTS and Python 3.12+ for build-time archive extraction only. Run `npm ci` in `plugins/token-monitor-embedded`, followed by `node scripts/build-release.mjs --target macos-arm64` from the repository root. Supported `--target` values are the four platform names above and `all`. Archives and SHA-256 files are written to `dist/`.

See [Contributing](CONTRIBUTING.md) for tests and the staged release process. The shared TypeScript collector runs inside the MCP server. Platform adapters cover path validation, data locations, safe writes and runtime launch. Linux packaging is deferred.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Noncommercial use only under the license terms. Bundled dependencies retain their own licenses and notices.

## Compaction Value

CV estimates net savings as a percentage of avoidable context-processing costs over 20 normal calls, including compaction overhead and per-call long-context pricing. It assumes 40K retained context and warm-prefix reuse. The panel shows observed growth/output or disclosed defaults, a consistent break-even, and context-capacity limitations. Cache temperature remains separate. These are API-equivalent estimates, not subscription charges; financial value does not guarantee context preservation. See [calculation and assumptions](docs/COMPACTION-VALUE.md).

## Account allowances and call previews

Five-hour and weekly allowances refresh from the signed-in Codex account every 30 seconds while the monitor is active, with the newest local catalogue telemetry as fallback. Each window’s hover help includes its source and observation time. Expired readings await refresh rather than assuming a reset. These account requests use the installed Codex CLI and existing authentication without model turns. Call previews switch instantly and dismiss after a short grace period and animation. See [sources, freshness and behavior](docs/ACCOUNT-ALLOWANCES.md).
