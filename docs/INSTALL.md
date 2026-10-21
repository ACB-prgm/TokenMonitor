# Install and update TokenMonitor

Use the complete `token-monitor-VERSION-TARGET.zip` package from [GitHub Releases](https://github.com/ACB-prgm/TokenMonitor/releases). Targets are `macos-arm64`, `macos-x64`, `windows-x64`, and `windows-arm64`. Choose the computer running the local Codex executor. Node, Python, compilers, and npm are not required by the installed plugin or installer. Codex's CLI must already be available on PATH; if necessary set `CODEX_CLI_PATH` to its existing native executable or installed `codex.js` entry point.

## macOS

Download the ZIP and its matching `.zip.sha256` file into the same directory. For the planned 1.5.0 Apple silicon package:

```sh
cd "$HOME/Downloads"
shasum -a 256 -c token-monitor-1.5.0-macos-arm64.zip.sha256
mkdir -p TokenMonitor-1.5.0-macos-arm64
unzip token-monitor-1.5.0-macos-arm64.zip -d TokenMonitor-1.5.0-macos-arm64
/bin/sh TokenMonitor-1.5.0-macos-arm64/TokenMonitor/install.sh --verify-only
/bin/sh TokenMonitor-1.5.0-macos-arm64/TokenMonitor/install.sh
```

Stop if checksum verification fails. Intel users substitute `macos-x64`. Check that this version is actually published before using the example; 1.5.0 is under development until the release is published.

## Windows PowerShell

Download the ZIP and matching checksum into Downloads. This example selects x64; substitute `windows-arm64` for a native ARM64 executor:

```powershell
Set-Location "$HOME/Downloads"
$archive = 'token-monitor-1.5.0-windows-x64.zip'
$expected = ((Get-Content -LiteralPath "$archive.sha256" -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expected -notmatch '^[0-9a-f]{64}$' -or $actual -ne $expected) { throw 'Release checksum mismatch' }
Expand-Archive -LiteralPath $archive -DestinationPath 'TokenMonitor-1.5.0-windows-x64'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\TokenMonitor-1.5.0-windows-x64\TokenMonitor\install.ps1' -VerifyOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\TokenMonitor-1.5.0-windows-x64\TokenMonitor\install.ps1'
```

The process-specific execution-policy flag permits the verified launcher; it does not change persistent policy or grant Codex hook trust. Organization policy still applies. Do not run subsequent commands if verification fails.

## What installation changes

The helper verifies the package inventory, runtime digest, target, version, and marketplace identity. It uses Codex's CLI to register the extracted directory and install `token-monitor-embedded@tokenmonitor`. An existing local `tokenmonitor` source is replaced through CLI commands, with its previous directory recorded for recovery. Git-backed sources are not automatically replaced; remove that source explicitly if you choose to switch to release packages.

Keep each extracted version in its own permanent directory. Do not overwrite the directory backing a running installation. Installation does not delete previous extractions, historical telemetry, update preferences, dismissals, or runtime caches. A local journal at `CODEX_HOME/token-monitor-embedded/installation.json` records the current and previous source and installation phase. If interrupted, rerun the same verified installer. If a process crashes, a dead-owner lock can be reclaimed on retry; a malformed lock requires inspection before removal.

Restart Codex after installation so the new MCP server and panel assets load. Review and approve the current six plugin hooks through Codex's normal trust controls. Installation or enabling alone does not trust hooks; changed definitions may require renewed approval. Without trusted hooks, automatic panel opening and lifecycle collection may not operate. The installer never changes hook trust.

The smaller `token-monitor-embedded-VERSION-TARGET.zip` is the plugin-only package for an existing direct/account deployment. Update that installation through its original host entry. The guided installer requires the complete marketplace ZIP.

## Update detection

The version label opens a small update menu. Automatic release checks are enabled by default and run in the background at each new live-panel opening, including reopening in an existing chat. Polling, tab focus, hooks, and inline summary cards do not initiate checks. Turn automatic checking off in this menu if desired; manual checks remain available.

Checks request only public GitHub release metadata. They send no prompts, transcripts, task identifiers, telemetry, or credentials, and require no model turns or model-context updates. A request is limited to five seconds and one MiB; concurrent requests are coalesced. GitHub backoff can temporarily suppress requests. Cached information is displayed with its timestamp; failed requests are unknown, never proof of being up to date.

The menu offers release notes, the selected platform ZIP and checksum, and an architecture override. A package without a matching checksum is not offered for download. Downloading does not install or execute anything. Dismissal suppresses highlighting for that specific version; newer versions can be highlighted again. Preferences and release cache use `PLUGIN_DATA/updates`, falling back to `CODEX_HOME/token-monitor-embedded/updates`.

## Manual registration, recovery, and rollback

If using CLI commands directly, register the **absolute** extracted `TokenMonitor` path:

```sh
codex plugin marketplace list
# Only when replacing an existing tokenmonitor registration:
codex plugin marketplace remove tokenmonitor
codex plugin marketplace add "/absolute/path/to/TokenMonitor"
codex plugin add token-monitor-embedded@tokenmonitor
```

The same Codex commands apply in PowerShell with a Windows absolute path. Retain the old path before replacing registration. To roll back, run the retained previous version's installer, or remove the current marketplace registration and register/install from the previous extraction with these commands. Then restart Codex and review hook trust. A failed helper update attempts to restore the prior source and installation; its journal identifies both directories if recovery also fails. If an older package lacks an installer, use the CLI commands.

## Git marketplace limitation

The development repository's `.agents/plugins/marketplace.json` points at source that lacks built assets and a bundled runtime; its source MCP launcher uses `/bin/sh`. Do not install `ACB-prgm/TokenMonitor` as a working cross-platform Git marketplace. Use the release ZIP's generated local marketplace instead. The source catalog is marked `NOT_AVAILABLE`; the shared packager enables `AVAILABLE` only inside complete release ZIPs. Stable releases, rather than development commits, determine available downloads.

`codex plugin marketplace upgrade tokenmonitor` refreshes Git marketplace snapshots. This is not the update command for an extracted local release. The automated disposable Git probe records whether a tested CLI also refreshes an installed plugin's files; existing running processes still need reload/restart. GitHub publication alone does not update running plugins or account deployments. Universal public directory submission excludes lifecycle-hook plugins; TokenMonitor retains all six hooks. See [official plugin packaging and hook requirements](https://developers.openai.com/plugins/build/plugins).

## Uninstall without removing data

```sh
codex plugin remove token-monitor-embedded@tokenmonitor
codex plugin marketplace remove tokenmonitor
```

For account deployments, use that account's plugin controls. Extracted release directories can be removed after uninstalling; retaining them permits reinstallation. Do not remove `CODEX_HOME/token-monitor-embedded` or the host's `PLUGIN_DATA` directory if you want to retain telemetry state, preferences and runtime caches. Codex conversation files are never deleted by this workflow.
