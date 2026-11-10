# Dashboard redesign

The dashboard now follows the decision order: consolidated Thread Usage (context capacity, account allowances and lifetime thread spending), efficiency comparisons, supported insights, latest-call diagnostics, and recent call history. Pricing/accounting formulas and monitoring behavior remain unchanged.

The header leads with the searchable local-thread selector, followed by Rescan threads, Refresh metrics and Settings. Redundant branding is removed; narrow layouts use accessible icon buttons. Refresh retrieves telemetry; Rescan discovers restored or newly available local transcripts. Search uses names, IDs and existing workspace filtering, with pending/results states inside the selector. Archived history remains part of analytics; an already-selected archived thread remains visible. Settings holds scale, About/version, update controls, and performance thresholds.

## Efficiency comparisons

See [efficiency metrics](efficiency-metrics.md) for definitions, thresholds and coverage.

## Insights and call history

Efficiency insights show capacity pressure followed by eligible compact-or-switch guidance. Spending changes, cache reuse and historical compaction losses remain outside insights; the KPI container reports spending and historical payback. The disclosure is hidden when neither capacity pressure nor an eligible forecast applies. Capacity alone never recommends compaction, and token measurements never establish task complexity, success, or quality.

Latest Call summarizes input, output and estimated cost on one line. Compaction Value (out of 100), turn-based payback estimates or unavailable reasons, and complete forecast diagnostics remain in expanded details. Recent Calls preserves mouse/keyboard preview and pinning, adds category costs and explicit units, and shows compactions as separate solid gray bars in Cost and Tokens. Gray bars are not stacked by category. Cost height includes the full attributed request and replacement-write charge after credits; Tokens height is request input plus output, without counting cached or reasoning tokens twice. Consecutive and trailing compactions receive their own chronological slots without changing normal-call numbers. Context and KPIs retain dotted compaction boundaries.

Compactions support the same hover, keyboard-focus, pinning, Escape and dismissal behavior as calls. Their previews and exact-value rows distinguish Recorded usage, Partly estimated and Estimated, with request cost, replacement-write estimate, credit, assumptions and fallback reasons. Unknown costs display an unavailable marker, and valid recorded tokens remain available. The primary thread spending total includes compaction charges, while normal-call composition remains separately identified. Older snapshots without usage details retain boundary markers. Recent Calls has no comparison reference overlay. Spending comparisons appear in the KPI container; the KPIs chart view retains running per-call averages.

## Validation

Validated with production builds, plugin typecheck/tests, and root development tests. Browser checks used the actual bundled panel and local MCP AppBridge preview, not a replacement mock UI.

- Widths: 760, 600, 380, and 320px; all four display scales at 320px; no horizontal document overflow.
- Collapsed KPI height: approximately 130px desktop and 127px at narrow widths with representative values.
- Light/dark rendering, keyboard picker navigation and focus restoration, empty/long-title search results, KPI Enter/Space disclosure, settings Escape, invalid threshold rejection, reset, and persistence after reload.
- Loading/missing telemetry, small amounts, capacity pressure, negative compaction savings, and absence of chart reference overlays.
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

Allowance summaries lead with the selected thread's estimated usage beside the period label; observed account remaining appears on the second line. Efficiency Insights now sits immediately below thread selection and is omitted when neither capacity nor eligible forecast guidance applies. The KPI strip uses primary black thread values, inline delta/provisional badges, muted All chats values and subtle column separators; tight row spacing reduces its collapsed height without changing comparisons or severity rules. Provisional comparisons remain neutral.

KPI spacing and primary typography are tightened to keep deltas beside values at normal panel widths. All chats deltas use the same pill treatment as Thread deltas. A superscript asterisk replaces repeated provisional labels; opening the native KPI disclosure explains its meaning, minimum samples and reliability rules before the metric-specific coverage tables.


## Actionable compaction guidance and cache warmth

See [compaction recommendations](compaction.md) for turn-based guidance and cache warmth.

## Deprecated comparison retirement validation

Removed the other-chat cohort comparison payload and Recent Calls reference overlay. KPI aggregate comparisons remain the sole spending comparison, and insights retain capacity pressure plus eligible compact-or-switch guidance. The forecast uses explicit comparison readiness while retaining its existing other-chat turn estimates and compaction counterfactual.

All 292 plugin tests, TypeScript checking, the production build, four root development tests and documentation link checks passed locally. Regression coverage includes omitted deprecated fields, inert legacy metadata, import failures and frozen history, mixed-model aggregates with compaction charges, period selection, forecast readiness and hidden empty insights. The actual bundled preview was inspected at 760px and 320px; compact-or-switch details opened by keyboard without horizontal overflow. No installed-host verification, installation or release was performed.
