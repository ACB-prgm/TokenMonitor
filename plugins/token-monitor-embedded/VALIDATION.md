# 0.3.2 hook discovery fix — 2026-10-19

The 0.3.1 root Agent Plugins manifest caused Codex 0.163.0-alpha.10.2 to skip
all plugin hooks. A controlled comparison using that runtime discovered six
hooks from the legacy manifest and zero from the identical portable package.

- Removed root plugin.json and mcp.json; the standalone account package uses
  .codex-plugin/plugin.json and .mcp.json without requiring a marketplace.
- Added a regression against the installed Codex app-server hooks/list API,
  using the actual release manifest/hooks in an isolated temporary Codex home.
  All six events are discovered with source=plugin and trustStatus=untrusted;
  no hooks are executed or trusted by the test.
- Production build, type checking, all 22 Node tests, extracted offline archive
  test, and real Codex hook discovery test passed.
- Account update must explicitly delete the two previous root files because
  account uploads overlay retained files. Read back after saving to verify.
- This establishes runtime discovery; live account installation and user hook
  trust remain separate checks. Logo rendering remains unverified after this fix.

---

# 0.3.1 standard private package — 2026-10-19

- Added portable Agent Plugins 1.0 root manifests; retained synchronized legacy
  compatibility manifests and all six telemetry/startup hooks.
- Reused the native TokenMonitor icon byte-for-byte for listing logo and composer icon.
- Release ZIP contains one plugin, no marketplace, bundled Node/Swift runtimes,
  and no developer installation path. Existing telemetry behavior is unchanged.
- Production build and TypeScript type check passed; all **22 Node tests passed**.
- Extracted archive regression passed using root mcp.json with PLUGIN_ROOT
  resolution, a temporary Codex home and bundled runtimes only. Verified manifest
  parity, logo parity, hook behavior, MCP tools, real metrics, and inventory hashes.
- Initial account upload rejected the uncompressed 116 MiB Node member. The
  release now bundles node.gz and its SHA-256; the shell launcher expands and
  verifies the executable in private plugin storage without network access.
  Cold/warm hook startup, cache corruption recovery and PLUGIN_DATA precedence
  are covered by the extracted archive regression. The portable server uses
  bare `sh`, as required by account ingestion, rather than `/bin/sh`.
- Account ingestion and installation on the Mac Studio must be verified separately;
  these package tests do not establish remote-chat execution or sharing availability.

---

# 0.3.0 dashboard and API-equivalent pricing — 2026-10-19

## Executed checks

- Swift regression suite: **73 passed**, including six new pricing/accounting tests.
  Exclusive cache/read/write/output categories, reasoning inclusion, cache savings
  and write premiums, missing/unknown pricing, tiers/region, >272k full-request
  thresholds, mixed models, cumulative-only events, non-adjacent replay, repeated
  quota usage at new timestamps, compaction and 120-sample retention were checked.
- TypeScript type check passed. Node protocol/integration/UI suite: **22 passed**.
  Five new UI tests cover percentage formatting, scale migration, composition,
  compact dashboard order/defaults, and unavailable/partial data. Existing task
  following, locks, simultaneous panels, host fallback, stale replies, collector
  restart, hooks and direct UI-only refresh tests remain passing.
- Existing Python hook tests: **6 passed**. Existing remote runtime regression:
  **1 passed**. Native HUD layout/hooks and unrelated remote source changes were
  not modified by this release.
- Actual bundled UI tested in a localhost SDK AppBridge fixture at 600px and 320px:
  compact/expanded, light/dark, 100% and 135%, layout restored after reload,
  Cost/Tokens/Context switching, keyboard call inspection, compaction marker,
  disconnect snapshot retention and recovery. Refresh counter advanced while
  prompt and model-context-update counters remained **zero**.
- Browser fixture uses synthetic anonymous usage, not copies of user transcripts.
  Narrow testing found and fixed a wrapping currency value and tiny chart axes.
  Screenshot: local build diagnostics `dashboard-0.3.0.png` (not packaged).
- Extracted 0.3.0 release archive passed offline startup, six-hook, inventory,
  UI-only metric and actual per-call pricing checks using bundled runtimes only.
- Official pricing page and GPT-6.1 Sol model page fetched on 2026-10-19.
  Rate sources and configuration date are in the shared Swift pricing engine;
  no live API or pricing network requests are needed at runtime.

## Coverage and limits

Per-call telemetry was inspected locally for field names/model IDs only. Recent
logs contain input, cache-read, cache-write, output and reasoning counts. Model
comes from turn_context or explicit usage info. Service tier, region and a stable
request ID were absent in the inspected sample. Missing tier assumes Standard;
unknown models/tiers and missing token categories stay unpriced. Identical
cumulative counters identify repeated last-call reports, including quota updates
at new timestamps. Cumulative counters are not additional spend. Full-file totals
are independent of the last 120 chart samples and survive compaction.

Historical completeness cannot be proven: cumulative discrepancies flag partial
coverage. Current verified rates are applied to historical calls; actual past
rates and separate tool/compute charges are unavailable. Reasoning stays part of
output; unsplit output is identified. Cache savings include write premiums.
Allowances are account-level values last observed in the selected thread and can
lag other activity. No optional All Threads aggregate was added because it would
require cross-thread transcript scanning/caching beyond the existing collector.

The Compact button has always collapsed UI details, not compacted a Codex thread.
Native recommendations remain unchanged, with a separate model-priced API
break-even estimate. Old scale settings migrate to preserve visual size while
old 85% becomes the actual new 100% base. Existing native parser benefits from
replayed/quota-usage deduplication; its interface otherwise remains unchanged.

Actual Codex UI automation remains unavailable. Browser fixtures and MCP protocol
checks do not verify rendering inside Codex itself. Startup, host routing and hook
commands are unchanged from the user-verified prior release. Reopen the panel in
a fresh chat after updating; host widget-state support still uses feature detection
with frame session-storage fallback. No new hook trust or permissions requested.

---

# Embedded monitor validation

## Version 0.2.0 — local telemetry release (2026-10-19)

The user confirmed the 0.1.6 first-prompt automatic opening works. This release
retains that launch path and replaces synthetic prototype data with real local
MonitorCore telemetry, through a standalone Swift executable and bounded JSONL
child-process bridge. No remotes, snapping, floating-window placement/hide controls,
HUD launch, native installation changes or automatic inline summaries are included.

Ported: cached/fresh/input and percentages, model/effort, allowances/reset times,
context use, health interpolation, cache temperature, Compaction Value, attribution,
120-call SVG history and compaction markers, task selection/explicit locking,
compact/details and scaling, theme/accessibility, refresh/help/diagnostics and
unavailable/disconnected behavior. Added cumulative thread output with thinking
and non-reasoning splits; reasoning is a subset of output. Missing reasoning is
explicitly unknown. Cumulative counters are preferred; all-recorded-call sums are
used when absent, independently of chart trimming. Optional sample-availability
fields and snapshot totals preserve native/older snapshot decoding compatibility.

Only host-supplied threadId is considered for chat binding, and the helper must
match it exactly to an accessible, validated local session. A matching older or
archived host task is selectable even outside the recent list. Otherwise the panel
labels latest-hook following, including background completion. No title/workspace
inference. Per-panel selection requests are serialized, so delayed prior task
responses cannot be labeled as a newly selected task. Locks are independent and
reset in a fresh panel or server session. Unlock consumes old hook events and
waits for a new relevant event. Per-task parsers/tails expire after 60 idle seconds;
the helper child also stops after 60 idle seconds. Snapshots survive a disconnect
and reconnects use bounded backoff. Source paths/transcript content never leave
the Swift helper; MCP state requests accept task IDs, not paths.

Six bundled command hooks write private atomic per-task/latest metadata, with
exact header-ID/path validation and serialized writes. UserPromptSubmit continues
to emit the once-per-chat model instruction; Stop and the other lifecycle hooks
only update metadata. New definitions need Codex trust review. Hook trust entries,
global AGENTS.md and native registrations are untouched.

Executed checks:

- **67 Swift tests passed** (62 existing plus five collector/total scenarios).
  Includes history-cap totals, compaction, missing/malformed counters, privacy,
  independent collectors, partial writes, replacement/truncation, idle eviction,
  per-task hooks and rejection of unsafe/mismatched/internal sessions. Existing
  quota-only, unknown context, attribution and cache-boundary suites pass.
- **17 Node protocol/integration tests passed**, including real Swift/database
  fixtures, exact host matching and fallback, independent panels and locks,
  background SessionEnd, compaction, private revision responses, unavailable IDs,
  concurrent delayed switches, and killing/restarting the actual Swift child.
  Existing startup/capture/privacy and zero-message/context-update checks pass.
- TypeScript checking and release builds pass. Existing Python hook suite (six
  tests) and remote runtime regression (one test) pass.
- Distribution ZIP and extracted offline archive test pass. The extracted
  package runs both its exact hook command and real telemetry server from paths
  containing spaces, with only bundled Node/Swift and no developer runtime on PATH.
  Payload inventories/checksums match; no personal home paths are packaged.
- Live local helper read of this chat succeeds in about 1.2 seconds; exact host
  identity resolves and cumulative output/reasoning totals are available while
  the history is capped at 120. This is a collector check, not a host UI test.
- A local browser harness exercised the actual bundled widget via the SDK
  AppBridge: compact/expanded, 600/320px width, light/dark, 85/100/115% scale,
  fallback preference restoration on reload, keyboard scale selection, lock,
  simulated disconnect/retained metrics and recovery. Refresh calls increase
  with **zero prompts and zero model-context updates**. Compaction markers and
  exact-value chart/table accessibility are present. A neutral progress-bar
  styling issue found in WebKit was corrected in the bundled CSS.

Installed 0.2.0 through the supported CLI update flow. A smoke check of the
installed cache verified the server version, six bundled hook definitions, exact
live-chat binding, real input/cache metrics, cumulative output/reasoning counters,
120 retained calls, and private direct refresh results. It used a direct MCP client
and does not claim to have rendered the desktop widget. An initial installation
attempt was not executed because approval review hit the workspace spending cap;
the normal approval path succeeded after the user asked to continue.

Host-specific limitations: full 0.2.0 rendering and live updates inside the actual
Codex panel await the user's fresh-chat check. Computer Use access to Codex remains
unavailable; the test harness is not represented as that host check. Layout
preferences use the host widget-state API when present; the tested SDK harness
exposes no such API and correctly uses frame session storage. Actual host widget
state availability and hide/reopen behavior still require a host test. No change
was made to Codex private renderer/IPC state or its application bundle.

Developer preview: run `node scripts/preview.mjs` from the plugin, then serve
`.build/embedded-preview` from repository root on localhost. Fixtures are synthetic,
never copies of transcript content, and are not included in release packaging.

## Version 0.1.6 — first-prompt model instruction (2026-10-19)

Replaces both experimental direct MCP hooks with one synchronous UserPromptSubmit
command hook. It uses the bundled Node runtime and the documented
`hookSpecificOutput.additionalContext` contract to request a normal model call to
`open_monitor`. There is no Stop hook or continuation prompt. The launcher remains
model-visible and explicitly allows the enabled startup instruction.

Each chat atomically claims one private startup record. Concurrent submissions
emit one instruction; later prompts emit none, including when the panel is closed.
Manual launches with a host-supplied thread ID also suppress later startup requests.
Instruction issuance and launcher execution have separate timestamps and neither
claims successful rendering. Caller-provided session arguments cannot acknowledge
a different chat. No prompt text or transcript content/path is stored. State
failures, malformed/oversized events, unsafe IDs, and subagent events fail open.
A skipped/failed model call is not retried automatically. No global AGENTS.md,
other plugin registrations, native-monitor source, or hook trust entries change.

Executed checks: build, TypeScript checking, all **11** protocol/integration tests,
packaging, and the extracted archive test. The archive test executes the exact
hook command from a package path containing spaces with no developer Node on PATH,
verifies first-prompt output and subsequent suppression, then initializes the
packaged MCP server. The four additional integration scenarios cover concurrent
submissions/chat isolation/privacy, host-identity acknowledgement/manual opening,
malformed/subagent/oversized events, and unavailable storage.

Installed 0.1.6 through `codex plugin add`. A smoke check against the installed
cache verified its server version, updated launcher description, fullscreen
resource, app-only refresh, exact bundled hook execution, and once-per-chat
suppression using a temporary CODEX_HOME. No model generation or user-chat
mutation was requested for that check. Hook trust remains under Codex review.

Live first-prompt instruction delivery and automatic expanded rendering in a new
Codex chat remain **pending the user's test**. The changed command hook must be
reviewed and trusted in Codex before it runs. Installing the update does not trust
it. Look for Prototype 0.1.6 and the two startup timestamps in the panel. Historical
routing captures below concern the removed direct MCP hooks, not this new route.

Reference: https://learn.chatgpt.com/docs/hooks#userpromptsubmit

Version 0.1.5 adds explicitly armed, exact-thread routing capture. Tests cover
capture-off behavior, exclusion of refreshes and other chats, preservation of
routing values, redaction of credentials/prompt fields, private file modes,
record and size caps, expiry, explicit stopping, comparison output, and graceful
handling of malformed capture control. Type checking and all seven protocol
tests pass. Live model/hook capture is a separate installation check.

Version 0.1.5 was installed and a temporary capture was armed for the current
chat. The first post-install model call still registered the 0.1.4 summary
resource and produced no trace, so live capture remains pending connection
refresh. A bounded watcher can compare the next manual summary with its real
Stop-hook summary and automatically disarm; no manually simulated hook calls
are used for the live comparison. Tests verify this watcher's stop behavior.

The subsequent live capture succeeded: it contains a real UserPromptSubmit
launcher call, a model-driven `show_turn_summary`, the real Stop call to
`show_turn_summary`, and the next UserPromptSubmit call. The manual and Stop
summary calls have matching thread and turn IDs. Their delivered metadata differs:

- Both contain the same `threadId`; their `progressToken` values differ.
- Only the model call contains `callId`, `itemId`, `windowId`, `sessionId`,
  `plugin_id`, and `x-codex-turn-metadata` (including the session/thread/turn IDs,
  model, client, workspace, sandbox, review, and turn-start context).
- Both have null HTTP headers, as expected for the stdio transport.
- The hook explicitly passes session and turn IDs as tool arguments; the manual
  call has only `source: manual` in its arguments.

The background exec watcher did not survive the conversation turn. Its report
remained at its initial waiting state even though the raw trace contained both
calls. The comparison was therefore generated manually and the recorder was
explicitly stopped. Do not promise that a watcher started in this tool runtime
will survive a turn; the standalone watcher integration test does not verify
that host lifecycle behavior.

The capture's credential-name filter also redacted the workspace-path entry
because its name contains TokenMonitor. Routing IDs remain intact, but this is
not an unmodified complete request capture. Trace and comparison files remain
private in the independent diagnostics directory and are not committed or
packaged. The richer metadata is an observed difference, not proof that adding
it to a hook or Python request is sufficient to register or display a widget.

Version 0.1.4 exposes the existing `show_turn_summary` tool to the model for an
explicit inline-only test requested by the user. It retains its separate
resource and inline preference; only `open_monitor` has a thread entrypoint.
Manual summary calls do not increment hook counters. Refresh and task-list tools
remain app-only. The hook definitions are unchanged. Build, type checking, five
protocol tests, packaging, and the extracted archive test passed. Version 0.1.4
was installed through the CLI. After the user re-mentioned the plugin, the model
called the inline tool and the user confirmed it rendered. This establishes
model-driven presentation of the same summary resource used by Stop.

Inspection of that successful call's saved event found incoming metadata fields
not included in the earlier Python wrapper probe: `callId`, `plugin_id`,
`windowId`, `itemId`, `sessionId`, and `x-codex-turn-metadata`, including thread,
session, turn, workspace, model, client, and sandbox fields. The saved prototype
diagnostic contains their shapes rather than their original values. The event
also contains `mcpAppResourceUri` and `mcpAppUi.preferredModelDisplayMode=inline`.
The desktop log ties that item to an inline sandbox session. The Python probe
therefore did not reproduce the full successful model-call context. The new
recorder is intended to compare actual delivered values; it does not assume
that replaying those values is sufficient to recreate presentation.

Status: **inline rendering, refresh, and expanded view confirmed by the user;
automatic turn-end inline rendering did not appear in the reported test;
closing the expanded panel did not restore automatic summaries**.

## Automatic-presentation result (2026-10-18)

Host: Codex desktop 26.1013.40934 (build 20770), embedded prototype 0.1.3.

The user reports no inline summary after Codex responses in any tested chats.
Do not advertise the Stop hook as a working automatic-summary feature. Automatic
expanded opening is also not established by a successful model-driven launch.

Read-only diagnosis found persisted trust hashes for both embedded hook
definitions and successful MCP startup in multiple local chats. The user then
reported these live-panel diagnostics:

- Hook open requests: **3**
- Hook turn-end requests: **2**
- Last hook: **Stop**

These counters increment only inside the corresponding server tool handlers
when `source` is `hook`. They confirm both hook calls reached the MCP server,
including two calls to `show_turn_summary`. Combined with the user's report of
no inline summaries, this establishes execution without a visible new summary
in the reported state. It does not establish that hook presentation is impossible
in every display mode.

The user clarified that an explicit model launch worked in another chat but did
not produce the expected result while the monitor was expanded. Expanded
placement is therefore a variable to isolate. In this prototype, `open_monitor`
requests the fullscreen panel resource, while `show_turn_summary` requests a
different, inline-only resource (app-only in 0.1.3). A successful model launcher call
is not a successful test of the Stop summary resource. Do not conflate these
tools or infer a cause from the absence of a new inline card alone.

The user subsequently completed the closed-panel check: a normal response with
no explicit model launch still produced no automatic inline summary. Expanded
placement alone therefore does not explain the failed hook behavior. The user
also confirmed that an explicit launcher opens expanded and closing its tab
returns that same widget inline, matching the desktop's tab-close handler. This
is not creation of a separate Stop summary.

The installed desktop's `hook/started` and `hook/completed` notification handler
updates a turn's hook-run records; it does not create an MCP tool-call item or
present a UI resource. The generated `HookRunSummary` protocol contains text
output entries, with no MCP result or UI metadata field. That handler is evidence
against presentation through the hook-completion event itself, not proof that
there is no other host presentation path. The live panel's hook counters independently
confirm execution; further trust review or an @ mention is not the missing step
in this tested chat.

Official MCP hook documentation specifies an existing-connection tool call and
the command-hook output contract, not presentation of an MCP App result:
https://learn.chatgpt.com/docs/hooks#mcp-tool-hooks

The supported presentation path demonstrated here remains a model call to
`open_monitor`, followed by independent UI refresh. Global AGENTS.md can request
that launch once per new local chat when the tool is available; this is a model
instruction, not a native automatic panel attachment. No global instructions,
hook trust settings, or installed runtime were changed by this diagnosis.

## Python host-API investigation (2026-10-19)

`scripts/probe_embedded_host.py` now reproduces the desktop's MCP RPC from Python.
It starts the installed CLI's app-server in a temporary CODEX_HOME, configures
only this MCP server, and creates a disposable test thread. It neither starts a
model turn nor connects to the desktop's active chats. The test home is removed
on exit. A transparent stdio proxy checks delivered field names and equality
without recording IDs or other metadata values.

The exact request shape tested is:

```json
{
  "method": "mcpServer/tool/call",
  "params": {
    "threadId": "<test-thread-id>",
    "server": "token-monitor-embedded",
    "tool": "open_monitor",
    "arguments": {"source": "manual", "sessionId": "<test-thread-id>"},
    "_meta": {"thread_id": "<test-thread-id>", "threadId": "<test-thread-id>"}
  }
}
```

The desktop's `callMcpTool` wrapper adds those same two metadata keys. The probe
also calls `show_turn_summary` with the same request context. Both calls succeed
and return their expected private `presentation` values (`panel`, `turn-summary`).
The proxy confirms the delivered `sessionId` equals both metadata thread IDs for
both tools. The server receives the two thread-ID keys and an SDK progress token.
No `item/started`, `item/completed`, `turn/started`, or `turn/completed` notification
is emitted by these calls through the final synchronization round trip.

This tests tool execution and event behavior, not visible rendering in the live
desktop. The bundled host rejects `thread/items/list` and `thread/read` with
`includeTurns`, so persisted conversation-item counts could not be compared. The
probe reports those errors explicitly rather than treating unavailable history
as an empty conversation.

There is no Python launcher in the installed plugin: its current definitions are
native `mcp_tool` hooks. They template `sessionId` from `${session_id}` and
`turnId` from `${turn_id}`. Those are tool arguments, not instructions to append
or render a conversation item. The prototype validates their basic types but
does not use either ID for selection, attribution, or widget placement. Exact
identity matching and the real collector remain unimplemented. The reported
hook counts prove execution, not the exact identity values received by those
past hook calls; they were not recorded.

The generated client protocol has 108 request methods. No dedicated app-panel,
widget-present, or conversation-tool-item append method was found. The two
relevant methods are `mcpServer/tool/call` and `thread/inject_items`; the latter's
documented purpose is writing model-visible Responses history, not presenting an
MCP App. It was not used to insert fabricated calls into the user's history.
The desktop's hook-completion path and widget registration/rendering code were
also inspected read-only. Rendering is additional client-side state, not a
missing `threadId`, client name, or MCP tool argument.

Replaying the desktop's MCP request is therefore possible and has been tested.
A working external request that also performs its UI registration has not been
found. Private renderer/IPC state manipulation is not a verified presentation API
and was not used to inject widgets into the desktop. No claim is made that every
possible unsupported host modification is impossible.

Sources: [app-server API](https://learn.chatgpt.com/docs/app-server#api-overview),
[plugin extensions](https://developers.openai.com/plugins/build/extensions), and
read-only inspection of the installed desktop and generated protocol.

### Captured-context replay (2026-10-19)

The Python probe now accepts `--capture` and `--output`. A subsequent run called
both tools through four variants: the basic wrapper, captured routing fields,
captured routing plus turn context, and the captured original identifiers. All
eight calls succeeded. A stdio audit compares canonical metadata fingerprints,
excluding SDK progress tokens, and reports changed field paths without retaining
raw identity values in the report.

For the first three variants, the supplied metadata reached MCP unchanged. When
the captured original IDs were supplied to the isolated thread, the API changed
the top-level `threadId` to the RPC-selected test thread. Every other compared
metadata field was preserved. None of these calls emitted conversation item or
turn notifications. The run did not request model generation.

These are isolated API results, not proof about live desktop rendering: the
test server has no desktop UI and no registered live items for the captured IDs.
The fixture variants remap identity values to the disposable test context. The
over-redacted workspace entries are omitted rather than invented. History
listing remains unavailable in the bundled host.

A separate attempt to use the supported `codex app-server proxy` connection
failed with ENOENT: the desktop has no app-server control socket at its standard
location. No working supported live connection was found, so the captured
context has not been replayed into this chat's actual desktop connection.
Neither copying the fields nor this isolated result establishes a working
automatic-presentation route. The recorder remains stopped.

Executed on Apple silicon macOS with the bundled Node 24.21.0 runtime:

- MCP initialization, tool discovery, and UI resource reads.
- In 0.1.3 only `open_monitor` was model- and app-visible; 0.1.4 also exposes
  `show_turn_summary` for explicit testing. Refresh and listing remain app-only.
  The launcher and summary use separate UI
  resources; only the launcher declares a thread entrypoint.
- MCP Apps UI-to-host-to-server tool calls return private result metadata without
  sending conversation messages or updating model context.
- Diagnostics report metadata field names and types without recording values.
- TypeScript checking and offline asset packaging.
- Native monitor regression suite: 62 Swift tests and 7 Python tests pass.
- Official Node archive checksum verified; executable declares minimum macOS 13.5.

Host diagnosis: the legacy `.mcp.json` loader in this Codex build does not expand
`${PLUGIN_ROOT}` in the command, arguments, or working directory. `codex mcp list`
showed a literal placeholder and a nonexistent working directory; desktop logs
confirmed startup failed with `No such file or directory`. The launcher now uses
`/bin/sh`, relative script arguments, and `cwd: "."`, which Codex resolves against
the installed plugin directory. Tests launch the exact manifest configuration,
including an extracted package directory containing spaces.

The separate local plugin was installed through the Codex CLI. The user later
confirmed the explicit-launch inline widget test worked. Computer Use refused
access to the Codex app, so automated native UI verification remains unavailable.
Automatic turn-end rendering failed the user's test despite confirmed hook
execution. Hiding/reopening behavior and host-chat identity remain unverified.

Version 0.1.3 adds two experimental MCP display hooks, but no full telemetry interface.
The prototype does not read transcripts, query the Codex database, or change
native monitor state. The future full-port acceptance scenarios remain in the
approved implementation plan.

User feedback confirmed that selecting the plugin in the composer only attaches
it, equivalent to an @ mention, and that the proposed manual launch route has
not worked in their Codex surface. That does not constitute a rendered-panel
test. The initial all-app-only tool visibility left no verified usable launcher.
The prototype now exposes `open_monitor` for an explicit model-driven diagnostic
launch, keeping ongoing refresh tools app-only. Manual, zero-model-turn opening
remains unverified; it is not a completed acceptance criterion.

The user subsequently confirmed that the launch test worked, but that the
result renders inline in chat and scrolls away. This confirms inline rendering,
not side-panel placement or hook-triggered rendering. Version 0.1.2 adds explicit
host display-mode diagnostics and capability-gated PiP/fullscreen request
buttons. The user subsequently confirmed expanded view works for their needs. The
native `/status` composer panel is not a documented plugin attachment surface.

Version 0.1.3 requests expanded view by default. Tests verify separate resources
for the live panel and frozen, inline-only completion summary. The Stop tool
does not change the live panel's display mode, and summary UI does not poll.
Five SDK/protocol tests cover discovery, presentation contracts, hook definition
contents, UI-only refresh, and private metadata handling.

The two new definitions require review and trust in Codex before they run.
`UserPromptSubmit` requests expanded view and `Stop` requests an inline summary.
These hooks return no prompts, model context, blocking decisions, or requests to
continue the turn. They use the existing MCP connection with a three-second timeout.

Execution is not proof of rendering: the generated host hook-completion protocol
carries text output entries, not an MCP UI result. Whether this host separately
presents the called resource was not established, and the user's turn-end test
produced no visible summary. Hook invocation counts in the live panel distinguish
execution from presentation. Do not claim automatic opening or summaries from
these experimental hooks. Merely switching to an existing chat does not trigger
UserPromptSubmit.

## 0.3.3 — thread allowance estimates (2026-10-19)

Added selected-thread allowance estimates using the owner's fixed calibration:
12.9 percentage points per API-equivalent USD for 5-hour usage, and 2.1 for
weekly (7-day) usage. Uses full unrounded thread cost, preserves values above
100%, labels incomplete pricing/history as partial, and leaves unavailable
pricing unknown. This is a lifetime thread conversion across allowance resets,
not a rolling-window calculation or observed account usage.

Verified production build and type checking; all 26 Node tests pass, including
calibration, zero/unknown/invalid values, uncapped estimates, selected-thread
cost changes, partial coverage, and independence from account telemetry. Offline
archive startup regression and six-hook host discovery pass. The actual bundled
panel rendered the estimate row correctly in the local browser fixture at the
600px host width. Account-installed host rendering remains a separate check.

## 0.3.4 — latest-call readability (2026-10-19)

Includes committed UI changes `21568b6` and `103fefe`: larger latest-call bar
text and the “Fresh Input” legend label. Production build, type checking and all
26 Node tests pass. Release packaging and account readback are recorded in the
private release log. Existing host connections require an installed-plugin
refresh and a fresh chat to load the new UI.

## Latest call placement and lock removal — 2026-10-19

- Moved the shared panel/summary Latest call disclosure immediately after Thread
  usage and before Recent calls, preserving its expanded details.
- Removed embedded selection locking from the UI, state, action schema, preview,
  and current usage documentation. The native floating HUD is unchanged.
- Type checking, production build, and all 26 embedded tests pass. Integration
  coverage verifies independent panels, manual inspection, relevant host-hook
  following, fallback following, and rejection of the retired lock actions.
- Visually verified the production widget in the local fixture host: Thread
  usage, Latest call, and Recent calls appear in order; no lock button remains.
