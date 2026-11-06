# Compaction

Compaction Value (CV) is an integer from 0 to 100: projected net savings as a percentage of avoidable context-processing costs. These are API-equivalent estimates, not subscription charges or invoices. A high score does not guarantee that compaction preserves useful details, and is not an instruction to compact.

The forecast compares the same 20 future normal model calls with and without compaction. Twenty calls gives a fixed, interpretable planning horizon; it is not a prediction of how many calls remain in the task. The compacted path starts at an assumed 40,000 tokens, a fixed retained-context estimate rather than a measurement or guarantee. Internal defaults live in `COMPACTION_DEFAULTS` in the server's `metrics.ts`; V2 adds no user settings.

## Thread observations

Context growth uses the arithmetic mean of the latest 20 valid consecutive input-token deltas once the current context segment has 20 intervals (21 calls). Before that threshold, it uses the user’s recent same-model average, provided at least 20 personal intervals are available. Without sufficient personal history, it uses a 2,000-token default. Observed averages have no positive minimum or upper clamp. Genuine zero growth and large positive tool-result growth count. Compaction, model changes and negative deltas start new segments. Invalid call records break continuity; replayed records do not create calls. Cumulative usage is never used as per-call growth.

Typical output uses the median of the latest 20 valid recorded per-call output totals, including billed reasoning. Even sample counts average the two middle values. Actual zero-output calls count; missing output does not. At least three active-model samples are preferred; otherwise retained thread samples are used. The forecast applies a 1,000-token minimum or a 3,000-token default with fewer than three samples. Output history can span compaction; context-growth history cannot. Diagnostics show observed values, sample counts, applied minima, defaults and output sample selection.

Thread estimates use bounded observations from the selected thread. The parser keeps at most 120 calls and up to 500 numeric personal-growth intervals, using existing deduplication. The personal average pools the most recent 500 same-model intervals from validated main-chat transcripts, including archived chats and the current thread. Subagents and review-agent transcripts are excluded, and inherited duplicate intervals count once. History discovery covers the selected chat and up to 100 recent catalogue entries; each file read is limited to its latest 4 MiB, discarding partial lines and intervals whose model is unknown. History is cached for five seconds and unchanged files are not reparsed. This is a bounded local-history estimate, not a claim of complete account history. No transcript text is retained by the history cache. The panel identifies default, personal and thread estimates and shows the current segment’s interval count. Forecasts are unavailable during compaction and until the first reliable normal call afterward.

## Pricing and accounting

All prices come from the existing `rates()` function using the latest recorded call's model, service tier and regional-processing flag. A missing or automatic tier assumes Standard and is disclosed. Unknown pricing or unavailable replacement cache-write pricing makes CV unavailable. Unknown context capacity remains unknown.

Each projected call is priced independently at its complete projected input size. For GPT-6.1 Sol Standard, input above 272,000 tokens doubles fresh, cached and cache-write rates and multiplies output rates by 1.5. Exactly 272,000 remains short-context pricing. This threshold is a pricing boundary, separate from the reported context window. Other supported models and tiers use their existing rate rules.

For zero-based call index `j`, original input is `currentInput + j × growth`, and compacted input is `40000 + j × growth`. Both paths assume warm-prefix reuse, pricing projected normal context reads at cached-input rates. This approximation does not separately forecast fresh-token writes on every future interaction.

The explicit two-path accounting is:

- Path A pays all 20 normal context reads and normal outputs.
- Path B pays a cached read of the original context for the compaction pass, plus 3,600 compaction output tokens at the original context's output rate. It writes the initial 40,000-token replacement once at the replacement context's cache-write rate. Its first normal call does not also pay a read or fresh-input charge for those replacement tokens. Calls 2–20 pay compacted context reads. All 20 normal outputs use the compacted context's applicable output rates.

The original read during compaction therefore cancels the first original normal read in Path A. Incremental overhead is the compaction output plus the replacement write. Gross savings compares the paths before that overhead; net savings subtracts it. Common normal output costs cancel except for differences caused by long-context pricing.

The avoidable-cost denominator is original context reads for calls 2–20, plus any positive normal-output rate difference across the two paths. It excludes the shared first original read and normal output costs common to both paths. CV is `round(100 × clamp(netSavings / avoidableCost, 0, 1))`. Valid contexts at or below 40K score zero. Negative net savings remain visible in dollars and score zero. No extra bonus is assigned near a pricing threshold.

Break-even is the first normal call where cumulative savings meet or exceed the same overhead. If that never occurs in the forecast, the panel shows **>20 calls**. It does not extrapolate a precise payoff beyond the horizon. Classification follows the rounded score: 0 = no projected economic benefit; 1–20 = Low; 21–40 = Moderate; 41–60 = High; 61–80 = Very high; 81–100 = Exceptional.

If either input path exceeds the reported context window, simulation stops before that impossible call. The panel reports how many calls fit and makes the full-horizon score and break-even unavailable. Capacity pressure does not become a financial score. Full precision is retained internally and dollars are rounded only for display.

## Cache and operational limits

Warm, Uncertain and Presumed cold cache states remain separate diagnostics. Cache age and the ordinary fraction of newly added uncached tokens do not multiply CV. A complete cache miss can affect both paths; actual future misses may change realized savings.

This forecast makes no model calls, triggers no compaction, modifies no conversations, adds no network requests, and persists no new transcript data. Existing UI refresh and thread-selection behavior is unchanged. Deterministic dollar fixtures, rolling-estimate tests, parser parity, MCP integration and compact/expanded rendering tests cover the calculation and display.

## Historical payback


The compacted path uses recorded subsequent call categories and output. The alternative retains the removed context as an additional warm prefix, priced under each subsequent call's model, tier, region and input-size band. Reported retained context is used when available; otherwise 40,000 tokens is assumed. Charges estimate a warm read of the original context, 3,600 summary output tokens, and a replacement write. Replacement writes recorded on the first subsequent normal call are credited against the estimate once. These modeled charges are disclosed separately from recorded normal-call costs.

An epoch is profitable when cumulative estimated savings first reach its overhead. Valid active epochs count as paid back immediately at that point; active epochs that have not reached break-even remain pending and excluded until closure. The details expose first break-even call and net savings to date, which can differ from the earlier break-even result. Invalid counterfactuals, unavailable pricing/accounting, and context-capacity violations exclude an epoch from the denominator. A complete compaction with no subsequent calls is unprofitable when its overhead can be priced.

The next compaction, an explicit SessionEnd, or seven days without recorded activity closes an epoch. A response ending does not close it. Inactivity closure is labeled and counted; resumed activity replays and recalculates the final epoch. Period payback uses the compaction date for active paid-back epochs and the completion date for closed epochs, while spending counts charge dates. Epochs continue accumulating savings and validating counterfactuals after break-even; later invalid evidence excludes the outcome. No evaluable outcomes means N/A.


## Recommendations and cache warmth


The existing inline Efficiency Insights disclosure can recommend compaction when conservative projected future payback turns are no greater than completed turns in this epoch (since the last compaction, or chat creation). Capacity and negative completed-compaction findings retain priority. The expanded recommendation distinguishes continuing work that needs this chat’s context from unrelated work better started in a new chat; it never infers context relevance automatically.

Turn tracking uses explicit lifecycle IDs/completion evidence and user-message boundaries; model/tool calls do not independently create user turns. Aborted, incomplete, duplicate, ambiguous and mixed-model turns do not enter calls-per-turn aggregates. A completed turn spanning compaction may contribute to the lifetime same-model mean but is excluded from the new epoch count. Numeric aggregates are cached under analytics format v4, replayed through the existing history scan without retaining prompt/response text. Existing cost, token and compaction accounting remains unchanged.

This chat needs at least five qualifying same-model turns, or other chats need twenty. If both qualify, use the smaller mean, multiply calls/turn by 0.75, then round projected break-even calls divided by that value upward. This conservative buffer is a heuristic, not a confidence interval. The banner requires observed growth/output, known context capacity and pricing, positive net savings of at least $0.000001, and break-even within the existing forecast horizon. It is suppressed during import, disconnected/unavailable/ended telemetry, calls older than two hours, compaction/post-compaction waiting, or an unrecovered/unsynchronized latest compaction. Insufficient evidence never generates an action recommendation. Source means, sample counts, conversion and assumptions are inspectable in details.

The existing Cached % / Cache savings row now centers a focusable warmth label: green Warm (<30 minutes), amber Uncertain (30–120 minutes inclusive), red Presumed cold (>120 minutes), muted Unknown when unavailable. Invalid/future call times are unknown. Warmth estimates age-based availability and does not establish a cache hit/miss; Cached % still measures recorded cache reads. Hover/focus reveals the explanation and call age; Escape dismisses it without moving focus.

## Source and tests

[Implementation](../../plugins/token-monitor-embedded/server/src/metrics.ts) · [Regression tests](../../plugins/token-monitor-embedded/tests/compaction.test.mjs) · [Documentation index](../index.md)
