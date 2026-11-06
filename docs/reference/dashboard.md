# Dashboard

The dashboard now follows the decision order: consolidated Thread Usage (context capacity, account allowances and lifetime thread spending), efficiency comparisons, supported insights, latest-call diagnostics, and recent call history. Pricing/accounting formulas and monitoring behavior remain unchanged.

The header leads with the searchable local-thread selector, followed by Rescan threads, Refresh metrics and Settings. Redundant branding is removed; narrow layouts use accessible icon buttons. Refresh retrieves telemetry; Rescan discovers restored or newly available local transcripts. Search uses names, IDs and existing workspace filtering, with pending/results states inside the selector. Archived history remains part of analytics; an already-selected archived thread remains visible. Settings holds scale, About/version, update controls, and performance thresholds.

## Efficiency comparisons

The expandable KPI strip has Thread and Comp rows, ordered Context/call, Cost/call, Compaction payback. The always-visible “Compare with” selector shares its header and defaults to the last seven UTC calendar days, with 30 days and all history available. Thread deltas divide the displayed Thread average by the displayed Comp average. Comp includes all chats in the selected period, including this thread; its deltas compare against the immediately preceding equal-length period. All history has no preceding period and omits Comp deltas. Both cost metrics use neutral spending-change badges because differences in models, effort and work can affect the aggregates. Zero or absent references produce no delta. Asterisks indicate fewer than 20 priced calls in either population, incomplete pricing, or incomplete import.

Context/call is monetary input-processing cost, not token volume. The expanded guide contains the three definitions, formulas and numeric substitutions, compaction net savings to date and concise comparison/asterisk notes. Exact numerators and averages remain in tooltips. Payback displays the fraction and percentage, such as 1/2 (50%), with pending counts shown only in the expanded compaction details. Active valid events count immediately at break-even. Pending events are excluded until break-even or completion; ending a session can therefore change the denominator. Missing values display a dash.

The separate cohort comparisons used for deterministic insights and the Recent Calls chart remain available in telemetry. Cost matches model and recorded reasoning effort; context/cache matches model only. These references use other chats, weighted by qualifying call mix, and require at least 20 current/reference calls per participating group, full pricing/matching coverage and a completed import. Tier and regional rates still affect accounting without splitting cohorts. No frozen 100-call comparison limit applies; legacy baseline records remain untouched. Prior-period summaries are additive optional fields, with no history replay or accounting changes.

For comparable insight assessments, default cost boundaries: green at least 10% below reference; neutral above −10% through +10%; amber above +10% through +30%; red above +30%. Compaction payback counts evaluable epochs that ever reached break-even, including active epochs as soon as they recover their overhead. At least five events are required for classification. Zero net savings to date is neutral; negative savings is red. With positive savings, payback below 50% is red, 50–<80% amber, and at least 80% green.

Threshold settings validate ordered boundaries, support reset, and persist as versioned local preferences with separate DEV/release keys. Blocked storage leaves preferences active in memory. Resource utilization warnings are separate: amber at 85%, red at 95%.

## Insights and call history

Deterministic insights prioritize capacity pressure, negative completed-compaction savings, elevated comparable input cost, elevated comparable total cost, and cache reuse at least 20 percentage points below baseline. A single collapsed disclosure reads “Efficiency insights: [primary finding]” with a chevron. Finding, impact, recommendation and an optional secondary observation appear only on expansion. Incomplete evidence produces a neutral gathering-history status. Capacity alone never recommends compaction, and token measurements never establish task complexity, success, or quality.

Latest Call summarizes input, output and estimated cost on one line. Compaction Value (out of 100), turn-based payback estimates or unavailable reasons, and complete forecast diagnostics remain in expanded details. Recent Calls preserves mouse/keyboard preview and pinning, adds category costs and explicit units, and marks compactions. The Cost reference line uses the visible calls' comparable cohort mix, excluding separately modeled compaction charges on both sides. It is withheld when coverage is insufficient. Tokens and Context have no monetary reference overlay.


## Thread usage

The consumed-context ring shows occupancy and a compact model/effort row. During compaction it shows an indeterminate arc with COM and a Compacting caption; reduced motion stops rotation while retaining the label. Completion restores occupancy, with post-compaction estimates marked approximate until a reliable call arrives.

Allowance summaries lead with the selected thread's estimated usage; observed account remaining appears separately. Source, freshness and reset details appear in tooltips. See [account allowances](account-allowances.md) for source and precedence rules.

Efficiency Insights sits below thread selection and omits healthy/gathering-history placeholders. KPI disclosures explain coverage and provisional comparisons. See [efficiency metrics](efficiency-metrics.md) for accounting and [compaction](compaction.md) for recommendations.

## Recent-call previews


Call previews appear and switch immediately. The same details panel remains mounted across columns and chart gaps. Leaving the chart/details starts a 200 ms grace period, followed by a 140 ms fade and collapse. Entering another column or the details cancels dismissal. Keyboard focus and pinned selections preserve the panel. Clear selection and Escape dismiss it explicitly; old selections and timers are cleared on history eviction or chat change. Reduced-motion settings keep the grace period but omit the animation.

## Source and tests

[Implementation](../../plugins/token-monitor-embedded/ui/src/view.tsx) · [Regression tests](../../plugins/token-monitor-embedded/tests/dashboard.test.mjs) · [Documentation index](../index.md)
