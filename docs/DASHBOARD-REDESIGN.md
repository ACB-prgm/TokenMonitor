# Dashboard redesign

The dashboard now follows the decision order: consolidated Thread Usage (context capacity, account allowances and lifetime thread spending), efficiency comparisons, supported insights, latest-call diagnostics, and recent call history. Pricing/accounting formulas and monitoring behavior remain unchanged.

The header combines a searchable local-thread selector with Refresh metrics, Rescan threads, and Settings. Refresh retrieves telemetry; Rescan discovers restored or newly available local transcripts. Search uses names, IDs and existing workspace filtering, with pending/results states inside the selector. Archived history remains part of analytics; an already-selected archived thread remains visible. Settings holds scale, About/version, update controls, and performance thresholds.

## Efficiency comparisons

The single expandable KPI strip has shared Thread and All chats rows. All chats defaults to seven UTC calendar days; 30 days and all history remain available in the expanded section. Context/call is monetary input-processing cost, not token volume. Definitions, exact averages, coverage, model/weekly tables, and compaction accounting remain expandable.

Comparable baselines match model, explicitly recorded reasoning effort, normalized tier, regional processing, and rate identity. Reference averages are weighted by the current qualifying call mix independently for cost, input cost, and cache-read share. Performance assessments require at least 20 current and baseline calls per cohort, complete matching/pricing coverage, and a completed import with a frozen 100-call baseline. Otherwise the metrics remain visible with neutral provisional or unavailable assessments. This is a descriptive resource comparison, not statistical proof of efficiency or task quality.

The earliest-100 baseline retains its frozen call identities. Analytics format v3 replays local source records to add effort and pricing cohorts; matching records enrich old baseline effort in memory. Ambiguous or missing records remain unknown, rather than selecting a new baseline. No transcript text is added to analytics storage. Replay can temporarily leave comparisons unavailable.

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
