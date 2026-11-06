# Efficiency metrics

An expandable KPI strip above Efficiency Insights and Latest Call compares the selected thread's lifetime usage with all imported local primary chats, including saved summaries whose source files are no longer present. Comp defaults to seven UTC calendar days, including today; 30 days and all history are available. Archived chats participate regardless of picker filters. Import runs in the background, and the banner reports progress and failed reads.

The compact strip has shared Thread and Comp rows. Displayed deltas compare their visible aggregate values directly; cohort comparisons are retained separately for supported insights, with explicit coverage and provisional states; see [Dashboard redesign](dashboard.md) for thresholds, settings, insights and validation.

Cost per call divides priced normal-call cost plus separately estimated compaction charges by priced normal calls. Context cost per call independently prices fresh, cached and cache-write input, even when output is unavailable. Reasoning is already included in output and is never charged twice. Missing categories and unsupported rates are excluded, with qualifying counts and pricing coverage shown. Partial spending is a lower bound, not a complete bill.

The historical reference includes all imported calls from other chats; it is not frozen at the first 100 calls. Analytics activation is recorded independently. New rates trigger source replay for historical aggregates and payback when the source remains readable. Saved estimates whose source is missing retain their original calculation basis and remain visible, with affected comparisons marked provisional. Pricing identity includes both metadata and the bundled rate table.

Periods use UTC calendar days. Averages are weighted sums divided by qualifying counts. Latest-100 windows use retained normal calls, including unpriced calls in the window; separately attributed compaction charges within that window are included. Routine snapshots carry cohort totals and selected recent calls, without loading or transmitting lifetime call lists or weekly tables. Missing or zero references have no percentage change.

## Efficiency comparisons

The expandable KPI strip has Thread and Comp rows, ordered Context/call, Cost/call, Compaction payback. The always-visible “Compare with” selector shares its header and defaults to the last seven UTC calendar days, with 30 days and all history available. Thread deltas divide the displayed Thread average by the displayed Comp average. Comp includes all chats in the selected period, including this thread; its deltas compare against the immediately preceding equal-length period. All history has no preceding period and omits Comp deltas. Both cost metrics use neutral spending-change badges because differences in models, effort and work can affect the aggregates. Zero or absent references produce no delta. Asterisks indicate fewer than 20 priced calls in either population, incomplete pricing, or incomplete import.

Context/call is monetary input-processing cost, not token volume. The expanded guide contains the three definitions, formulas and numeric substitutions, compaction net savings to date and concise comparison/asterisk notes. Exact numerators and averages remain in tooltips. Payback displays the fraction and percentage, such as 1/2 (50%), with pending counts shown only in the expanded compaction details. Active valid events count immediately at break-even. Pending events are excluded until break-even or completion; ending a session can therefore change the denominator. Missing values display a dash.

The separate cohort comparisons used for deterministic insights and the Recent Calls chart remain available in telemetry. Cost matches model and recorded reasoning effort; context/cache matches model only. These references use other chats, weighted by qualifying call mix, and require at least 20 current/reference calls per participating group, full pricing/matching coverage and a completed import. Tier and regional rates still affect accounting without splitting cohorts. No frozen 100-call comparison limit applies; legacy baseline records remain untouched. Prior-period summaries are additive optional fields, with no history replay or accounting changes.

For comparable insight assessments, default cost boundaries: green at least 10% below reference; neutral above −10% through +10%; amber above +10% through +30%; red above +30%. Compaction payback counts evaluable epochs that ever reached break-even, including active epochs as soon as they recover their overhead. At least five events are required for classification. Zero net savings to date is neutral; negative savings is red. With positive savings, payback below 50% is red, 50–<80% amber, and at least 80% green.

Threshold settings validate ordered boundaries, support reset, and persist as versioned local preferences with separate DEV/release keys. Blocked storage leaves preferences active in memory. Resource utilization warnings are separate: amber at 85%, red at 95%.


## Source and tests

[Implementation](../../plugins/token-monitor-embedded/server/src/efficiency.ts) · [Regression tests](../../plugins/token-monitor-embedded/tests/efficiency.test.mjs) · [Documentation index](../index.md)
