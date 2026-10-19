# TokenMonitor Embedded 0.1.3 — feasibility prototype

This independent local plugin tests opening an MCP App inside a Codex conversation
panel and refreshing it without a model turn. **It is not the full token monitor
yet.** Its refresh count is synthetic connection-test data, not token telemetry.

Inline rendering, independent refresh, and expanded view have been confirmed by
the user in Codex. **Automatic turn-end inline summaries did not appear in the
user's host test.** Hook-triggered presentation is not a working feature. The
existing native TokenMonitor is unaffected: this prototype bundles its own two
hooks and changes no native-monitor state or user hook registrations.

## Try the installed prototype

Attaching the plugin through `@`, the composer's `+` menu, or its directory
listing does **not** execute a tool or open its UI. The previously documented
conversation-menu route was not verified on the user's Codex surface and must
not be treated as a working launch path.

The prototype now exposes **only `open_monitor`** to the model so the user can
attach the plugin and send: **Open the TokenMonitor Embedded prototype panel.**
Codex must actually call `open_monitor`; a text acknowledgement is not a launch.
This is one model-driven launch call, a diagnostic fallback from the original
manual-opening plan. The registered thread entrypoint remains available for
hosts that expose it, but it has not been confirmed in this Codex surface.

Once open, the panel should show an increasing successful-refresh count
approximately every two seconds. The Refresh button should update the same
count. These refreshes call the app-only `get_monitor_state` tool directly,
without sending prompts or requiring further model turns.

### Test a persistent display mode

The inline launcher test worked according to user feedback. It does not establish
that the widget persists as the conversation scrolls. Version 0.1.2 reports the
host's `displayMode` and `availableDisplayModes`, and enables **Keep visible (PiP)**
only when the host advertises picture-in-picture. Check both the returned mode
and actual placement while scrolling. **Open expanded view** tests the host's
fullscreen presentation separately; its name does not guarantee a side panel.
Unsupported modes remain disabled, and rejected/fallback requests do not report
success. Neither control can attach to Codex's native composer/status area;
there is no documented plugin extension point for that specific location.

Expand **Host metadata fields** to inspect field names and types. Values such as
task IDs and other host metadata are not exposed by these diagnostics. This
prototype does not claim that the host supplies the open chat's identity.

Report whether the panel opens and its counter updates. The current automation
environment refuses Computer Use access to Codex, so this host check needs a user
action. Protocol tests and a browser harness do not replace that check.

## Expanded-first and turn-end behavior

Version 0.1.3 requests **fullscreen** by default, which the user confirmed appears
as Codex's expanded side-panel view. Its live panel and compact turn-end summary
are separate UI resources. The summary is a frozen result and does not poll or
switch the live panel back to inline.

Two experimental plugin-bundled MCP hooks attempt the automatic behavior:

- **UserPromptSubmit → open_monitor:** request the expanded monitor for the chat
  whenever a user prompt is submitted. This also provides a retry when a chat's
  server was not ready at session startup.
- **Stop → show_turn_summary:** request a compact inline completion snapshot.

After updating the plugin, review and trust these exact two definitions in
Codex Settings → Hooks (or `/hooks`). Installation does not grant hook trust.
The plugin does not bypass trust, send prompts, return turn-control decisions,
or change unrelated hooks. It uses an existing MCP connection with a three-second
timeout. Cloud-orchestrated chats are outside the supported local-hook scope.

**Tool execution is not proof of rendering.** The expanded panel's Automatic
opening diagnostics count hook calls separately from ordinary refreshes. If the
counts increase but no automatic panel/summary appears, Codex is executing the
hooks without presenting their MCP UI results; this route cannot then be claimed
to satisfy automatic opening. Check for duplicate panels across multiple prompts
as part of the host test. The user has now reported that no turn-end inline
summaries appear in any tested chat. The user subsequently reported **3 hook open
requests, 2 hook turn-end requests, and Last hook: Stop**. These counters confirm
the tools ran through the hook route without producing visible summaries.
Codex's hook-completion handler records hook status and text output; it does not
present an MCP App result. Do not treat these hooks as a supported automatic
opening or summary mechanism. See [VALIDATION.md](VALIDATION.md) for the evidence.

Opening or switching to a chat without sending a prompt is not a
UserPromptSubmit event. There is no demonstrated hook for merely viewing a chat.
The panel remains manually launchable if hook rendering is unavailable. All
displayed data is still clearly labeled connection-test data; the full Swift
telemetry port has not been implemented.

### Model-driven startup fallback

Global `~/.codex/AGENTS.md` can request a model-driven launch without a manual
@ mention in each chat, provided the plugin's tool is available. A suitable
instruction is:

> At the beginning of each new local chat, call TokenMonitor Embedded's
> `open_monitor` tool once, if available. Do not repeat the launch on subsequent
> turns unless requested. If unavailable or unsuccessful, continue the user's task.

This is model guidance, not an application startup callback or a guarantee of
panel presentation. It does not make the app-only `show_turn_summary` tool
available to the model and does not solve automatic inline summaries. A plugin
description alone is not a scheduling mechanism. This prototype does not modify
global AGENTS.md or hook trust settings.

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
