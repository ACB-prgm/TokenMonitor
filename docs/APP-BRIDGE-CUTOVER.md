# App bridge cutover: implementation status

The cutover is **not complete or deployed**. The existing usage display and DEV
probe behavior remain active. Do not treat the idle-chat continuation test as
proof that interrupted work resumes.

## Completed foundation

- Shared `AppBridge` module; the DEV adapter re-exports it for compatibility.
- Prepared shared `BridgeUsage` cache with in-flight deduplication, authenticated
  caller binding, observation timestamps, failure backoff, and shutdown checks.
  It is not yet wired to the display or worker.
- Read-only comparison runner. Build first, then run from a desktop app session
  with its bundled Node runtime:

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node plugins/token-monitor-embedded/scripts/build.mjs
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/compare-usage.mjs CHAT_ID /tmp/tokenmonitor-usage-comparison.jsonl 1800
```

The runner reads both sources every 30 seconds. Output excludes account identity,
credits, diagnostics, and chat contents. Each sample records percentages, reset
and window timestamps, buckets, ordinary-usage eligibility, completion time, and
request duration. Missing required data is an error. Its summary cannot pass
without 30 minutes, an observed reset, no read failures, and no discrepancy lasting
at least one interval. Increase the duration to span the expected reset. Keep the
app running and computer awake; this creates no automation or model turn.

A live one-sample smoke check matched without errors. It correctly reported the
acceptance gate as false. No sustained or real-reset comparison has completed.

## Remaining implementation

Wire the shared reader into display and worker with the caller context; retire
the old subprocess only after its acceptance gate passes. Add persistent,
account/host/chat-scoped continuation preferences defaulting to off; structured
usage-failure eligibility; durable episode claims and restart recovery; Settings
controls and the dismissible 90% offer. Update packaged runtime selection and
MCP environment inheritance. Keep recorded usage display-only. Validate full
restart, concurrent workers, genuine interrupted work, inaccessible and archived
chats, ambiguous delivery, prompt accessibility, and narrow layouts. Install DEV
only after these changes pass checks. Do not publish stable.
