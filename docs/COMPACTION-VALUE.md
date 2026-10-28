# Compaction Value V2

Compaction Value (CV) is an integer from 0 to 100: projected net savings as a percentage of avoidable context-processing costs. These are API-equivalent estimates, not subscription charges or invoices. A high score does not guarantee that compaction preserves useful details, and is not an instruction to compact.

The forecast compares the same 20 future normal model calls with and without compaction. Twenty calls gives a fixed, interpretable planning horizon; it is not a prediction of how many calls remain in the task. The compacted path starts at an assumed 40,000 tokens, a fixed retained-context estimate rather than a measurement or guarantee. Internal defaults live in `COMPACTION_DEFAULTS` in the server's `metrics.ts`; V2 adds no user settings.

## Thread observations

Context growth uses the arithmetic mean of the latest 20 valid consecutive input-token deltas in the current context segment, with a 2,000-token minimum. Fewer than three intervals uses a 2,000-token default. Genuine zero growth and large positive tool-result growth count. Compaction, model changes and negative deltas start new segments. Invalid call records break continuity; replayed records do not create calls. Cumulative usage is never used as per-call growth.

Typical output uses the median of the latest 20 valid recorded per-call output totals, including billed reasoning. Even sample counts average the two middle values. Actual zero-output calls count; missing output does not. At least three active-model samples are preferred; otherwise retained thread samples are used. The forecast applies a 1,000-token minimum or a 3,000-token default with fewer than three samples. Output history can span compaction; context-growth history cannot. Diagnostics show observed values, sample counts, applied minima, defaults and output sample selection.

Both estimates use bounded observations from the selected thread only. The parser keeps at most 120 calls and uses existing deduplication. Forecasts are unavailable during compaction and until the first reliable normal call afterward.

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
