# Codex Usage Monitor

A native macOS HUD for Codex Desktop token telemetry. SwiftUI + AppKit, macOS 13+, no dependencies, API keys, or model calls. Local monitoring makes no network requests; optional remote monitoring uses SSH. This project is in `/Users/aaronbastian/code/TokenMonitor`.

Compact is the first-launch default:

```text
Codex · Task title                         10:37 PM
Cached 66.7k · Fresh 1.3k · Input 68.0k
Out 41 · Context 26% · 5h 42% used · 7d 77% used
Call 13 · 3a8e8218 · Following hook-selected task
```

Expanded adds model/effort/workspace, full call time, cache hit, reasoning/total output, context bar and warning label, quota resets, input/fresh history, and a thread-details disclosure. Hover token metrics for exact integers.

```text
Cached · Fresh · Input
Model · effort · workspace
Last call: local date and time
Cache hit · Reason · Total
Context / observed limit · Healthy/Elevated/High/Very high
5 hours used + reset          Weekly used + reset
Recent calls: input / fresh history
▸ Thread details
```

## Build, install, remove

Requires Apple's Swift toolchain / Xcode Command Line Tools and the macOS system Python 3. No downloads during build.

```sh
swift test
/usr/bin/python3 -m unittest discover -s scripts -p 'test_*.py'
./scripts/install.sh
./scripts/uninstall.sh
# Explicitly remove the retained monitor state/logs/preferences too:
./scripts/uninstall.sh --purge
```

The installer builds an ad-hoc signed release app, discovers the installed Codex bundle, preserves unrelated hooks, removes only exact old experimental usage-hook commands, and backs up `hooks.json` every time. It is safe to rerun. Existing experimental script files remain untouched. The uninstaller removes this monitor's exact registrations; it does not restore obsolete hooks or change unrelated Codex settings.

**Hook trust:** Review the four changed user hooks in Codex's `/hooks` interface (or the app's hooks settings). Trust the reviewed definitions, then resume/reopen a task if needed. The installer does not bypass hook trust. Until hooks run, automatic startup can show a waiting or last-recorded task; it cannot discover the active task by itself. The initial installation was smoke-tested by directly invoking the bridge with this task's verified session ID and transcript path, not by changing trust state.

Installed locations:

- `~/Applications/Codex Usage Monitor.app`
- `~/.codex/hooks/TokenMonitor.py`
- `~/.codex/hooks.json` (merged; backups named `hooks.json.usage-monitor-backup-<timestamp>`)
- `~/.codex/usage-monitor/installation.json` (discovered bundle ID and paths)
- `~/.codex/usage-monitor/active-session.json` (only task metadata)
- `~/.codex/usage-monitor/suppression.json` (explicit-Quit PID)
- `~/.codex/usage-monitor/CodexUsageLauncher` (startup helper)
- `~/Library/LaunchAgents/local.codex.usage-monitor.launcher.plist`
- `~/Library/Preferences/local.codex.usage-monitor.plist` (macOS-managed UI preferences)
- `~/.codex/usage-monitor/logs/hook.log` (bounded error-class diagnostics, only if needed)

## Operation

The gauge menu-bar icon provides Show/Hide, Expanded, Click-through, and Quit Monitor. The HUD's chevron toggles compact/expanded. The corner picker beside it snaps to any corner of the current screen; the selected corner stays anchored when the content resizes. Dragging releases the corner anchor. Both modes size to their content and follow the system light/dark appearance. Drag the panel background to reposition it. Mode, position, hidden state, and click-through persist. The window floats above normal windows and does not become key or steal typing focus. There is no Dock icon. Click-through never disables the menu-bar control.

Closing or hiding keeps monitoring, and subsequent hooks never show the hidden HUD. Quit Monitor persists the current Codex Desktop PID; neither hooks nor the startup helper relaunch it for that PID. A new Codex Desktop PID enables automatic launch again. Manually opening the app is an explicit override. The HUD exits about 6–8 seconds after Codex disappears. A separate small event-driven launcher remains resident to observe the next macOS application launch; it does not read transcripts or poll processes. The HUD checks application liveness every two seconds using NSWorkspace.

This machine's Codex Desktop is `/Applications/ChatGPT.app`, executable `ChatGPT`, bundle ID `com.openai.codex`. Installation records the detected paths. The lifecycle follows that whole application process, not an individual Codex window inside it.

## Meaning and limitations

`input_tokens` already includes cached tokens. **Fresh = Input − Cached**. Never add Cached to Input. Cached, Fresh, Input always appear in that order. Output includes whatever output telemetry reports; reasoning is shown separately without adding it again. Cache-write tokens are parsed for schema compatibility but are not added to input or cached values.

Context is the most recent model call's input divided by the **observed** `model_context_window`. No hard-coded context denominator or model fallback map is used. Unknown limits display the count. This is a last-call measurement, not a forecast of the next request. The thresholds are <40% healthy, 40–<60% elevated, 60–<75% high, and ≥75% very high. Labels accompany colors.

Quota windows are identified by their reported 300/10080-minute duration, and percentages explicitly mean **used**. Missing telemetry displays an em dash. Reset times are local. Unknown quota window lengths are not guessed.

The task title is a dropdown listing up to 30 recent, unarchived local tasks with readable transcripts. Select one to inspect its latest recorded usage without sending a prompt. Selecting a task does not change the lock. The monitor starts unlocked: the next SessionStart, UserPromptSubmit, Stop, or SessionEnd hook selects its task, including background completions. The adjacent lock button is the only control that changes locking. While locked, other tasks’ hooks are ignored; manually choosing another task moves the lock to that task. Unlocking keeps the current task visible until the next hook event. Lock state resets to unlocked on app launch. Duplicate file notifications do not undo a manual selection. Use Refresh tasks in the menu to reload the list. The list also refreshes on startup and new hooks. This follows hook events, not Codex’s visibly selected task; clicking between tasks in Codex alone is not a reliable hook event.

Titles prefer hook metadata, then a read-only schema-checked query of Codex's `state_*.sqlite` (`name` or `title`), then a sanitized first meaningful user prompt, then workspace + short ID. Attachment-wrapper titles are skipped. Only the short derived title lives in memory. There is no Accessibility/UI scraping in the app. UI automation was used only to inspect the resulting HUD during development.

Parsing is isolated in `MonitorCore/CodexTelemetryParser`. It accepts unknown fields, skips malformed and zero-input call records, and continues to ingest quota-only events. The latest 120 calls are kept in memory; initial history is streamed from disk. Offset-based reads and filesystem notifications handle partial final lines, append, replacement, and truncation, with a small byte checkpoint to detect truncate-and-regrow. Identical consecutive records are deduplicated. Like any file watcher, it cannot recover intermediate bytes overwritten before observation.

The [official hook documentation](https://learn.chatgpt.com/docs/hooks) documents hook input, user hooks, and trust, and explicitly states that transcript format is not a stable hook API. Future Codex schema changes may require a parser update. No rollout or Codex database is modified.

## Validation

See [VALIDATION.md](VALIDATION.md) for verified behavior, source parity, and manual checks still pending. A read-only diagnostic command is also available:

```sh
.build/release/CodexUsageMonitor --inspect /absolute/path/to/rollout.jsonl
```

This prints only the last call's token metadata, time, count, and formatted metric row. It performs no network or model calls.

Closing or hiding the HUD hides it until the next recorded call, prompt hook, or Stop hook. Quit Monitor suppresses relaunch for the current Codex process. SessionStart, UserPromptSubmit and Stop hooks reopen the app unless suppressed. Changing the installed hook command to TokenMonitor.py may require reviewing/trusting it again and resuming the task.

### Desktop placement

TokenMonitor occupies one macOS Space. Hooks and new telemetry show or relocate it only while Codex is the foreground app. Background completions update data without presenting or moving the panel. Returning to Codex (or changing Spaces while Codex is foreground) brings an enabled panel to that active Space. A hidden panel reappears on return only if a new hook or call has arrived. The menu's Show HUD remains an explicit manual override. Quit Monitor still suppresses automatic launch for the current Codex process.

### Panel size

Compact mode is 340 points wide (expanded mode remains 440). The separate layout-size menu offers 85%, 100%, and 115% size choices, scaling the text and controls together and remembering the choice. Bottom-snapped panels expand upward with their bottom edge anchored. Unsnapped panels are moved back within the visible screen when their content grows.

Corner snapping tolerates accidental drags: movement up to 20 screen points retains the selected corner and returns there on release. Larger drags detach the HUD; releasing within 25 points of a corner snaps it there. Compact/full and scale changes retain that corner anchor.

The **Skills & tools** disclosure adds one line to the compact HUD. Expand it for skill/call counts, the three largest contributors, and a scrollable per-group breakdown. Percentages divide estimated retained tool/skill tokens by the latest call's input tokens (not the model's maximum window).

Attribution is approximate: `ContextAttributionEstimator` estimates recorded arguments and text results at four characters per token. Skill reads are recognized heuristically from read commands targeting `SKILL.md`; catalogs alone are not loaded skills. Read/search and shell calls are grouped, MCP names remain identifiable, and wrapped executions count once without inventing per-inner-call allocations. Counts cover the observed retained history, not session lifetime. The parser freezes the estimate before the response so newly produced tool results enter the next input's estimate. Compaction rebuilds from replacement history and excludes summaries whose provenance is unavailable. Images, hidden schemas, and unlogged content are not estimated. Totals are bounded by measured input; the approximation can over- or underestimate actual retention. The estimator is separate from UI/parsing so a tokenizer or richer telemetry can replace it later.

### Compaction indicators
PreCompact and PostCompact hooks update the silent bridge for both manual and automatic compaction. The footer shows “Compacting…” until completion or a subsequent lifecycle event; transcript completion or a newer call also clears it. PostCompact triggers a transcript refresh; token totals remain the latest recorded call until new usage telemetry arrives.
Faint dotted chart lines mark completed `compacted` transcript records between adjacent calls. They survive monitor restarts and disappear when they fall outside the recent-call chart. The chart uses call order, not elapsed time. New hooks must be trusted in Codex before they run; no conversation/system messages are emitted.

### Codex app lifecycle
The monitor exits immediately when macOS reports Codex termination. The existing two-second process check and five-second absence grace period remain unchanged as a fallback. Notifications add no polling. Unrelated app exits are ignored; if a replacement Codex instance is already running, the monitor stays open. Automatic shutdown does not suppress the next automatic launch.

Automatic task following ignores internal/subagent session headers and waits for a valid transcript before accepting an unidentified task. After compaction, Input ≈ and Context use the reduced context reported by Codex; Cached/Fresh show — until a model call supplies actual cache usage. Compaction bookkeeping does not add a call to the graph.

Compaction Value uses S = max(30% of current input, 40k), cached/fresh cost ratio 0.10, and 3,600 estimated compaction output tokens with weight 1.0. The common current-context read cancels. Break-even is the first whole model-call count strictly above 1 + (S + 3,600)/(0.10 × (C−S)). VERY HIGH means at most 2 calls, HIGH 3–4, MEDIUM 5–7, LOW 8–12, and VERY LOW over 12 or no break-even. Compact labels use XHIGH, MED, and XLOW. This does not measure conversation quality or predict how many calls remain.

Cache temperature predicts availability before the next model call: WARM under 30 minutes, UNCERTAIN from 30 through 120 minutes, PRES. COLD afterward. A one-shot transition timer and wake/activation refresh avoid polling for this status. Actual cache-hit telemetry remains unchanged. Cache temperature does not affect Compaction Value. The app never compacts automatically.

Cmd+\ toggles compact/expanded mode while TokenMonitor is visible on the active desktop. The shortcut is unregistered while hidden or on another desktop; no keyboard-monitoring permission or polling is required.


## Shareable Codex plugin (1.2.0)

The shareable release is `dist/token-monitor-1.2.0.zip`. It packages an explicitly invoked setup/maintenance skill and a prebuilt Apple silicon app for macOS 13+. Recipients do not need Python, Xcode, an MCP server, or an API key. Install the plugin, start a new Codex task, and invoke **Set up TokenMonitor**. The companion app is independent of OpenAI and the package is not publicly approved merely because local validation passed.

Setup uses macOS Launch Services, preserves quarantine, installs the native app and launch helper, and migrates exact owned hook registrations to the app's `--hook` mode. Review the six changed hook definitions in Codex Settings > Hooks; setup never modifies trust records. A one-time macOS first-open approval may be needed because this release is ad-hoc signed and unnotarized.

The skill supports setup/update/repair, read-only `--doctor`, and `--uninstall` with an explicitly requested optional `--purge`. The app menu also offers uninstall. Removing the plugin alone leaves the separately installed companion and user hooks; ordinary uninstall retains monitor preferences/state. Updates preserve unrelated hooks and roll back installed files if setup fails. Unknown app/helper files and malformed hook configuration are refused.

### Build the release

Developer prerequisites: Apple silicon macOS, Swift/Xcode toolchain, Python 3, and the Codex system skill-creator validator. Packaging uses the repository plugin scaffold validator when the optional system plugin validator is unavailable. Python is build-time only for this packaging route. The existing Python installer remains available for developer compatibility; use the plugin skill for native recipient setup.

```sh
python3 -m venv .build/plugin-tools
.build/plugin-tools/bin/pip install -r scripts/release-requirements.txt
swift test
python3 scripts/test_hooks.py
python3 scripts/package-plugin.py
python3 scripts/test_plugin_archive.py
```

`VERSION` is the app/release version source. `scripts/package-plugin.py` produces the plugin directory, ZIP, checksum file and structural verification report. It scans for personal home paths and excludes transcripts/caches. `--skip-build` is for a previously built matching app. Developer-local cachebuster suffixes are used only when refreshing the personal marketplace installation, not in the distributable ZIP.

See `release-materials/` and `dist/submission/` for listing copy, privacy disclosure, reviewer scenarios and recipient instructions. `dist/LOCAL-VERIFICATION.md` records executed checks and outstanding manual verification. Public submission still needs the owner's verified publisher name, portal access, attestations, security scans, review and publication. Native executable acceptance is a review outcome.

## Settings and remote monitoring (1.2.0)

The HUD gear groups task locking and the existing layout sizes. Choose **Manage remotes…**, or **Settings…** in the menu bar, to open the editable settings window. The menu remains available during click-through. Existing size preferences are retained; locking still resets on launch.

Remote monitoring is optional. Install/update TokenMonitor on each source Mac first. Enable Remote Login, authorize a dedicated SSH public key there, and load the matching private key into the viewing Mac's SSH agent (`ssh-add --apple-use-keychain /absolute/path/to/key`). Add a remote with its machine label, hostname/SSH alias, username, port and private-key path. Save connects immediately; Test / Reconnect retries. The UI does not copy applications or authorize keys on other machines automatically.

Unknown host keys must be verified in Terminal first: compare the offered fingerprint against the source Mac's host key, then accept it. Changed keys require investigation and explicit correction of your known_hosts entry. TokenMonitor uses strict host-key checking and never asks for or stores passphrases. SSH aliases and configured VPN/proxy routes work through OpenSSH; a `.local` hostname generally requires local name resolution. Outside your LAN, use a reachable VPN/mesh-network address.

The dropdown groups up to 30 recent tasks per machine. New trusted hook events from any enabled machine select that task while unlocked. Locking pins the machine and task together; manual selection moves an existing lock. Connecting/reconnecting never replays old hook events. Remote failures retain the last snapshot with a disconnected label and last-call time, while local collection continues. Disabling/removing the displayed remote returns to local data. Connection configuration is retained under `~/.codex/usage-monitor/remotes.json`; no key contents are copied. Removing a remote does not delete keys or revoke remote authorization.

`--remote-agent` is a headless, read-only collector within the installed executable. It streams versioned bounded JSON over SSH stdin/stdout, watches source-local Codex files, and exits when the stream closes. It does not depend on the source HUD being open. Both machines must support protocol version 1. No public telemetry port, cloud relay or OpenAI remote-control connection is used. Source transcript paths, raw transcripts, prompts and tool arguments/results are never transmitted. Derived titles, workspace basenames, task IDs and parsed HUD aggregates are transmitted; these may still reveal task context.

### Restrict the dedicated public key

After installing the new helper on the source Mac, replace **only the dedicated key's existing line** in its `~/.ssh/authorized_keys` with:

```text
restrict,command="\"$HOME/Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor\" --remote-agent" ssh-ed25519 YOUR_PUBLIC_KEY TokenMonitor
```

Keep unrelated keys unchanged. The forced command ignores requested shell commands and runs only the telemetry protocol; `restrict` disables forwarding, PTY allocation and user rc scripts. Verify a telemetry handshake after editing. A general shell request must not run; it may receive the helper's JSON handshake before its input is rejected/closed. An SSH agent may offer this key during ordinary shell connections too; select your administration identity explicitly with `ssh -o IdentitiesOnly=yes -i /path/to/admin-key user@host` if that happens. Do not use this key for application updates after restricting it; update through the source Mac's normal plugin setup or another administration connection.

The viewing HUD still exits when local Codex closes. Hide keeps collection running; Quit closes all SSH connections and retains existing relaunch suppression. Ordinary uninstall retains remote configuration; explicit purge removes monitor state but never SSH keys or authorized_keys entries.
