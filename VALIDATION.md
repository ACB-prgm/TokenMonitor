# Implementation review and validation

Implemented and installed on September 18, 2026 (America/Los_Angeles).

## Review findings and decisions

1. The plan's example hook JSON contains invalid nested quoting. The installer generates valid JSON and shell-quotes its command path.
2. The installed desktop app is `ChatGPT.app` / executable `ChatGPT` / bundle ID `com.openai.codex`. Process detection uses the discovered bundle, not an assumed executable name.
3. Hooks describe the task producing an event, not guaranteed visible selection. SessionStart/UserPromptSubmit select; background Stop/SessionEnd events cannot steal selection. The HUD explicitly says “Following hook-selected task.”
4. Startup hooks alone do not ensure launch immediately when the desktop app starts. A separate local launch agent observes NSWorkspace app-launch notifications. The HUD still exits after Codex disappears; the small launcher waits for its next launch.
5. The observed SQLite schema has `name`, `title`, `model`, and `reasoning_effort`. Queries inspect columns and open read-only. This current task's `title` is an attachment wrapper, so it uses the useful workspace/short-ID fallback instead of displaying that wrapper.
6. Both 258,400-token context metadata and rate-limit windows/reset epochs were observed directly. No global 258K assumption was introduced.
7. Source is kept in the user's empty TokenMonitor workspace, instead of creating a second project under Developer.
8. No separate test task, API request, or model invocation was made. Existing live telemetry and generated local fixtures provide the integration evidence.

## Automated tests — all passing

- `swift test`: **10 tests, 0 failures**.
- `/usr/bin/python3 -m unittest discover -s scripts -p 'test_*.py'`: **5 tests, 0 failures**.
- Release build and ad-hoc signing: passed.
- `codesign --verify --deep --strict 'build/Codex Usage Monitor.app'`: passed.
- Native window smoke command: `build/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor --verify-ui` passed hide/show, persisted mode, click-through and menu recovery handler, floating/nonactivating panel, and frame saving. This exercises real AppKit window/menu handlers, not physical mouse clicks for every setting.

Coverage includes token arithmetic, required example formatting, missing/zero/malformed data, reasoning default, quota-only records, unknown quota durations, local timestamps, context ratios, bounded history, duplicate records, reduced-context calls, incomplete final lines, append/replacement/truncation, truncate-and-regrow, watcher notifications, title sanitization, exact-command hook removal, unrelated-hook preservation, backup creation, idempotency, uninstall merge, switching, and PID suppression.

## Installed runtime checks

- Direct bridge invocation with this task's verified session ID/path returned exit 0, **empty stdout**, approximately **72 ms** in the measured sample. No prompt contents were supplied to the bridge.
- Real rollout parity: input **67,955**, cached **66,688**, fresh **1,267**, output **41**. The release parser agreed exactly with an independent JSON read. At that time the display was `Cached 66.7k > Fresh 1.3k > Input 68.0k`. Telemetry naturally advanced afterward.
- Visual inspection confirmed compact and expanded HUDs, timestamp, quotas, model/effort/workspace, reset dates, context bar, history, and full thread details.
- Live call counts and values advanced during this implementation turn, before Stop.
- Hide removed the HUD and kept its process alive; hidden and expanded preferences survived a reinstall/restart. Test preferences were restored to visible compact mode afterward.
- A generated second-task fixture switched the actual running HUD's title, short ID, file, and values: `Cached 176.5k > Fresh 235 > Input 176.7k`, output 63, context 88%.
- Appending a reduced-context call **without another hook or Stop** changed the running HUD to `Cached 20.4k > Fresh 7.7k > Input 28.1k`, output 5, context 14%, call 2. No stale quota values carried over from the real task.
- The live original task was restored and visually verified afterward.
- Launcher test with suppression matching the actual desktop PID: monitor stayed stopped. With suppression referring to a different PID: launcher started the monitor. Original suppression state was restored.
- Lifecycle test temporarily configured a nonexistent desktop bundle in the monitor-owned installation file. The running HUD exited within the expected grace period. Configuration was restored and the monitor relaunched. Codex itself was not quit.
- Installed launch agent reported `state = running`. One sample showed approximately 66 MB resident memory for the HUD and 27 MB for the launcher; this is an observation, not a long-duration benchmark.
- Installer rerun repeatedly preserved the top-level description, produced exactly one registration per required event, and kept obsolete script files intact.

## Remaining limits / checks not claimed

- Hook trust was not bypassed or silently granted. Review the installed definitions in Codex's hooks interface, then resume/reopen a task. Official hook delivery after that review remains a user-side check; the bridge and HUD were tested directly.
- Clicking an existing task without a hook may leave the previously selected task displayed. There is no Accessibility/UI scraping or newest-rollout guessing.
- A physical quit/relaunch of the user's actual Codex app was not performed because this task was running inside it. Process-disappearance and startup/suppression paths were tested as described above.
- A real Codex compaction command was not issued. Reduced-context history and file rewrite cases passed controlled tests.
- Full multi-display repositioning, changing macOS appearance, and long-duration idle CPU/latency profiling were not exhaustively tested.
- Transcript schema remains an undocumented implementation detail and may change.

## Changed/created locations

- All source, scripts, tests, and documentation under `/Users/aaronbastian/code/TokenMonitor`.
- `/Users/aaronbastian/Applications/Codex Usage Monitor.app`.
- `/Users/aaronbastian/.codex/hooks/codex_usage_monitor_hook.py`.
- `/Users/aaronbastian/.codex/hooks.json` (four merged events; exact prior experimental Stop registration removed).
- `/Users/aaronbastian/.codex/usage-monitor/` (metadata, launcher, and small runtime state).
- `/Users/aaronbastian/Library/LaunchAgents/local.codex.usage-monitor.launcher.plist`.
- Native preferences for `local.codex.usage-monitor`.

Original pre-install hooks backup:

`/Users/aaronbastian/.codex/hooks.json.usage-monitor-backup-20260918-223628-717646`

Additional backups from verified repeated installs:

- `/Users/aaronbastian/.codex/hooks.json.usage-monitor-backup-20260918-223730-199738`
- `/Users/aaronbastian/.codex/hooks.json.usage-monitor-backup-20260918-223927-680790`
- `/Users/aaronbastian/.codex/hooks.json.usage-monitor-backup-20260918-224327-838766`

No Codex rollout, internal database, unrelated hook, API credential, or hook-trust setting was modified.

## UI and hook update — September 19, 2026

- Installed command path is now `~/.codex/hooks/TokenMonitor.py` for all four events. Legacy commands are recognized for exact-match migration; unrelated handlers remain preserved. Latest hook backup: `~/.codex/hooks.json.usage-monitor-backup-20260919-070221-044527`.
- Replaced titled, fixed-height panel with a transparent borderless panel and content-driven sizing. Removed literal greater-than separators and double-click gesture; controls accept the first mouse click. System semantic colors inherit light/dark appearance without a forced theme.
- Visually checked compact, expanded, and open task details in the installed app. No top gap or white titlebar. Tested the native corner menu, selected top right, and verified native window placement assertions for all four corners. Corners remain anchored as content changes; dragging releases the anchor.
- Hide now recovers on new recorded telemetry; reopen events show the existing panel. SessionStart, UserPromptSubmit, and selected-task Stop launch/reopen it unless Quit Monitor suppressed this Codex PID. Background Stop still cannot change the selected task.
- Ten Swift tests and five Python tests passed. Native `--verify-ui` also passed hide/show, reopen, corner bounds, click-through recovery, and saved preference checks. Installer now waits for the previous process to exit and retries macOS launch registration timing failures.
- Light appearance was visually inspected. Dark appearance uses the same semantic system colors; no global appearance setting was changed for testing. New hook commands may need trust again in Codex and a task resume/restart to load them.

### Foreground-only Space placement — September 19, 2026

Removed canJoinAllSpaces; use moveToActiveSpace with a nonactivating panel. Automatic startup, reopen/hook, and telemetry presentation share a foreground-Codex gate. Workspace activation and Space notifications resume deferred presentation when Codex becomes foreground. Background updates neither order nor relocate the panel.

Validation: 10 Swift tests and 5 Python tests pass. Native --verify-ui verifies single-Space collection behavior, hidden background updates remaining hidden, deferred foreground presentation, and visible background updates leaving the frame unchanged, alongside existing window checks. Actual movement between multiple Spaces and fullscreen Spaces has not been manually exercised; foreground/background branches were exercised directly.

### Compact width, scale, and expansion — September 19, 2026

Compact base width reduced from 440 to 340 points, with tighter padding and spacing. Added persisted 85/100/115 percent scaling in the corner menu. Resize captures the original screen, retains corner anchoring during programmatic moves, and clamps unsnapped origins to the visible frame.

All 10 Swift tests pass. Native window checks pass for bottom-left and bottom-right growth from compact to expanded and scaled sizes, preserving the 16-point bottom inset and screen containment; unsnapped growth containment also passes. Release build and installation succeeded. Live UI inspection via CUA timed out, so the new SwiftUI layout and scale choices have not been visually verified. Extremely tall content exceeding a display's full height is not made scrollable by this change.

### Invisible panel regression repair — September 19, 2026

Found a persisted zero-height window after the scaleEffect/height-state implementation. Removed that feedback loop; scale now applies directly to fonts, controls, padding, chart height and width. Ignore zero/nonfinite geometry preferences. Disabled NSHostingView intrinsic window sizing so only our measured-size handler controls the window and its anchor. Rebuilt, installed, and relaunched. Swift tests and native window checks pass. CUA inspection still times out, so no claim of visual confirmation.

Final clipping fix: replaced the SwiftUI height preference with direct GeometryReader onAppear/onChange size reporting. The live installed app was visually checked through CUA in compact and expanded modes, and at 115% scale: the entire panel is visible without clipping. Restored 100% after testing. Split Layout size and Snap to screen corner into separate accessible menus. Build and installation succeeded.

## Semantic token health colors (2026-09-19)

- Added pure `TokenHealth` helpers for continuous context and fresh/input ramps and appearance-aware RGB interpolation. Context and Input share the context ramp; Cached remains primary text. Fresh below 2,000 stays neutral.
- Context stops: 40% neutral, 50% amber, 65% orange, 75% red. The 176.7k/258k example falls within the orange-to-red transition, consistent with the explicit thresholds. Fresh stops: 10% neutral, 25% amber, 37.5% orange, 50% red, making the transition to >50% continuous.
- `swift test`: 15 tests pass, including 5 new health tests covering exact boundaries, midpoints, continuity, invalid/missing values, context denominators, user examples, and both appearance palettes.
- Release build, installed bundle signature verification, and native `--verify-ui` pass. Rebuilt app installed and reopened.
- Visually inspected the running expanded window: current low-context/low-fresh values are neutral and the existing layout is unchanged. Dark palette interpolation is unit tested; system appearance was not changed during verification.


## Task dropdown and explicit lock (2026-09-19)

- Added the title dropdown with 30 recent local tasks, current-task checkmark, identifying ID suffixes, and Refresh tasks. The read-only catalog excludes archived tasks and unavailable transcripts and prefers renamed task titles.
- Lock starts off on each app launch. Manual selection never toggles it. Unlocked, all four registered hook events can select a task; locked, only the selected task's events are accepted. Unlock waits for the next new event rather than replaying a stale one.
- Hook `updated_at` participates in event identity so a subsequent event from the previous automatic task overrides manual inspection, while duplicate filesystem notifications do not.
- 18 Swift tests and 5 Python hook tests pass. New tests cover manual A → hook B, explicit locking, switching while locked, unlocking, startup default, and SQLite task catalog names/order/filtering.
- Release build, installed signature check, and native window regression checks pass. Updated installed app and TokenMonitor.py; hook registrations unchanged.
- Attempted live visual inspection, but computer-use capture returned a ScreenCaptureKit capture failure and then timed out. Visual verification of the new controls remains unconfirmed.

### Accidental drag protection
- 20 Swift tests pass, including corner geometry on offset displays and snap-radius boundaries.
- Release build and native `--verify-ui` pass: small drags restore the original corner, larger drags detach, and nearby releases reattach; existing expansion/clamping checks also pass.
- Installed and relaunched the updated app. Native checks simulate drag positions through the release handlers; a physical mouse drag was not automated.

### Compact metrics and softer window styling
- Cached/Fresh titles include percentages of latest-call input; RT/OT share the compact row with context.
- Expanded model/effort uses a small tag; redundant total and cache-hit/detail rows removed.
- All allowance labels display clamped 100 minus used percentage, explicitly marked remaining.
- Replaced native shadow with a restrained theme-aware shadow and lighter border; shadow inset keeps outer sizing measurements stable.
- Release build, 20 Swift tests, native window regression checks and installed signature verification passed. Installed and relaunched.
- Live visual inspection was attempted but computer-use app inspection timed out; appearance has not been visually verified.

Skills & tools attribution: 25 Swift tests and 5 hook tests pass; release build and native --verify-ui checks pass. Added coverage for grouping, duplicate calls/results, missing denominators, bounded totals, skill-read detection, compaction replacement, wrapped calls, non-text results, and response/input timing. Installed app signature verified and app relaunched. Accessibility inspection confirmed the new collapsed Skills & tools row with live estimated percentage. Expanding via UI automation timed out; expanded visual appearance was not verified.

## Compaction status and graph markers
- Swift tests: 27 passed, including compaction marker deduplication, call-boundary positioning, history-window filtering, and status completion/fallback handling.
- Python hook tests: 6 passed, including PreCompact/PostCompact registration and bridge delivery.
- Release build and native --verify-ui window checks passed.
- Installed app and six silent lifecycle hooks. Live compaction-hook execution awaits user trust in Codex Settings; a real compaction was not forced.

## Immediate Codex shutdown notification
- 27 Swift tests, release build, and native window checks passed.
- Installed and relaunched the monitor with a macOS termination observer; the existing fallback timer is unchanged.
- Actual Codex quit was not triggered during this active task.

## Recent-call graph horizontal bounds
Explicit X-axis bounds cover the retained samples plus a trailing compaction marker, avoiding automatic zero inclusion with absolute call indices. Regression test covers call 233 with 120 retained samples, trailing compaction, single-call and empty history. All 28 Swift tests, release build, and native window checks passed; installed and relaunched.

## Internal task filtering and post-compaction context (2026-09-19)

Automatic selection now checks the bounded session_meta header and rejects subagent sessions, missing headers, and mismatched session IDs. Root workspaces remain valid. The exact screenshot task could not be located locally. Manual task selection and locking remain unchanged.

Compaction token_count bookkeeping (zero input/output, positive total_tokens) now supplies the reduced context estimate, without adding a model call. Cached/Fresh are unavailable until the next actual call. Input, context health/progress, and attribution denominators use the new estimate. Tests cover replay, subsequent calls, invalid headers, guardian/child sources, and root tasks.

30 Swift tests, 6 Python hook tests, release build, native --verify-ui, and installed signature verification passed. Installed and relaunched. No live compaction was forced.

## Compaction Value (2026-09-19)

Added one metadata line in both layouts with theme-aware LOW/MEDIUM/HIGH/VERY HIGH colors and the requested cost-only tooltip. The reusable CompactionValue helper uses S=max(C*0.30,30000), raw=9S/(C-S), and floor(raw)+1. No savings or unavailable telemetry are handled without division or conversion failures. Override estimates support future reduction assumptions. Uses the current snapshot input, refreshing on each model call and after reported compaction.

34 Swift tests and 6 hook tests passed, including new floor, strict integer break-even, category boundary, custom estimate, invalid, and extreme input cases. Release build, native --verify-ui, and installed signature verification passed. Installed and relaunched.

## Compact ComVal placement (2026-09-19)

Moved compact Compaction Value into the middle column below Fresh, between RT/OT and Context. Removed its separate compact metadata row. Compact labels use ComVal and LOW/MED/HIGH/V HIGH, retaining estimated calls and tooltip. Compact base width increased from 340 to 420 to accommodate the row; expanded indicator unchanged. Release build, native --verify-ui and installed signature verification passed. Installed and relaunched.

Compact highest-value label changed to XHIGH. Release build and installed signature verification passed; installed and relaunched.

## Cache temperature (2026-09-19)

Replaced RT/OT with predicted Cache status in compact mode, alongside ComVal and Context. Expanded mode omits the entire row and shows context percentage on the context-window bar header. Actual call telemetry is unchanged. A reusable date-based schedule defines warm under 30 minutes, uncertain through exactly 120 minutes, then presumed cold. AppState holds at most one nonrepeating timer and refreshes on snapshot updates, wake, session/app activation, and system clock changes. New-call deadlines replace earlier timers. Presumed cold makes compaction break even on call 1 only if estimated input shrinks.

37 Swift tests and 6 hook tests passed, including threshold boundaries, next-transition deadlines, refresh after new calls/wake, and cold economics/floor behavior. Release build, native --verify-ui and signature verification passed. Installed and relaunched. Actual sleep/wake was not forced.

Expanded view now includes cache status on the same line as Compaction Value. Release build, native --verify-ui and signature verification passed; installed and relaunched.

Expanded cache status moved to the left of Compaction Value, matching compact ordering. Release build and installed signature verification passed; installed and relaunched.

Compaction HIGH changed to 2–4 calls and MEDIUM to 5–10. Boundary tests and README updated. All 37 Swift tests, release build and installed signature verification passed; installed and relaunched.

## 2026-09-20 — Metadata readability
- Increased model/allowance, cache/compaction, and Skills & tools rows to 11-point scaled text, matching token labels. Expanded width increased to 560 points to give the compaction line room.
- Release build and native --verify-ui passed; installed, signature verified, and relaunched.

## 2026-09-20 — Restore expanded width
- Restored 440-point expanded width and removed flexible space between cache status and Compaction Value. Retained 11-point metadata font settings and existing shrink-to-fit behavior.
- Release build and native UI verification passed; installed, signature verified, and relaunched.

## 2026-09-20 — Desktop-scoped mode shortcut
- Added event-driven Cmd+backslash hot key, registered only while the panel is visible on the active Space. Space/application notifications and show/hide refresh registration; handler rechecks visibility and Space before toggling. Cleanup unregisters the key and handler.
- 37 Swift tests, release build, and native UI verification passed, including shortcut handler toggling and hidden-window rejection/unregistration. Physical keypress and cross-Space interaction remain manual checks. Installed, signature verified, and relaunched.

## 2026-09-20 — Conservative compaction economics
- Centralized 40k floor, 30% retained ratio, 0.10 cached cost ratio, 3,600 output tokens, and output weight 1.0. Formula now strictly exceeds 1 + (S + wO)/(r(C-S)); shared context-read cost cancels. Cache temperature ignored. New category boundaries 2/4/7/12 and subdued VERY LOW (XLOW compact); layout unchanged.
- 38 Swift tests and six hook tests passed, covering representative contexts, floor, no benefit, exact break-even, category boundaries, and temperature independence. Release build and native UI verification passed. Installed, signature verified, and relaunched.

## 2026-09-20 — Compaction label font consistency
- Separated Compaction Value label/score from trailing details. Label and score retain the same 11-point scaled font as cache warmth; only the trailing estimate/call details can shrink to fit.
- Release build and native UI verification passed; installed, signature verified, and relaunched.

## 2026-09-20 — Shareable plugin and native management
- Built TokenMonitor 1.1.0 self-contained skills-only plugin, arm64 app, explicit maintenance skill, native setup/doctor/uninstall/hook entry points, transactional updates and legacy migration. Registered and installed in the personal marketplace.
- 53 Swift tests + 6 legacy hook tests passed. Package/skill validators, archive integrity/corruption checks, cached-copy setup/repeat setup, installed doctor, exact file inventory/signature and native UI verification passed.
- Details and explicit manual/public-release limitations: dist/LOCAL-VERIFICATION.md. Hook definitions changed; user review/trust remains required. No trust bypass.

## Remote monitoring 1.2.0

See `release-materials/LOCAL-VERIFICATION.md` for the release evidence and remaining physical-device checks. Remote telemetry uses the same MonitorCore collector as local monitoring. `scripts/test_remote_runtime.py` exercises the actual controller against disposable SSH stand-ins after `swift test`. Local-only operation remains the installation default; remote setup is explicit. Build flags can be forwarded through `scripts/build-app.sh`, including `--disable-sandbox` for nested sandbox environments.
