# Historical efficiency

An expandable KPI banner below Latest call compares the selected thread's lifetime usage with all readable local primary chats. All chats defaults to seven UTC calendar days, including today; 30 days and all history are available. Archived chats participate regardless of picker filters. Import runs in the background, and the banner reports progress and failed reads.

Cost per call divides priced normal-call cost plus separately estimated compaction charges by priced normal calls. Context cost per call independently prices fresh, cached and cache-write input, even when output is unavailable. Reasoning is already included in output and is never charged twice. Missing categories and unsupported rates are excluded, with qualifying counts and pricing coverage shown. Partial spending is a lower bound, not a complete bill.

The baseline is the earliest 100 normal calls found during the initial completed import. It remains provisional with fewer calls; once full it is frozen. It describes earliest observed usage, not usage before adopting TokenMonitor. Analytics activation is recorded independently. New rates reprice baseline samples and trigger source replay for historical aggregates and payback; old-basis results are withheld when their source cannot be rebuilt. Pricing identity includes both metadata and the bundled rate table.

Weekly tables use Monday-based UTC weeks and weighted sums divided by qualifying counts. Latest-100 windows retain 100 normal calls, not 100 priced calls. Separately attributed compaction charges within the window are included. Model tables show call/spending shares, both cost averages and changes against matching baseline model contributions. Missing or zero baselines have no percentage change.

## Compaction estimates

The compacted path uses recorded subsequent call categories and output. The alternative retains the removed context as an additional warm prefix, priced under each subsequent call's model, tier, region and input-size band. Reported retained context is used when available; otherwise 40,000 tokens is assumed. Charges estimate a warm read of the original context, 3,600 summary output tokens, and a replacement write. Replacement writes recorded on the first subsequent normal call are credited against the estimate once. These modeled charges are disclosed separately from recorded normal-call costs.

An epoch is profitable when cumulative estimated savings first reach its overhead. The details expose first break-even call and final net savings, which can differ from the earlier break-even result. Invalid counterfactuals, unavailable pricing/accounting, and context-capacity violations exclude an epoch from the denominator. A complete compaction with no subsequent calls is unprofitable when its overhead can be priced.

The next compaction, an explicit SessionEnd, or seven days without recorded activity closes an epoch. A response ending does not close it. Inactivity closure is labeled and counted; resumed activity replays and recalculates the final epoch. Period payback counts completion dates, while spending counts charge dates. No evaluable outcomes means N/A.

## Storage and recovery

A private `efficiency.sqlite` in the plugin state directory contains schema-versioned thread snapshots, file signatures, numeric daily aggregates, compaction outcomes, earliest/latest call buffers and baseline metadata. DEV and release use separate directories. No prompts, excerpts, tool arguments, transcript contents or reasoning text are persisted by this feature. Source transcripts and Codex databases stay read-only.

Unchanged source signatures reuse stored summaries across restarts. Changed, truncated or replaced transcripts are streamed again and their thread contribution is replaced atomically, preventing additive replay counting. Source reads yield between records/threads; malformed and oversized records are ignored. A new process can recover from the last committed thread snapshot. The current implementation replays a changed thread rather than persisting parser internals and byte offsets. Storage failures leave existing telemetry available; analytics remain unavailable. No remote analytics or additional model calls are introduced.

The automated tests cover numerical accounting, rolling buffers, payback boundaries, capacity exclusions, persistent replay/restart/replacement and banner rendering. Installed Codex desktop appearance still requires a restart and host verification.
