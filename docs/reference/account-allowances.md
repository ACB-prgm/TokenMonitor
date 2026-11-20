# Account allowances

The five-hour and weekly allowances describe the Codex account, independently of the selected chat. Context occupancy, call history, thread costs, and the calibrated thread allowance estimates still belong to the selected chat.

## Live source

The MCP server reads signed-in Codex usage through the desktop app bridge using the authenticated caller's chat. Ordinary panel reads share a cached snapshot and one in-flight request per process, refreshing after 30 seconds. Failures mark retained data stale and back off from 15 seconds up to five minutes. If the bridge or account identity is unavailable, monitoring continues with local catalogue telemetry. The account read itself starts no model turn.

The display reads five-hour and weekly windows from the Codex usage bucket, identified by 300 and 10,080 minutes regardless of slot. Other metered buckets are excluded from the displayed windows. Continuation checks capacity separately.

## Local catalogue fallback

Every five seconds at most, the collector discovers the existing catalogue (up to 100 accepted local chats), plus the selected chat and latest hook chat. It validates transcript paths and session headers using the existing local-source rules. Archived chats outside that catalogue and telemetry from other hosts are not searched.

A separate allowance reader examines only the last 1 MiB of each changed transcript. It discards partial first/last lines, ignores malformed records, and caches the newest observation per window using file identity, size and modification metadata. It neither creates full usage parsers for other chats nor persists transcript data. An allowance-only token-count record can update the account reading without adding a call.

The newest valid event timestamp wins separately for each window. Catalogue order, filesystem modification time, and the selected chat do not determine which allowance wins. Records without valid timestamps cannot establish freshness. Because the scan is bounded, a reading outside the scanned suffix may be unavailable; local fallback is not a complete account history or an account identity guarantee after switching logins in the same Codex home.

## Display and freshness

Each window retains its existing `used` and optional `reset` fields and adds `source` (`live` or `catalogue`), `observedAt`, `stale`, and `awaitingRefresh`. Allowance hover help includes the source, observation time, stale status, and fallback limitations; these do not occupy a separate row.

A live reading no more than 60 seconds old takes precedence. Otherwise, the newest timestamped live or local observation wins. Hover help marks retained older live data stale and identifies local telemetry as catalogue fallback. Missing windows remain unknown. Remaining percentage is clamped only for display; stored usage values are not rounded or capped.

When the reported reset time passes without a newer observation, the UI shows **Awaiting refresh**. It does not assume that the account is back to 100% or estimate consumption from thread cost.

## Estimated thread contribution

Observed remaining allowance is `100% − account used percentage`, clamped for display. The thread estimate is `lifetime priced normal-call USD × 12.9` percentage points for five hours and `× 2.1` for weekly. For example, $2 of measured normal-call API-equivalent cost gives approximately 25.8 and 4.2 percentage points, respectively. The calibration spans resets and can exceed 100%. It excludes separate compaction charges and unpriced calls. The displayed account remaining values come from their own observations.

## Continue after reset

In **Settings → Continue after reset**, choose **Off** (the default), **Current thread**, or **All threads** (existing and future eligible local chats on this host). The choice persists. When a fresh five-hour observation reaches 90% used, the panel can offer the same setting. **Not now** dismisses that offer for the selected chat and reset window.

With permission enabled, the worker checks for a latest failed turn with confirmed usage-limit evidence. It checks about every 15 seconds, waits until five seconds after any known blocking resets, and verifies fresh capacity and the unchanged idle thread before sending one continuation. A weekly or other metered limit can also block dispatch. Completed work, manually interrupted work, temporary rate limits and ambiguous failures do not qualify. A new turn or switching the setting off cancels a waiting attempt. The worker pauses for unavailable or archived chats, identity changes, or missing live evidence. It does not resend after uncertain delivery.

Keep Codex running and the computer awake. The worker can run with the panel hidden while the plugin process stays alive. Settings and attempt state are stored locally.

## Source and tests

[Allowance selection](../../plugins/token-monitor-embedded/server/src/allowances.ts) · [Bridge](../../plugins/token-monitor-embedded/server/src/bridge-usage.ts) · [Continuation](../../plugins/token-monitor-embedded/server/src/continuation.ts) · [Regression tests](../../plugins/token-monitor-embedded/tests/allowances.test.mjs) · [Documentation index](../index.md)
