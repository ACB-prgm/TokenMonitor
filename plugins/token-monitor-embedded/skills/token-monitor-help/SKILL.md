---
name: token-monitor-help
description: Explain Token Monitor and Token Monitor DEV in Codex. Use for questions about its dashboard, usage analytics, token and cost calculations, cache, allowances, compaction, history, settings, troubleshooting, or improving efficiency with its metrics.
---

# Token Monitor help

For product questions, start with the relevant section in the bundled docs. The build copies these references from the same source as the installed plugin. In a source checkout, use the corresponding paths at the repository root. Source and test links in the references are for repository readers.

| Question | Read |
| --- | --- |
| Find a control, understand a dashboard label, troubleshoot, or improve usage | [Dashboard walkthrough, FAQ, and practical guidance](references/docs/guides/using-token-monitor.md) |
| Inspect Usage Analytics, filters, charts, outliers, or dashboard behavior | [Dashboard reference](references/docs/reference/dashboard.md) |
| Explain cost per call, context cost, cache accounting, comparison badges, or dated prices | [Efficiency metrics and pricing](references/docs/reference/efficiency-metrics.md) |
| Explain Compaction Value, forecast assumptions, break-even, or past payback | [Compaction](references/docs/reference/compaction.md) |
| Explain account vs. thread allowances, reset times, freshness, or continuation | [Account allowances](references/docs/reference/account-allowances.md) |
| Explain import, missing threads, retention, or privacy | [History storage](references/docs/reference/history-storage.md) |
| Install, update, recover, or roll back | [Installation and updates](references/docs/guides/installation.md) |

- Start with what the value means and where to inspect it. For calculations, give the units, formula, relevant inputs, and any missing coverage or assumption. Use the rates shown for the call when doing arithmetic for a real call. Treat the bundled catalog as the build's baseline since the running monitor can refresh it.
- Separate recorded data, pricing estimates, and forecasts. Keep the selected call, lifetime thread, filtered history, and account allowance scopes distinct. Ask for the relevant visible value or a cropped screenshot if a user-specific answer needs data they have yet to share.
- Answer documentation questions from the files. Use the monitor's open tool for an explicit request to open the expanded panel and the inline summary tool for an explicit request for that widget. Usage Analytics and other panel controls are operated through the UI. Opening a view does not make its UI-only metrics available to the model.
- For advice, use the [practical guidance](references/docs/guides/using-token-monitor.md#improve-efficiency) to match one change to the observed driver and suggest how to measure its effect on comparable work. Treat cost and token changes as usage evidence. Evaluate output quality and task success separately.
