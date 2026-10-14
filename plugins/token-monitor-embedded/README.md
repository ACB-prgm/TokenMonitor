# TokenMonitor Embedded 0.1.0 — feasibility prototype

This independent local plugin tests opening an MCP App inside a Codex conversation
panel and refreshing it without a model turn. **It is not the full token monitor
yet.** Its refresh count is synthetic connection-test data, not token telemetry.

The full port is gated on successful rendering and independent refresh in the
installed Codex host. The existing native TokenMonitor is unaffected: this
prototype has no lifecycle hooks and changes no monitor state or registrations.

## Try the installed prototype

Fully quit and reopen ChatGPT/Codex after installing the local plugin. Open an
existing local conversation, then use its **⋯ → Plugins → TokenMonitor Embedded**
menu. The installed app labels this control **Plugins**, although the extension
documentation calls it an app entrypoint. The empty new-chat screen does not have
the conversation menu. The panel should
show an increasing successful-refresh count approximately every two seconds.
The Refresh button should update the same count. No prompt is sent.

Expand **Host metadata fields** to inspect field names and types. Values such as
task IDs and other host metadata are not exposed by these diagnostics. This
prototype does not claim that the host supplies the open chat's identity.

Report whether the panel opens and its counter updates. The current automation
environment refuses Computer Use access to Codex, so this host check needs a user
action. Protocol tests and a browser harness do not replace that check.

## Developer build and tests

From this plugin directory:

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
```

The source manifest expects the bundled arm64 Node runtime. Download the exact
official archive specified in `scripts/runtime.json` into the repository's
`.build/embedded-runtime/` directory, then run:

```sh
python3 scripts/prepare-runtime.py
npm test
python3 ../../scripts/package-embedded.py
python3 ../../scripts/test_embedded_archive.py
```

The archive is verified against its pinned SHA-256 before extracting the Node
binary and license. Recipients need macOS 13.5+ on Apple silicon; they do not need
system Node, Python, Xcode, an API key, or a running companion HUD.

## Local installation

The repository has a separate `token-monitor-development` marketplace. Add the
repository root with `codex plugin marketplace add`, then install with:

```sh
codex plugin add token-monitor-embedded@token-monitor-development
```

After changing the source, rebuild and reinstall the local plugin. For sharing,
use the ZIP under the repository's `dist/` directory. It contains the bundled
runtime, server, UI, notices, and verification inventory; no `node_modules`,
transcripts, user configurations, or build caches are distributed.

## Removing it

Use `codex plugin remove token-monitor-embedded@token-monitor-development` or the
plugin's remove control. The original native plugin and app remain installed.
Removing the development marketplace is a separate optional action.

## Intended full port after the host check

Reuse MonitorCore through a headless Swift helper, add independently stored
silent lifecycle hooks, and carry all local metrics into a compact/expanded web
panel. Prefer verified host-chat identity; otherwise follow the last valid hook
event. Remotes, Windows, and automatic panel opening are deferred.
