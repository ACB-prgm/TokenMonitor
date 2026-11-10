# App bridge cutover

The display and continuation worker now share `BridgeUsage`, one cached account
snapshot and one in-flight read per MCP process. The running plugin no longer
launches a separate usage app-server. Local token/history collection, recorded
usage fallback and installation/update CLI commands are unchanged. Failed bridge
reads mark retained live data stale and back off; recorded data cannot authorize
a continuation or near-limit offer.

## Settings and behavior

Open Settings and use the **Continue after reset** dropdown: **Off**, **Current thread**,
or **All threads**. The title is on the left and the control on the right, matching
other settings. No chat name is repeated. Off disables continuation on this account
and host; Current thread enables only the selected chat; All threads covers existing
and future local chats on this host. The choice persists across restarts and successful
continuations. Existing per-chat permissions remain until a new scope is selected.
Existing DEV probe permissions are not migrated.
The panel offers the same setting at 90% five-hour usage. **Not now** dismisses
that offer for the selected chat and reset window, including across reopenings.

Only a latest failed turn with structured `usageLimitExceeded` evidence qualifies.
Idle/completed chats, manual interruptions, unknown errors and transient rate
limits never trigger continuation. The worker checks enabled chats every 15
seconds, waits for known blocked-window resets plus five seconds, and requires a
fresh capacity read and unchanged idle target immediately before dispatch.
Weekly limits can delay it too. Disabling the setting or a new turn prevents a
waiting dispatch. Archived/unavailable chats and account changes pause checks.

Preferences and one-attempt-per-turn claims are stored in
`~/.codex/token-monitor-dev/continuation.sqlite` for DEV, with separate release
state. Waiting episodes recover on MCP startup. Dispatch is atomically marked
uncertain before sending; ambiguous sends and interrupted dispatches are never
replayed. The setting stays enabled for future interrupted turns. A final
read/send race remains because the app has no atomic compare-and-send API.

Keep Codex running and the computer awake. The worker runs while its MCP process
is alive, including with the panel hidden; it cannot run while Codex is closed.
The app bridge remains private and may change. Bridge availability is established
by actual reads, not just the presence of an environment variable. Unix and
Windows release launchers prefer the supplied app Node runtime when supported;
the verified packaged runtime remains available for local telemetry otherwise.

## Comparison gate and acceptance limits

The old reader is isolated in `legacy-allowances.ts` for diagnostics and its
existing tests. Production does not import or fall back to it. To compare live
sources without changing the display or sending any messages:

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/compare-usage.mjs CHAT_ID /tmp/tokenmonitor-usage-comparison.jsonl 1800
```

The runner polls every 30 seconds and records limit fields and timings, excluding
account identity and chat contents. It cannot pass without 30 minutes, an observed
reset, no errors, and no discrepancy lasting at least one interval. Increase the
duration to span a reset. Prior live one-sample comparisons matched, but sustained
comparison across a reset has **not** completed. This is a DEV cutover for testing,
not acceptance evidence for a stable release.

Automated tests cover persistence, concurrent claims, restart recovery, confirmed
failure eligibility, unknown reset/capacity, weekly blocking, cancellation,
account changes, archive checks, uncertain sends, prompt dismissal and selection,
shared reads/backoff, production isolation from legacy usage RPC, and Unix runtime
selection. Live full-desktop restart and genuinely capped interrupted-work tests
remain required before stable publication. Windows launcher execution has not
been tested on Windows. No stable release is published by this change.

## DEV deployment evidence

Installed `1.10.0-dev.1794283247898.698867` from implementation commit `8e8d2c8`.
All 304 plugin tests and six DEV/diagnostic tests passed; TypeScript, build,
documentation links and diff checks passed. Local Chrome previews at 320px and
600px had no horizontal overflow and the narrow preview was visually inspected.

A read-only smoke test launched the installed MCP package using its actual
runtime environment allowlist. It verified live five-hour and weekly usage,
correct selected chat, default-off continuation settings, the new settings tool,
and absence of the old probe tool and harmless-test UI. It sent no messages and
enabled no preferences. Reconnect DEV and reopen its panel to replace an already
running old MCP process. Stable was not published or reinstalled.

The scope dropdown uses a native select with keyboard support and
an accessible label. All-thread discovery reads the complete local metadata
index plus discovered local transcripts, excludes archived chats and subagents,
and retains the same structured-failure and one-attempt-per-turn requirements.

## Review fixes (2026-11-10)

Continuation now rejects any returned null, malformed, or empty usage bucket;
an optional absent window is allowed only when its bucket has another valid
window. Ordinary-usage eligibility and every known limit still gate dispatch.

Settings retain a validated account/host context for each caller and selected
chat. During an outage, Off revokes that exact scope, including All threads
enabled from another caller, and cancels waiting episodes atomically. Without
saved context the change fails explicitly. Existing installations acquire
context on their next successful settings/status read; no permission is enabled
or migrated. Scope changes use one immediate SQLite transaction so concurrent
Current thread changes cannot leave multiple chats enabled. Database and
selection errors do not fall through to offline mutation.

The latest lifetime compaction timestamp and payback gate recommendations even
after its chart event has scrolled out of the 120-call window. All threads mode
shows selected-chat worker outcomes, including uncertain delivery, instead of
hiding them behind a generic enabled message.

All 316 plugin tests and four DEV tests pass, including separate-process scope
races, injected transaction failures, offline revocation across callers,
account/host isolation, long-chat compaction recovery and checkpoint restoration,
and uncertain-delivery status/restart checks. TypeScript and documentation checks
also pass. The live acceptance limits above remain open; these regression tests
do not establish capped-work recovery or full desktop restart acceptance.
