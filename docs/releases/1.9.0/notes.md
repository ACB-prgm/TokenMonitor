# TokenMonitor 1.9.0 release notes

A redesigned dashboard and durable local history make thread usage and historical efficiency easier to inspect.

- Consolidate context, allowances and spending into Thread Usage, with compact expandable efficiency KPIs, responsive layouts, accessible controls and consistent health colors.
- Search local threads, include archived chats, rescan discovery, and inspect loaded skills and labeled tool calls.
- Compare context/call, cost/call and compaction payback with model/effort-matched local history over seven days, 30 days or all history. Coverage, calculation details and provisional results remain visible.
- Show conservative turn-based compaction guidance only when observed evidence supports it. Disclose forecast sources and sample counts, and distinguish age-based cache warmth from recorded cache hits.
- Store numeric history locally in SQLite, collecting incrementally through existing hooks without an open panel. Retain 90 days of numeric detail and permanent daily summaries, preserve saved chats after source loss, migrate legacy history, and reprice compatible retained data.
- Inspect history storage, retention, import backlog and calculation-version coverage on demand. Transcript sources stay read-only; durable history does not retain prompts, responses, tool arguments or reasoning text.

See the [validation record](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/releases/1.9.0/validation.md), [history documentation](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/reference/efficiency-metrics.md), and [dashboard details](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/reference/dashboard.md). Automated package validation is separate from trusted desktop rendering and lifecycle delivery; Windows desktop interaction remains unverified locally.

This release provides macOS Apple silicon, Windows x64 and Windows ARM64 packages. Intel macOS and Linux packages are not included.

Existing local release installations can use **Update and install** in Settings → About after publication. For manual installation, use the complete `token-monitor-1.9.0-TARGET.zip` and matching checksum, following the [installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/guides/installation.md). Restart Codex after installation and review hook trust if prompted. Account and Git installations retain their original update mechanism.
