# Efficiency metrics

An expandable KPI strip above Efficiency Insights and Latest Call compares the selected thread's lifetime usage with all imported local primary chats, including saved summaries whose source files are no longer present. Comp defaults to seven UTC calendar days, including today; 30 days and all history are available. Archived chats participate regardless of picker filters. Import runs in the background, and the banner reports progress and failed reads.

The compact strip has shared Thread and Comp rows. Displayed deltas compare their visible aggregate values directly; cohort comparisons are retained separately for supported insights, with explicit coverage and provisional states; see [Dashboard redesign](dashboard.md) for thresholds, settings, insights and validation.

Cost per call divides priced normal-call cost plus separately estimated compaction charges by priced normal calls. Context cost per call independently prices fresh, cached and cache-write input, even when output is unavailable. Reasoning is already included in output and is never charged twice. Missing categories and unsupported rates are excluded, with qualifying counts and pricing coverage shown. Partial spending is a lower bound, not a complete bill.

The historical reference includes all imported calls from other chats; it is not frozen at the first 100 calls. Analytics activation is recorded independently. New rates trigger source replay for historical aggregates and payback when the source remains readable. Saved estimates whose source is missing retain their original calculation basis and remain visible, with affected comparisons marked provisional. Pricing identity includes both metadata and the bundled rate table.

Periods use UTC calendar days. Averages are weighted sums divided by qualifying counts. Latest-100 windows use retained normal calls, including unpriced calls in the window; separately attributed compaction charges within that window are included. Routine snapshots carry cohort totals and selected recent calls, without loading or transmitting lifetime call lists or weekly tables. Missing or zero references have no percentage change.

## Source and tests

[Implementation](../../plugins/token-monitor-embedded/server/src/efficiency.ts) · [Regression tests](../../plugins/token-monitor-embedded/tests/efficiency.test.mjs) · [Documentation index](../index.md)
