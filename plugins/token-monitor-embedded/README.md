# TokenMonitor Embedded 0.3.1

Local Swift telemetry inside Codex's expanded conversation panel. Opens once per
chat through the working first-prompt model instruction, then refreshes directly
every two seconds while visible. No remote connections or floating-window controls.

## Included

- Context capacity and account allowances at the top, expanded by default.
- Thread API-equivalent spend, cumulative input/output, composition bars and cache savings.
- Cached → Fresh → Input in latest-call details, with exact values and health colors.
- Model/effort; five-hour and weekly allowance remaining and reset times.
- Context use, cache temperature, Compaction Value and its break-even estimate.
- Skills/tool attribution with the native approximation and compaction disclosure.
- Recent 120 calls: Cost / Tokens / Context chart, compaction markers and exact call table.
- Thread-total output, thinking, and non-reasoning output, plus latest-call output.
- Local task picker, explicit lock, compact/details layouts, 85/100/118/135% scaling,
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

## API-equivalent pricing and coverage

`MonitorCore/APIPricing.swift` is the single versioned rate configuration and
calculation engine. Configuration effective/verified date: **2026-10-19**.
[Official API pricing](https://developers.openai.com/api/docs/pricing) and the
[GPT-6.1 Sol model notes](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
were fetched before implementation. Current rates reprice historical calls;
these are theoretical USD token estimates, not invoices or subscription charges.

The table covers exact IDs GPT-6.1 Sol, GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna,
GPT-5.5, GPT-5.4/mini/nano, GPT-5.3 Codex, GPT-5.2, GPT-5.1 and GPT-5.
Unknown aliases are not guessed. Rates are USD per million tokens. For example,
GPT-6.1 Sol Standard short-context input/read/write/output rates are
$2 / $0.10 / $2.50 / $10. Above 272,000 input tokens the full request uses
$4 / $0.20 / $5 / $15. Published tier multipliers and explicit regional processing
are applied per call; unsupported model/tier/threshold combinations are unpriced.
Unrecorded or `auto` tiers assume Standard; missing regional metadata assumes no
regional premium. The UI discloses those limits. No network pricing requests run
on refresh. Update the centralized table, tests and verification date to change rates.

Input categories are mutually exclusive: ordinary = input − cache read − cache
write. Output is split into reasoning and output − reasoning; reasoning is never
added to total output. Missing reasoning can still price total output, but the
composition labels it unsplit. Missing cache read/write or output counts prevent
pricing the affected call, rather than substituting zero. Cache savings compare
observed input cost with the same input at ordinary-input rates, including write
premiums; negative savings are possible. Separate tool/compute charges are excluded.

Logs provide turn-level model and per-call `last_token_usage`, plus
`total_token_usage`; the sampled logs contained all cache/output categories but
no service tier or explicit request ID. Calls are identified by record timestamp
and usage fingerprint, with repeated cumulative counters deduplicating quota
refreshes that repeat the previous call at a new timestamp. Non-adjacent replays
are also ignored. Cumulative counters are coverage checks, not additional costs.
The native monitor shares that deduplication correction. Totals are accumulated
incrementally across the entire file; the chart still retains only 120 calls.
Compaction does not reset spending. Replacement/truncation rebuilds totals from
that file. Reported cumulative output remains available in accounting details.

Incomplete/forked histories cannot reconstruct omitted calls, models, tiers or
historic rates. Differing cumulative counters flag partial coverage. Unpriced
calls, assumed tiers and models are listed; cost composition covers priced calls
only. Native compaction recommendations remain unchanged; an additional API
break-even uses the same retention/output assumptions through this pricing engine.
The existing Compact button collapses UI details; the plugin has never exposed a
Codex thread-compaction action.

The former 85% visual size is now the real 100% base. Persisted old scales migrate
by dividing by 0.85, preserving their visual size (old 100/115 become 118/135).
Layout state has a version marker; locks remain per-panel and are not persisted.

The optional All Threads summary is deferred: reliable aggregation would require
cross-thread transcript scanning/caching beyond the selected-thread collector.
The native floating HUD remains compatible and unchanged in layout.

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

## Private account installation

The release ZIP is a standalone Agent Plugins package with root `plugin.json`,
`mcp.json`, bundled runtimes, all six metadata hooks, and the original TokenMonitor
logo. Upload the ZIP through Plugin Creator to create a private account/workspace
plugin. Install that plugin on each supported Mac using the same account/workspace;
review and trust its hooks there, then start a fresh local chat. Account upload does
not verify availability or execution on a connected remote Mac.

When switching from the development installation, disable its copy before enabling
the uploaded copy so hooks do not run twice. Existing telemetry state is retained.
The compatibility manifests remain bundled for older local clients. The ZIP does
not contain a marketplace or depend on this repository's installation path.

For development only, install/update through the local `token-monitor-development` marketplace:

```sh
codex plugin add token-monitor-embedded@token-monitor-development
```

The install copies the built source into a versioned cache. Start a fresh local
chat to get the new connection/UI. Current validation and remaining host checks
are recorded in [VALIDATION.md](VALIDATION.md).
