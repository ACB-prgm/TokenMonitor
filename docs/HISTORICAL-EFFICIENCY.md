# Historical efficiency

An expandable KPI strip above Efficiency Insights and Latest Call compares the selected thread's lifetime usage with all readable local primary chats. All chats defaults to seven UTC calendar days, including today; 30 days and all history are available. Archived chats participate regardless of picker filters. Import runs in the background, and the banner reports progress and failed reads.

The compact strip has shared Thread and Comp rows. Displayed deltas compare their visible aggregate values directly; cohort comparisons are retained separately for supported insights, with explicit coverage and provisional states; see [Dashboard redesign](DASHBOARD-REDESIGN.md) for thresholds, settings, insights and validation.

Cost per call divides priced normal-call cost plus separately estimated compaction charges by priced normal calls. Context cost per call independently prices fresh, cached and cache-write input, even when output is unavailable. Reasoning is already included in output and is never charged twice. Missing categories and unsupported rates are excluded, with qualifying counts and pricing coverage shown. Partial spending is a lower bound, not a complete bill.

The historical reference includes all imported calls from other chats; it is not frozen at the first 100 calls. Analytics activation is recorded independently. New rates trigger source replay for historical aggregates and payback when the source remains readable. Saved estimates whose source is missing retain their original calculation basis and remain visible, with affected comparisons marked provisional. Pricing identity includes both metadata and the bundled rate table.

Weekly tables use Monday-based UTC weeks and weighted sums divided by qualifying counts. Latest-100 windows retain 100 normal calls, not 100 priced calls. Separately attributed compaction charges within the window are included. Model tables show call/spending shares, both cost averages and changes against matching baseline model contributions. Missing or zero baselines have no percentage change.

## Compaction estimates

The compacted path uses recorded subsequent call categories and output. The alternative retains the removed context as an additional warm prefix, priced under each subsequent call's model, tier, region and input-size band. Reported retained context is used when available; otherwise 40,000 tokens is assumed. Charges estimate a warm read of the original context, 3,600 summary output tokens, and a replacement write. Replacement writes recorded on the first subsequent normal call are credited against the estimate once. These modeled charges are disclosed separately from recorded normal-call costs.

An epoch is profitable when cumulative estimated savings first reach its overhead. The details expose first break-even call and final net savings, which can differ from the earlier break-even result. Invalid counterfactuals, unavailable pricing/accounting, and context-capacity violations exclude an epoch from the denominator. A complete compaction with no subsequent calls is unprofitable when its overhead can be priced.

The next compaction, an explicit SessionEnd, or seven days without recorded activity closes an epoch. A response ending does not close it. Inactivity closure is labeled and counted; resumed activity replays and recalculates the final epoch. Period payback counts completion dates, while spending counts charge dates. No evaluable outcomes means N/A.

## Storage and recovery

A private `efficiency.sqlite` in the plugin state directory now contains typed numeric buckets, retained numeric calls, compaction outcomes, completed-turn totals and interned model/pricing dimensions. Legacy JSON snapshots migrate one chat per transaction and are removed after successful conversion. Older calculation bases are preserved. DEV and release use separate directories. No prompts, excerpts, tool arguments, transcript contents or reasoning text are persisted by this feature. Source transcripts and Codex databases stay read-only.

Numeric call detail is retained for 90 UTC calendar days, including today, and expired detail is removed in bounded batches without deleting spending aggregates. SQLite uses WAL, durable commits, an approximately 4 MiB automatic checkpoint target and no routine backup copies. Fresh databases support incremental vacuum; existing databases reuse freed pages. Storage diagnostics expose database/journal sizes and reusable pages through the storage API.

Unchanged source signatures reuse stored summaries across restarts. Changed, truncated or replaced transcripts are streamed again and their thread contribution is replaced atomically, preventing additive replay counting. Cached historical snapshots are keyed by storage revision, selected chat, UTC day and import progress; the cache is limited to 64 entries and 16 MiB of serialized results. Historical chart references contain cohort totals rather than every chat/day bucket.

This is the storage foundation of the durable-history redesign, not its completed rollout. Changed transcripts still require full replay. Byte checkpoints, bounded hook ingestion while the panel is closed, worker integration, materialized lifetime totals, complete turn/compaction detail retention and the million-call benchmark remain outstanding. Do not infer those capabilities from the normalized schema. No remote analytics or additional model calls are introduced.

The automated tests cover numerical accounting, rolling buffers, payback boundaries, capacity exclusions, persistent replay/restart/replacement and banner rendering. Installed Codex desktop appearance still requires a restart and host verification.
