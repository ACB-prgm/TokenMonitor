# Dashboard

The dashboard now follows the decision order: consolidated Thread Usage (context capacity, account allowances and lifetime thread spending), efficiency comparisons, supported insights, latest-call diagnostics, and recent call history. Pricing/accounting formulas and monitoring behavior remain unchanged.

The header leads with the searchable local-thread selector, followed by Rescan threads, Refresh metrics and Settings. Redundant branding is removed; narrow layouts use accessible icon buttons. Refresh retrieves telemetry; Rescan discovers restored or newly available local transcripts. Search uses names, IDs and existing workspace filtering, with pending/results states inside the selector. Archived history remains part of analytics; an already-selected archived thread remains visible. Settings holds scale, About/version, update controls, and performance thresholds.

## Efficiency comparisons

See [efficiency metrics](efficiency-metrics.md) for comparison populations, calculations, thresholds and coverage.

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
