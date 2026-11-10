# App bridge cutover

The display and continuation worker now share `BridgeUsage`, one cached account
snapshot and one in-flight read per MCP process. The running plugin no longer
launches a separate usage app-server. Local token/history collection, recorded
usage fallback and installation/update CLI commands are unchanged. Failed bridge
reads mark retained live data stale and back off; recorded data cannot authorize
a continuation or near-limit offer.

## Settings and behavior

Open Settings and select **Continue this chat after usage reset**. It defaults
to off, is scoped to account/host/chat, and stays enabled across restarts and
successful continuations. Existing DEV probe permissions are not migrated.
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
