# Using Token Monitor

Token Monitor shows local Codex usage at two scopes. The conversation panel follows a chat and can inspect another local thread. **Token Monitor Analytics** in the main navigation summarizes imported local activity. The five-hour and weekly remaining allowances in the panel describe the signed-in Codex account.

Ask Codex to **Open Token Monitor** for the expanded panel or explicitly request the **inline Token Monitor summary** for a separate snapshot. With the release startup hook enabled and trusted, the first prompt can open the panel automatically. DEV opens on request.

## Find a feature

| Where | What it shows or does |
| --- | --- |
| **Thread picker**, **Rescan threads**, **Refresh metrics** | Search local chats by name or ID, including archived chats when enabled. Rescan discovers restored or newly available local transcripts. Refresh rereads telemetry and clears a panel retry delay. The panel normally polls every two seconds while visible. |
| **Efficiency insights** | Surfaces context capacity pressure and, when the forecast qualifies, guidance about compaction or a new chat. Capacity warnings start at 85% and turn red at 95%. Compaction remains a Codex action. |
| **Thread usage** | Shows the number of recorded normal calls, lifetime API-equivalent spending, the latest context occupancy, selected model and effort, account allowance readings, and the thread's calibrated allowance estimates. The token and cost stacks split fresh input, cache reads, cache writes, reasoning output and other output. Output with no reliable thinking split is shown as unsplit. **Pricing & accounting details** shows exact values, rates and coverage. |
| **Efficiency KPIs** | Compares the selected thread with all imported chats over the selected period. **Compare with** offers 7 or 30 UTC days or all history. Expand for formulas, denominators, spend-change badges, provisional coverage, and historical compaction payback and net savings. |
| **Latest call** | Shows the last normal call's input, output and estimated cost. Expand for fresh and cached input, cache writes, thinking, model, tier, time and rates, plus the Compaction Value forecast, growth and output assumptions, and break-even in calls and, when available, turns. |
| **Recent calls** | Switch between Cost, Tokens, Context and KPIs. Context traces total input and input minus cache reads per call. KPIs traces running dollar averages. Compaction appears as gray bars or dotted boundaries, and an outlined diamond marks estimated historical break-even. Hover or focus for a preview, click or press Enter to pin it, and use Escape to dismiss it. Expand **Exact call values** for the retained records. |
| **Skills & tools**, **Task details**, **Help & diagnostics** | Skills & tools estimates text attribution at about four characters per token and caps it at the latest input size. The estimate covers retained records and omits hidden schemas, images and compaction summaries. Call previews can include bounded activity excerpts. Task details shows session, project, timestamps and status. Help & diagnostics shows discovery, selection, connection, and layout storage. |
| **Settings** | Change display scale and comparison thresholds, inspect history storage, open Usage Analytics, or configure **Continue after reset**. About shows the current build. The release build offers update controls, including verified installation for eligible local marketplace installs. |
| **Usage Analytics** | Choose 7, 30 or 90 UTC days or all time, then daily, weekly or monthly buckets and optional model, effort and project filters. Select a KPI card to change the trend. Use **Exact trend values**, **Cost composition**, **Your top models**, **Thread outliers**, and **Compaction outcomes** to investigate. The chart interpolates between measured buckets. Exact values identify gaps. Analytics has its own display scale and refresh. In the conversation pane, **Thread monitor** returns to the chat. |

See the [dashboard reference](../reference/dashboard.md), [efficiency metrics](../reference/efficiency-metrics.md), [compaction reference](../reference/compaction.md), [account allowances](../reference/account-allowances.md), and [installation and updates](installation.md).

## Frequently asked questions

### Why is my thread's token volume much larger than its context window?

Context consumed is the latest call's input divided by the reported context limit. While Codex compacts, the ring shows progress without a percentage. After compaction it can show estimated retained context until a reliable call arrives. Thread volume sums input and output over recorded normal calls, so context read again counts again. Cached reads are already included in input, and thinking is already included in output.

### How do dollars, cached input and cache savings relate?

The dollar amount estimates the API equivalent of recorded normal-call token usage plus tracked compaction charges. The estimate excludes subscription billing and separately billed tools, search, images or compute. For a priced call, multiply each accounting category by its respective rate per million and sum the results. Fresh input in cost composition is input minus cache reads and writes. Latest Call's **Fresh** uses input minus cache reads, so it includes writes as part of uncached input. Cache savings compares input cost with the hypothetical cost of charging all of that input at the ordinary rate. Cache write premiums can lower the savings or make them negative.

**Cached %** measures recorded reuse. **Warm**, **Uncertain** and **Presumed cold** estimate cache availability based on time since the last recorded call. Check the next call's cache reads to see what was actually reused. See the [accounting formulas](../reference/efficiency-metrics.md#per-call-accounting) and [warmth thresholds](../reference/compaction.md#recommendations-and-cache-warmth).

### Which allowance number should I use to plan work?

Use the observed five-hour or weekly **remaining** value, its source, and its reset time. The thread's **Est. used** applies fixed percentage-point multipliers to its lifetime priced normal calls, so it can span multiple resets or exceed 100%. If a reset passed and the monitor says **Awaiting refresh**, wait for a fresh reading. **Continue after reset** is a separate, opt-in setting for confirmed usage-limit interruptions. See [account allowances](../reference/account-allowances.md).

### Does a Compaction Value of 80 mean I should compact?

It estimates roughly 80% of the avoidable context-processing cost saved in a particular 20-call forecast. Check the projected dollar savings, break-even calls or turns, assumptions, and remaining work. Historical payback tracks whether known compactions have recovered their attributed costs under an estimated alternative. Pending events can be excluded from the displayed fraction. See [compaction](../reference/compaction.md).

### Why are two averages different, or why is a number missing?

Check the scope first. A latest call, lifetime thread, recent-call window, and filtered UTC period use different records. A user turn can contain several model calls. Cost and context cost have different qualifying denominators. KPI comparison badges can be provisional when calls, import, or compatible prices are incomplete. A dash means unavailable, and partial known spend is a lower bound. An absent baseline, a zero denominator, or no eligible peers can prevent a comparison. Check **Pricing & accounting details**, the KPI disclosure, or **Exact trend values** for the relevant coverage.

### Why is a chat missing, or why do I have totals with no chart detail?

Confirm the chat belongs to this local Codex installation, check the archived filter, and use **Rescan threads** for new or restored files. Imported summaries survive later transcript loss. Older detail can expire while summaries persist. A disconnected panel can retain its previous snapshot. For a stale panel, try **Refresh metrics** and check connection and discovery in **Help & diagnostics**. After an install or update, restart Codex and review hook trust if lifecycle features are unavailable. See [history storage](../reference/history-storage.md) and [installation](installation.md).

### Do monitoring and analytics spend model tokens or upload my chats?

Panel polling and history calculations run without model turns. The collector reads local Codex records. History keeps numeric telemetry and chat labels for discovery, with bounded activity excerpts available in the panel. Account readings use the signed-in Codex bridge, and catalog and release checks can retrieve public metadata. An enabled continuation can start a new model turn after an eligible interruption. See [history storage](../reference/history-storage.md) and [account allowances](../reference/account-allowances.md).

## Improve efficiency

Use the metric that matches the goal. To reduce account allowance pressure, monitor observed remaining allowance and resets. To lower estimated spending, compare total cost for comparable completed work, then use cost per call and the breakdown to find the driver. To make room for more context, check actual occupancy and recent growth.

| Observed pattern | Change to try | How to check |
| --- | --- | --- |
| Context cost rises with a long thread | Start a new chat for unrelated work and carry over only the requirements and useful findings. For the same task, consider compacting if the forecast pays back within the work you expect to continue. Preserve critical decisions and constraints in a brief handoff first. | Compare context cost per call on similar work. After compaction, check the next call's context and the historical payback as it develops. |
| A context jump follows a large read or tool result | Ask for a targeted file range, query, or short summary. Share the relevant log excerpt instead of a full dump. | Inspect Context and the call preview around the jump. Treat Skills & tools as an estimate of contributors. |
| Reasoning dominates estimated cost on repeatable work | Try one step lower reasoning effort on a routine task. Compare a lower-priced model when it can meet the task's requirements. | Compare reasoning cost per call, total cost and calls to finish, and check correctness and rework. |
| Cache reuse falls, or cache writes cost more than expected | For related work, keep reusable instructions and context stable and avoid resending large unchanged material. Examine the impact of each added input. | Compare recorded cache reads, writes, cache savings and input cost. Use warmth only as an age-based hint. |
| Estimated spend rises while cost per call stays steady | Check call counts and model, effort, project and work mix. Look for repeated work that can be scoped or batched. | Compare matched tasks or comparable filtered periods and include completed work in the comparison. |
| A comparison is provisional or two panels disagree | Check selected thread, dates, UTC buckets, filters, pricing coverage, and import state before changing settings. | Wait for comparable data and compare the same scope and denominator. |
