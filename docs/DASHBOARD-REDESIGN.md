# Dashboard redesign

The dashboard now follows the decision order: consolidated Thread Usage (context capacity, account allowances and lifetime thread spending), efficiency comparisons, supported insights, latest-call diagnostics, and recent call history. Pricing/accounting formulas and monitoring behavior remain unchanged.

The header leads with the searchable local-thread selector, followed by Rescan threads, Refresh metrics and Settings. Redundant branding is removed; narrow layouts use accessible icon buttons. Refresh retrieves telemetry; Rescan discovers restored or newly available local transcripts. Search uses names, IDs and existing workspace filtering, with pending/results states inside the selector. Archived history remains part of analytics; an already-selected archived thread remains visible. Settings holds scale, About/version, update controls, and performance thresholds.

## Efficiency comparisons

The expandable KPI strip has Thread and Comp rows, ordered Context/call, Cost/call, Compaction payback. The always-visible “Compare with” selector shares its header and defaults to the last seven UTC calendar days, with 30 days and all history available. Thread deltas divide the displayed Thread average by the displayed Comp average. Comp includes all chats in the selected period, including this thread; its deltas compare against the immediately preceding equal-length period. All history has no preceding period and omits Comp deltas. Both cost metrics use neutral spending-change badges because differences in models, effort and work can affect the aggregates. Zero or absent references produce no delta. Asterisks indicate fewer than 20 priced calls in either population, incomplete pricing, or incomplete import.

Context/call is monetary input-processing cost, not token volume. The expanded guide contains the three definitions, formulas and numeric substitutions, final compaction net savings and concise comparison/asterisk notes. Exact numerators and averages remain in tooltips. Payback displays the fraction and percentage, such as 1/2 (50%), with pending counts shown only in the expanded compaction details. Pending events are excluded until completed; ending a session can therefore change the denominator. Missing values display a dash.

The separate cohort comparisons used for deterministic insights and the Recent Calls chart remain available in telemetry. Cost matches model and recorded reasoning effort; context/cache matches model only. These references use other chats, weighted by qualifying call mix, and require at least 20 current/reference calls per participating group, full pricing/matching coverage and a completed import. Tier and regional rates still affect accounting without splitting cohorts. No frozen 100-call comparison limit applies; legacy baseline records remain untouched. Prior-period summaries are additive optional fields, with no history replay or accounting changes.

For comparable insight assessments, default cost boundaries: green at least 10% below reference; neutral above −10% through +10%; amber above +10% through +30%; red above +30%. Compaction payback still counts completed evaluable epochs that ever reached break-even. At least five events are required for classification. Zero final net savings is neutral; negative savings is red. With positive savings, payback below 50% is red, 50–<80% amber, and at least 80% green.

Threshold settings validate ordered boundaries, support reset, and persist as versioned local preferences with separate DEV/release keys. Blocked storage leaves preferences active in memory. Resource utilization warnings are separate: amber at 85%, red at 95%.

## Insights and call history

Deterministic insights prioritize capacity pressure, negative completed-compaction savings, elevated comparable input cost, elevated comparable total cost, and cache reuse at least 20 percentage points below baseline. A single collapsed disclosure reads “Efficiency insights: [primary finding]” with a chevron. Finding, impact, recommendation and an optional secondary observation appear only on expansion. Incomplete evidence produces a neutral gathering-history status. Capacity alone never recommends compaction, and token measurements never establish task complexity, success, or quality.

Latest Call summarizes input, output and estimated cost on one line. Compaction Value (out of 100), turn-based payback estimates or unavailable reasons, and complete forecast diagnostics remain in expanded details. Recent Calls preserves mouse/keyboard preview and pinning, adds category costs and explicit units, and marks compactions. The Cost reference line uses the visible calls' comparable cohort mix, excluding separately modeled compaction charges on both sides. It is withheld when coverage is insufficient. Tokens and Context have no monetary reference overlay.

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

During compaction, the context ring becomes a spinning arc with `COM` in its stationary center and a “Compacting…” caption, replacing the separate compaction status banner. Its existing context-utilization color thresholds stay in effect. The accessible indicator is indeterminate, and reduced-motion preferences stop the rotation while retaining the compaction label. Completion restores the consumed-context percentage, including the approximate post-compaction value while waiting for the next call.

Side-by-side allowance groups show the account's observed remaining allowance on the same line as the allowance label, with this thread's calibrated estimated contribution immediately below. These retain independent sources and formulas; the thread contribution does not subtract from the account observation. Reset times, source, age and staleness live in tooltips; resets also appear visibly when at most 5% remains. Awaiting-refresh values do not display stale remaining percentages or critical alerts.

Validated at 760/600/380/320px, light/dark themes and all display scales at 320px without overflow or cost/gauge collisions. Insight disclosure supports Enter/Space. Tests cover consumed/unknown/approximate context, critical resets, distinct quota/estimate accounting and visible Compaction Value scores.

The context caption stays left of the ring at all widths. Ring dimensions follow the display scale, and the allowance groups use two compact rows with account source/reset details in tooltips. Compaction Value retains its original neutral-to-amber/orange/red score scale in expanded details; it remains distinct from historical compaction payback assessments.

Allowance summaries lead with the selected thread's estimated usage beside the period label; observed account remaining appears on the second line. Efficiency Insights now sits immediately below thread selection and is omitted for healthy/gathering-history placeholders. The KPI strip uses primary black thread values, inline delta/provisional badges, muted All chats values and subtle column separators; tight row spacing reduces its collapsed height without changing comparisons or severity rules. Provisional comparisons remain neutral.

KPI spacing and primary typography are tightened to keep deltas beside values at normal panel widths. All chats deltas use the same pill treatment as Thread deltas. A superscript asterisk replaces repeated provisional labels; opening the native KPI disclosure explains its meaning, minimum samples and reliability rules before the metric-specific coverage tables.


## Actionable compaction guidance and cache warmth

The existing inline Efficiency Insights disclosure can recommend compaction when conservative projected future payback turns are no greater than completed turns in this epoch (since the last compaction, or chat creation). Capacity and negative completed-compaction findings retain priority. The expanded recommendation distinguishes continuing work that needs this chat’s context from unrelated work better started in a new chat; it never infers context relevance automatically.

Turn tracking uses explicit lifecycle IDs/completion evidence and user-message boundaries; model/tool calls do not independently create user turns. Aborted, incomplete, duplicate, ambiguous and mixed-model turns do not enter calls-per-turn aggregates. A completed turn spanning compaction may contribute to the lifetime same-model mean but is excluded from the new epoch count. Numeric aggregates are cached under analytics format v4, replayed through the existing history scan without retaining prompt/response text. Existing cost, token and compaction accounting remains unchanged.

This chat needs at least five qualifying same-model turns, or other chats need twenty. If both qualify, use the smaller mean, multiply calls/turn by 0.75, then round projected break-even calls divided by that value upward. This conservative buffer is a heuristic, not a confidence interval. The banner requires observed growth/output, known context capacity and pricing, positive net savings of at least $0.000001, and break-even within the existing forecast horizon. It is suppressed during import, disconnected/unavailable/ended telemetry, calls older than two hours, compaction/post-compaction waiting, or an unrecovered/unsynchronized latest compaction. Insufficient evidence never generates an action recommendation. Source means, sample counts, conversion and assumptions are inspectable in details.

The existing Cached % / Cache savings row now centers a focusable warmth label: green Warm (<30 minutes), amber Uncertain (30–120 minutes inclusive), red Presumed cold (>120 minutes), muted Unknown when unavailable. Invalid/future call times are unknown. Warmth estimates age-based availability and does not establish a cache hit/miss; Cached % still measures recorded cache reads. Hover/focus reveals the explanation and call age; Escape dismisses it without moving focus.
