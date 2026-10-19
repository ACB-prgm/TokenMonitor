# TokenMonitor Embedded 0.1.6 — feasibility prototype

This independent local plugin tests opening an MCP App inside a Codex conversation
panel and refreshing it without a model turn. **It is not the full token monitor
yet.** Its refresh count is synthetic connection-test data, not token telemetry.

Inline rendering, independent refresh, and expanded view have been confirmed by
the user in Codex. Version 0.1.6 asks the model to open the expanded panel once
on the first prompt in each chat. This new automatic startup path awaits a live
new-chat test. The existing native TokenMonitor is unaffected.

## Try the installed prototype

Attaching the plugin through `@`, the composer's `+` menu, or its directory
listing does **not** execute a tool or open its UI. The previously documented
conversation-menu route was not verified on the user's Codex surface and must
not be treated as a working launch path.

The prototype exposes **`open_monitor`** to the model so the user can
attach the plugin and send: **Open the TokenMonitor Embedded prototype panel.**
Codex must actually call `open_monitor`; a text acknowledgement is not a launch.
This is one model-driven launch call, a diagnostic fallback from the original
manual-opening plan. The registered thread entrypoint remains available for
hosts that expose it, but it has not been confirmed in this Codex surface.

Version 0.1.4 also exposes **`show_turn_summary`** for an explicit model-driven
inline test. It uses the separate inline-only resource and does not request
expanded view. Ask Codex to call that exact tool to compare the same summary
resource with the hook path. Refresh and task-list tools remain app-only.

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

## Temporary routing capture

Version 0.1.5 adds an opt-in recorder for comparing a successful model call with
a native hook call. It records delivered request IDs, routing `_meta`, the three
known tool arguments, and HTTP headers if the transport provides them (stdio
normally provides none). It excludes authInfo, redacts credential- and
prompt-named fields, and never returns raw captures in tool results or stdout.

From the repository root, arm it for one exact thread ID:

```sh
python3 scripts/routing_capture.py arm --thread THREAD_ID --minutes 15
python3 scripts/routing_capture.py status
python3 scripts/routing_capture.py compare
python3 scripts/routing_capture.py watch --seconds 900
python3 scripts/routing_capture.py stop
```

`compare` pairs the latest manual and hook `show_turn_summary` calls and saves
the differences beside the raw trace. Origin labels are the tool's source hint;
test or manually simulated hook calls must not be presented as genuine lifecycle
events. `clear` stops the current capture and removes its trace and comparison.
`watch` waits for both summary calls, prefers a matching turn, saves the
comparison, and stops the capture automatically. It exits at its deadline or
capture expiry even if the pair never arrives. It requests no model turns.
Run it in a persistent developer terminal: a watcher started in this chat's tool
runtime did not survive the turn. The live test was completed with `compare` and
`stop` manually after the real Stop hook had been captured.
The helper is a developer diagnostic; recipients do not need Python.

Captures live in the independent state directory's `diagnostics/` folder under
CODEX_HOME (normally `~/.codex/token-monitor-embedded/diagnostics`). Files use mode
0600 and the diagnostics directory uses 0700. A capture expires automatically;
the default limit is 24 records, with a 64-record ceiling and 256 KiB file cap.
Only launcher/summary calls for the exact thread are recorded; refreshes are
excluded. Strings, arrays, nesting, and object fields also have diagnostic
limits. Oversized records are skipped, and capture errors never fail a tool.
Trace/control files stay outside the plugin and release archives. Stored traces
remain available after capture expiry until explicitly removed.

Report whether the panel opens and its counter updates. The current automation
environment refuses Computer Use access to Codex, so this host check needs a user
action. Protocol tests and a browser harness do not replace that check.

## First-prompt automatic opening (0.1.6)

Review and trust the updated **UserPromptSubmit command hook** in Codex's Hooks
settings (or `/hooks` in the CLI), then create a new local chat and send a normal
prompt without mentioning the plugin. The hook returns a short `additionalContext`
instruction asking Codex to call `open_monitor` once before handling the request.
This uses the normal model-driven tool path that has rendered successfully.
It adds no separate user turn or Stop continuation. The first launch requires a
model tool call; subsequent two-second refreshes remain direct UI calls.

The bundled Node runtime runs the command hook; recipients need no Python or
system Node. Plugin hooks load for enabled local plugins without an explicit
@ mention, subject to host configuration and trust. Cloud orchestration is outside
this local-hook scope. Tool availability and model compliance still matter;
automatic rendering has not yet been verified in a fresh chat.

The hook atomically records **instruction requested** once per chat under
`${CODEX_HOME:-~/.codex}/token-monitor-embedded/startup`. Concurrent prompts cannot
issue duplicate instructions. A host-identified `open_monitor` call records
**launcher called** separately; neither status claims that the host rendered the
widget. Only the session ID and timestamps are stored, never prompt text or
transcript paths/content. Other chats have independent records. Existing chats
also receive the instruction on their next prompt if they have no startup record.
Malformed input or unavailable state storage never blocks the user's request.
The instruction is not retried if the model skips it or the tool is unavailable;
manual opening remains available. Closing and reopening a chat does not reset it.
Closing the panel does not request another launch on the next prompt.

The old direct MCP startup and Stop hooks have been removed because their tools
executed without presenting widgets. `show_turn_summary` remains available for
explicit inline requests, but there is no automatic end-of-turn summary in this
version. No global AGENTS.md or other plugin/native-monitor hooks are changed.
Uninstalling disables the bundled hook and retains this independent state folder.

Expected test: the panel opens expanded during the first response and shows
**Prototype 0.1.6**; its counter updates about every two seconds. A second prompt
should not call the launcher again. Automatic opening diagnostics distinguishes
the instruction timestamp from the actual launcher call. Opening an empty chat
or merely switching to it does not trigger this hook.

This implements the documented command-hook context contract:
https://learn.chatgpt.com/docs/hooks#userpromptsubmit

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

For the isolated Python host-API diagnostic (requires the development machine's
installed Codex CLI and an already-built plugin), run from the repository root:

```sh
python3 scripts/probe_embedded_host.py
```

To compare the basic RPC with captured routing metadata:

```sh
python3 scripts/probe_embedded_host.py --capture TRACE.jsonl --output REPORT.json
```

This tests routing fields, turn context, and captured identifiers in the isolated
server. It audits delivered metadata and reports rewrites. It does not attach to
the desktop or establish that the fields register a widget in the live UI.

This uses a disposable Codex home and test thread, verifies delivered thread
metadata, and reports conversation-item notifications. It does not request a
model turn, attach to the desktop, or change user configuration. It is a developer
diagnostic, not a recipient runtime dependency or automatic widget launcher.

## Removing it

Use `codex plugin remove token-monitor-embedded@token-monitor-development` or the
plugin's remove control. The original native plugin and app remain installed.
Removing the development marketplace is a separate optional action.

## Intended full port after the host check

Reuse MonitorCore through a headless Swift helper, add independently stored
silent lifecycle hooks, and carry all local metrics into a compact/expanded web
panel. Prefer verified host-chat identity; otherwise follow the last valid hook
event. Remotes and Windows are deferred. Automatic opening now uses the first-prompt model instruction described above.
