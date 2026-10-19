# TokenMonitor Embedded 0.2.0

Local Swift telemetry inside Codex's expanded conversation panel. Opens once per
chat through the working first-prompt model instruction, then refreshes directly
every two seconds while visible. No remote connections or floating-window controls.

## Included

- Cached → Fresh → Input with percentages, exact-value tooltips and native health colors.
- Model/effort; five-hour and weekly allowance remaining and reset times.
- Context use, cache temperature, Compaction Value and its break-even estimate.
- Skills/tool attribution with the native approximation and compaction disclosure.
- Recent 120 calls, Input/Fresh SVG history, compaction markers and exact call table.
- Thread-total output, thinking, and non-reasoning output, plus latest-call output.
- Local task picker, explicit lock, compact/details layouts, 85/100/115% scaling,
  light/dark themes, help and diagnostics, manual refresh, unavailable/disconnected states.

The bundled headless Swift helper uses MonitorCore's parser, file tail, SQLite task
discovery, health thresholds, attribution, cache boundaries and compaction estimates.
Native monitor hook registrations, settings, installation and HUD remain independent.

## Open and follow

Enable the plugin and review/trust its bundled hooks in Codex. The unchanged
UserPromptSubmit command emits a model instruction once per chat; it now also
records silent telemetry metadata. Five additional command hooks record SessionStart,
Stop, SessionEnd, PreCompact and PostCompact metadata. **Review/trust the new hook
definitions before relying on fallback following or live compaction status.**
No metadata hook opens a window, renders a widget, or requests a continuation turn.

Send a normal prompt in a new local chat, without an @ mention. Codex calls
`open_monitor` once and opens expanded view. Explicitly asking to open TokenMonitor
also works. Attaching/mentioning the plugin alone does not execute a tool.
`show_turn_summary` remains available for explicit inline snapshots; it is not
called automatically at the end of responses.

The panel prefers the host-supplied thread ID **only after exact matching to a
validated local session**. It never infers identity from titles or workspaces.
Otherwise it follows the latest valid hook, including background completions, and
labels that mode. The task picker inspects other local tasks. Selecting does not
change lock state; selecting while locked moves the lock. Unlocking leaves the
current task until the next relevant automatic selection event. A fresh panel
starts unlocked. Different panels keep independent selections and locks.

Compact/details and scale preferences use host widget state when exposed, with
frame session storage as fallback. Diagnostics reports the active storage. Locks
are not persisted. Returning to a visible panel triggers an immediate refresh.
Collector failure retains the last snapshot and retries with bounded backoff.

## Output totals and unknowns

**Thinking is included in total output.** Non-reasoning = total output − thinking;
it also includes generated tool calls and other output, not only visible prose.
Reported cumulative counters cover the thread and survive chart-history trimming
and compaction. If cumulative counters are unavailable, the helper sums all
recorded calls. Missing reasoning stays unknown, never an invented zero. A fork
or incomplete transcript can only report counters/history actually available in
that session; descendants' usage is not aggregated into the parent.

Input is the latest call's input, not cumulative session input. Immediately after
compaction, reduced context is approximate and cached/fresh remain unknown until
the next model call. Em dashes represent unknown values. Cache temperature and
Compaction Value retain the native assumptions and explanations; neither is a
provider guarantee. Attribution estimates text at about four characters/token,
not a tokenizer, and excludes hidden schemas/images/skill catalogs.

## Local privacy and packaging

Task IDs, titles, workspace basenames and parsed metrics go to the panel in
UI-only `_meta` results. No refresh prompts or metric injection into model context.
Transcript content and full source paths remain in the Swift helper. Requests
accept discovered task IDs, never paths. All scripts, CSS, fonts (system), SDKs,
Node and Swift helper are local; no runtime downloads or external services.

Independent state lives under `${CODEX_HOME:-~/.codex}/token-monitor-embedded`:
private per-task hook metadata, latest valid hook, and once-per-chat startup records.
Removing the plugin disables its hooks and retains that directory. It never
changes the existing monitor's hooks. The optional, explicitly armed routing
recorder remains off by default; see the repository's `scripts/routing_capture.py`
for developer capture/compare/stop/clear commands. Captures are never packaged.

Recipients need Apple silicon macOS 13.5+. No system Node, Python or Xcode required.
Windows, remotes and public-directory submission remain deferred.

## Development

From this plugin directory:

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
python3 ../../scripts/package-embedded.py
python3 ../../scripts/test_embedded_archive.py
```

Building requires Swift/Xcode and Node on the development machine. The build
compiles and ad-hoc signs the standalone Swift helper; the pinned Node 24 runtime
is prepared separately by `scripts/prepare-runtime.py` after its official archive
checksum is verified. Run `swift test` and the Python suites at repository root
for native compatibility. The ZIP contains only bundled runtime, built server/UI,
manifest, hooks, notices and release documentation/inventory.

Install/update through the local `token-monitor-development` marketplace:

```sh
codex plugin add token-monitor-embedded@token-monitor-development
```

The install copies the built source into a versioned cache. Start a fresh local
chat to get the new connection/UI. Current validation and remaining host checks
are recorded in [VALIDATION.md](VALIDATION.md).
