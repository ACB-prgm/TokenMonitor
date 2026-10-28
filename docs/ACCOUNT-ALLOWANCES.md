# Account subscription allowances

The five-hour and weekly allowances describe the Codex account, independently of the selected chat. Context occupancy, call history, thread costs, and the calibrated thread allowance estimates still belong to the selected chat.

## Live source

While monitor state is requested, the MCP server lazily starts one installed Codex CLI subprocess using `codex app-server --listen stdio://`. It initializes the protocol, then calls [`account/rateLimits/read`](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt). It can also receive account-limit notifications. There are no login, reset-credit, thread, or model-turn requests.

The process inherits the collector's `CODEX_HOME` and uses Codex's existing authentication. The executable is resolved from an absolute `CODEX_CLI_PATH`, PATH, or standard macOS Codex/ChatGPT application locations. No runtime downloads or API keys are required. If the installed CLI or account authentication is unavailable, monitoring continues with local telemetry.

Live refreshes run at most once every 30 seconds and are shared by panels within the same MCP process. Initialization and individual reads each have a five-second deadline. Failure terminates the connection and schedules retries after 30, 60, 120, 240, then 300 seconds. Closing the collector or 60 seconds without state requests stops the subprocess. Account requests may use the network through Codex; transcript parsing and financial estimates remain local. Authentication and diagnostic output are not retained or returned to the panel.

When the response includes `rateLimitsByLimitId`, only its `codex` bucket is used. The legacy `rateLimits` bucket is used only when the map is absent. Five-hour and weekly windows are identified by 300 and 10,080 minutes, regardless of which slot contains them. Other metered buckets are excluded.

## Local catalogue fallback

Every five seconds at most, the collector discovers the existing catalogue (up to 100 accepted local chats), plus the selected chat and latest hook chat. It validates transcript paths and session headers using the existing local-source rules. Archived chats outside that catalogue and telemetry from other hosts are not searched.

A separate allowance reader examines only the last 1 MiB of each changed transcript. It discards partial first/last lines, ignores malformed records, and caches the newest observation per window using file identity, size and modification metadata. It neither creates full usage parsers for other chats nor persists transcript data. An allowance-only token-count record can update the account reading without adding a call.

The newest valid event timestamp wins separately for each window. Catalogue order, filesystem modification time, and the selected chat do not determine which allowance wins. Records without valid timestamps cannot establish freshness. Because the scan is bounded, a reading outside the scanned suffix may be unavailable; local fallback is not a complete account history or an account identity guarantee after switching logins in the same Codex home.

## Display and freshness

Each window retains its existing `used` and optional `reset` fields and adds `source` (`live` or `catalogue`), `observedAt`, `stale`, and `awaitingRefresh`. The UI shows the source under the allowance; its help text includes the observation time and fallback limitations.

A live reading no more than 60 seconds old takes precedence. Otherwise, the newest timestamped live or local observation wins. Retained older live data is marked stale; local telemetry is labeled **Local fallback**. Missing windows remain unknown. Remaining percentage is clamped only for display; stored usage values are not rounded or capped.

When the reported reset time passes without a newer observation, the UI shows **Awaiting refresh**. It does not assume that the account is back to 100% or estimate consumption from thread cost.

# Recent-call previews

Call previews appear and switch immediately. The same details panel remains mounted across columns and chart gaps. Leaving the chart/details starts a 200 ms grace period, followed by a 140 ms fade and collapse. Entering another column or the details cancels dismissal. Keyboard focus and pinned selections preserve the panel. Clear selection and Escape dismiss it explicitly; old selections and timers are cleared on history eviction or chat change. Reduced-motion settings keep the grace period but omit the animation.
