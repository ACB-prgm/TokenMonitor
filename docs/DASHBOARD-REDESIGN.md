# Dashboard redesign

The dashboard now follows the decision order: consolidated Thread Usage (context capacity, account allowances and lifetime thread spending), efficiency comparisons, supported insights, latest-call diagnostics, and recent call history. Pricing/accounting formulas and monitoring behavior remain unchanged.

The header combines a searchable local-thread selector with Refresh metrics, Rescan threads, and Settings. Refresh retrieves telemetry; Rescan discovers restored or newly available local transcripts. Search uses names, IDs and existing workspace filtering, with pending/results states inside the selector. Archived history remains part of analytics; an already-selected archived thread remains visible. Settings holds scale, About/version, update controls, and performance thresholds.

## Efficiency comparisons

The expandable KPI strip has Thread and Comp rows, ordered Context/call, Cost/call, Compaction payback. The always-visible “Compare with” selector shares its header and defaults to the last seven UTC calendar days, with 30 days and all history available. Thread deltas divide the displayed Thread average by the displayed Comp average. Comp includes all chats in the selected period, including this thread; its deltas compare against the immediately preceding equal-length period. All history has no preceding period and omits Comp deltas. Both cost metrics use neutral spending-change badges because differences in models, effort and work can affect the aggregates. Zero or absent references produce no delta. Asterisks indicate fewer than 20 priced calls in either population, incomplete pricing, or incomplete import.

Context/call is monetary input-processing cost, not token volume. The expanded guide contains the three definitions, formulas and numeric substitutions, final compaction net savings and concise comparison/asterisk notes. Exact numerators and averages remain in tooltips. Payback displays the fraction and percentage, such as 1/2 (50%), with pending events separately labeled. Pending events are excluded until completed; ending a session can therefore change the denominator. Missing values display a dash.

The separate cohort comparisons used for deterministic insights and the Recent Calls chart remain available in telemetry. Cost matches model and recorded reasoning effort; context/cache matches model only. These references use other chats, weighted by qualifying call mix, and require at least 20 current/reference calls per participating group, full pricing/matching coverage and a completed import. Tier and regional rates still affect accounting without splitting cohorts. No frozen 100-call comparison limit applies; legacy baseline records remain untouched. Prior-period summaries are additive optional fields, with no history replay or accounting changes.

For comparable insight assessments, default cost boundaries: green at least 10% below reference; neutral above −10% through +10%; amber above +10% through +30%; red above +30%. Compaction payback still counts completed evaluable epochs that ever reached break-even. At least five events are required for classification. Zero final net savings is neutral; negative savings is red. With positive savings, payback below 50% is red, 50–<80% amber, and at least 80% green.

Threshold settings validate ordered boundaries, support reset, and persist as versioned local preferences with separate DEV/release keys. Blocked storage leaves preferences active in memory. Resource utilization warnings are separate: amber at 85%, red at 95%.

## Insights and call history

Deterministic insights prioritize capacity pressure, negative completed-compaction savings, elevated comparable input cost, elevated comparable total cost, and cache reuse at least 20 percentage points below baseline. A single collapsed disclosure reads “Efficiency insights: [primary finding]” with a chevron. Finding, impact, recommendation and an optional secondary observation appear only on expansion. Incomplete evidence produces a neutral gathering-history status. Capacity alone never recommends compaction, and token measurements never establish task complexity, success, or quality.

Latest Call summarizes input, output, estimated cost and the Compaction Value score (out of 100) on one line. Container queries shorten Compaction Value to ComVal and the other labels further at narrow widths. Cache uncertainty and the complete Compaction Value forecast explanation stay inside its details. Recent Calls preserves mouse/keyboard preview and pinning, adds category costs and explicit units, and marks compactions. The Cost reference line uses the visible calls' comparable cohort mix, excluding separately modeled compaction charges on both sides. It is withheld when coverage is insufficient. Tokens and Context have no monetary reference overlay.

## Validation

Validated with production builds, plugin typecheck/tests, and root development tests. Browser checks used the actual bundled panel and local MCP AppBridge preview, not a replacement mock UI.

- Widths: 760, 600, 380, and 320px; all four display scales at 320px; no horizontal document overflow.
- Collapsed KPI height: approximately 130px desktop and 127px at narrow widths with representative values.
- Light/dark rendering, keyboard picker navigation and focus restoration, empty/long-title search results, KPI Enter/Space disclosure, settings Escape, invalid threshold rejection, reset, and persistence after reload.
- Loading/missing telemetry, small amounts, capacity pressure, negative compaction savings, and comparable chart reference rendering.
- Preview counters stayed at zero model messages and zero model-context updates while telemetry polling continued.

Reproduce the preview after building:

```sh
npm --prefix plugins/token-monitor-embedded run typecheck
npm --prefix plugins/token-monitor-embedded run build
npm --prefix plugins/token-monitor-embedded test
npm run dev:test
node plugins/token-monitor-embedded/scripts/preview.mjs
python3 -m http.server 8765 --bind 127.0.0.1 --directory .build/embedded-preview
```

The preview includes scenario, width, theme, and disconnect controls. Installed Codex-host appearance still requires a local installation/restart and was not changed by this work. No release, installation, remote push, or new dependency is included.

## Consolidated Thread Usage

The standalone context bar and allowance blocks have been removed. Thread Usage now includes a compact consumed-context ring (about 57px at default scale) aligned with its title and primary cost, with a right-aligned caption to the left, exact values in a keyboard-focusable tooltip, and a compact monitoring/model/effort row. Post-compaction estimates remain explicitly approximate; unknown context remains unavailable.

Side-by-side allowance groups show the account's observed remaining allowance on the same line as the allowance label, with this thread's calibrated estimated contribution immediately below. These retain independent sources and formulas; the thread contribution does not subtract from the account observation. Reset times, source, age and staleness live in tooltips; resets also appear visibly when at most 5% remains. Awaiting-refresh values do not display stale remaining percentages or critical alerts.

Validated at 760/600/380/320px, light/dark themes and all display scales at 320px without overflow or cost/gauge collisions. Insight disclosure supports Enter/Space. Tests cover consumed/unknown/approximate context, critical resets, distinct quota/estimate accounting and visible Compaction Value scores.

The context caption stays left of the ring at all widths. Ring dimensions follow the display scale, and the allowance groups use two compact rows with account source/reset details in tooltips. Compaction Value again uses its original neutral-to-amber/orange/red score scale in both collapsed and expanded views; it remains distinct from historical compaction payback assessments.

Allowance summaries lead with the selected thread's estimated usage beside the period label; observed account remaining appears on the second line. Efficiency Insights now sits immediately below thread selection and is omitted for healthy/gathering-history placeholders. The KPI strip uses primary black thread values, inline delta/provisional badges, muted All chats values and subtle column separators; tight row spacing reduces its collapsed height without changing comparisons or severity rules. Provisional comparisons remain neutral.

KPI spacing and primary typography are tightened to keep deltas beside values at normal panel widths. All chats deltas use the same pill treatment as Thread deltas. A superscript asterisk replaces repeated provisional labels; opening the native KPI disclosure explains its meaning, minimum samples and reliability rules before the metric-specific coverage tables.
