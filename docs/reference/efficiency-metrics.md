# Efficiency metrics

An expandable KPI strip above Latest Call compares the selected thread's lifetime usage with all imported local primary chats, including saved summaries whose source files are no longer present. Comp defaults to seven UTC calendar days, including today; 30 days and all history are available. Archived chats participate regardless of picker filters. Import runs in the background, and the banner reports progress and failed reads.

The compact strip has shared Thread and Comp rows. Displayed deltas compare their visible aggregate values directly; these aggregate comparisons are the sole spending comparison, with explicit coverage and provisional states; see [Dashboard redesign](dashboard.md) for thresholds, settings, insights and validation.

Cost per call divides priced normal-call cost plus separately estimated compaction charges by priced normal calls. Context cost per call independently prices fresh, cached and cache-write input, even when output is unavailable. Reasoning is already included in output and is never charged twice. Missing categories and unsupported rates are excluded, with qualifying counts and pricing coverage shown. Partial spending is a lower bound, not a complete bill.

The Comp row includes all imported calls in the selected UTC period, including the selected chat; its preceding-period comparison uses the immediately preceding equal-length period. All history has no preceding-period comparison. Analytics activation is recorded independently. New rates trigger source replay for historical aggregates and payback when the source remains readable. Saved estimates whose source is missing retain their original calculation basis and remain visible, with affected comparisons marked provisional. The pricing basis is a hash of the normalized pricing rules. Verification dates and HTTP cache validators do not trigger a replay.

Periods use UTC calendar days. Averages are weighted sums divided by qualifying counts. Latest-100 windows use retained normal calls, including unpriced calls in the window; separately attributed compaction charges within that window are included. Routine snapshots carry aggregate summaries and selected recent calls, without loading or transmitting lifetime call lists or weekly tables. Missing or zero references have no percentage change.

## Per-call accounting

| Metric | Calculation |
| --- | --- |
| Fresh input in the composition | Total input minus cache-read and cache-write tokens. Latest Call and the Context chart show uncached input as total input minus cache reads. |
| Input cost | `(fresh × input rate + cache reads × read rate + cache writes × write rate) / 1,000,000` |
| Output cost | `output × output rate / 1,000,000`. When reasoning is known, split output cost between thinking and other output using the same rate. Otherwise show unsplit output. |
| Normal-call cost | Input cost plus output cost. Thread and analytics estimated cost add attributed compaction charges separately. |
| Cached input share | `100 × cache-read tokens / input tokens`. For aggregates, divide the totals so larger calls carry their actual weight. The thread display requires complete cache accounting. |
| Cache savings | `input tokens × ordinary input rate / 1,000,000 − input cost` summed over fully priced calls. The baseline treats the same input as ordinary fresh input. |
| Total tokens | Input plus output. Cached reads and writes are input categories, and thinking is part of output. |

For example, with 10,000 input tokens (8,000 cache reads, zero writes) and 500 output tokens, sample rates of $2 fresh input, $0.50 cache reads and $8 output per million give $0.008 input cost and $0.004 output cost. The call estimate is $0.012, cached share is 80%, and cache savings are $0.012 against the $0.020 ordinary-input baseline. These are illustrative rates. Use the shown call rates, model, tier, full input size and timestamp for real data.

## Efficiency comparisons

The expandable KPI strip has Thread and Comp rows, ordered Context/call, Cost/call, Compaction payback. The always-visible “Compare with” selector shares its header and defaults to the last seven UTC calendar days, with 30 days and all history available. Thread deltas divide the displayed Thread average by the displayed Comp average. Comp includes all chats in the selected period, including this thread; its deltas compare against the immediately preceding equal-length period. All history has no preceding period and omits Comp deltas. Both cost metrics use spending-change badges because differences in models, effort and work can affect the aggregates. Zero or absent references produce no delta. Asterisks indicate fewer than 20 priced calls in either population, incomplete pricing, or incomplete import.

Context/call is monetary input-processing cost, not token volume. The expanded guide contains the three definitions, formulas and numeric substitutions, compaction net savings to date and concise comparison/asterisk notes. Exact numerators and averages remain in tooltips. Payback displays the fraction and percentage, such as 1/2 (50%), with pending counts shown only in the expanded compaction details. Active valid events count immediately at break-even. Pending events are excluded until break-even or completion; ending a session can therefore change the denominator. Missing values display a dash.

Spending comparisons use only the displayed aggregate KPI values. They require at least 20 current and reference priced calls, complete pricing coverage, completed import and compatible pricing metadata. Green means at least 10% below reference; amber above +10%; red above +30%. Provisional comparisons remain neutral. Compaction payback requires at least five evaluable epochs; zero net savings is neutral, negative savings is red, and positive savings uses the 50%/80% payback boundaries. Valid active epochs count at break-even.

Threshold settings validate ordered boundaries, support reset, and persist locally with separate DEV/release keys. Blocked storage keeps preferences in memory. Capacity warnings remain amber at 85% and red at 95%.

## Pricing catalog

The standalone [pricing.json](../../pricing.json) contains OpenAI's published flagship text-token pricing and GPT-5.3-Codex, covering all models in Token Monitor's bundled table. Token Monitor starts with the last validated local copy, with the bundled catalog available offline. The MCP server checks the public catalog in the background at startup, when the monitor opens, and when the selected thread uses an unknown model. Checks share a five-minute cooldown. Failed checks keep the last good catalog. Catalog rates are in USD per million tokens, with separate entries for each published tier, input-size band, and cache-write duration. Missing entries indicate unavailable prices. The long-context band starts above the specified token count and applies to the full request.

Each model lists complete schedules in chronological order. For a rate change, append a schedule with the new effective date and retain earlier schedules. Use an ISO 8601 timestamp with an offset when the source specifies a time or time zone. Date-only values take effect at midnight UTC. `published-start` identifies a documented start and `verified-baseline` starts coverage on the verification date when the full schedule's historical start is unknown. Calls use the schedule in effect at their recorded time. Calls earlier than the first covered date keep their token counts, with costs unavailable. A cache write with no recorded duration uses the 30-minute rate. A missing required rate leaves the affected calculation unavailable.

The GPT-6.2 Ultrafast rates switch at midnight Pacific time on March 1, 2027. GPT-5.6 Sol's published promotional window runs through November 30, 2026. A successor schedule is required to establish pricing from December 1 onward. [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) · [OpenAI API changelog](https://developers.openai.com/api/docs/changelog#november-2026)

## Source and tests

[Implementation](../../plugins/token-monitor-embedded/server/src/efficiency.ts) · [Regression tests](../../plugins/token-monitor-embedded/tests/efficiency.test.mjs) · [Documentation index](../index.md)
