# Dashboard redesign

The dashboard now follows the decision order: consolidated Thread Usage (context capacity, account allowances and lifetime thread spending), efficiency comparisons, supported insights, latest-call diagnostics, and recent call history. Pricing/accounting formulas and monitoring behavior remain unchanged.

The header combines a searchable local-thread selector with Refresh metrics, Rescan threads, and Settings. Refresh retrieves telemetry; Rescan discovers restored or newly available local transcripts. Search uses names, IDs and existing workspace filtering, with pending/results states inside the selector. Archived history remains part of analytics; an already-selected archived thread remains visible. Settings holds scale, About/version, update controls, and performance thresholds.

## Efficiency comparisons

The single expandable KPI strip has shared Thread and All chats rows. All chats defaults to seven UTC calendar days; 30 days and all history remain available in the expanded section. Context/call is monetary input-processing cost, not token volume. The expanded guide contains only the three KPI definitions, formulas and numeric substitutions, final compaction net savings, a period selector and concise comparison/asterisk notes. Exact numerators and averages remain in calculation tooltips; comparison badges retain reference values, sample counts and missing-evidence reasons. Historical tables and repeated methodology paragraphs are removed from this card.

Cost/call comparisons match model and explicitly recorded reasoning effort. Context/call and cache-read share match model only, pooling reasoning efforts because these metrics describe input processing. Tier, regional processing and rate identity affect cost calculation but do not split comparison groups. Reference averages are weighted by the current qualifying call mix independently for each metric. Performance assessments require at least 20 current and reference calls per group, complete matching/pricing coverage, and a completed historical import. Comparison badge tooltips show sample counts and specific missing-evidence reasons. This is a descriptive resource comparison, not statistical proof of efficiency or task quality.

Thread references use every available numeric history bucket from other chats, excluding the selected chat. All chats references use history strictly before the selected 7/30-day UTC period. All history has no earlier reference, so its totals remain visible without a percentage change. There is no frozen 100-call comparison limit. Legacy saved baseline records remain untouched but are no longer used. The latest-100 rolling statistics are still available as separate diagnostics. Existing v3 history buckets already contain the required fields, so no transcript replay or accounting changes are required. No transcript text is added to analytics storage.

Default cost boundaries: green at least 10% below reference; neutral above −10% through +10%; amber above +10% through +30%; red above +30%. Compaction payback still counts completed evaluable epochs that ever reached break-even. At least five events are required for classification. Zero final net savings is neutral; negative savings is red. With positive savings, payback below 50% is red, 50–<80% amber, and at least 80% green.

Threshold settings validate ordered boundaries, support reset, and persist as versioned local preferences with separate DEV/release keys. Blocked storage leaves preferences active in memory. Resource utilization warnings are separate: amber at 85%, red at 95%.

## Insights and call history

Deterministic insights prioritize capacity pressure, negative completed-compaction savings, elevated comparable input cost, elevated comparable total cost, and cache reuse at least 20 percentage points below baseline. A single collapsed disclosure reads “Efficiency insights: [primary finding]” with a chevron. Finding, impact, recommendation and an optional secondary observation appear only on expansion. Incomplete evidence produces a neutral gathering-history status. Capacity alone never recommends compaction, and token measurements never establish task complexity, success, or quality.

Latest Call summarizes input, output, estimated cost and the Compaction Value score (out of 100). Cache uncertainty and the complete Compaction Value forecast explanation stay inside its details. Recent Calls preserves mouse/keyboard preview and pinning, adds category costs and explicit units, and marks compactions. The Cost reference line uses the visible calls' comparable cohort mix, excluding separately modeled compaction charges on both sides. It is withheld when coverage is insufficient. Tokens and Context have no monetary reference overlay.

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
