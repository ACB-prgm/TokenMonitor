# TokenMonitor 1.8.0

A model-priced compaction forecast, smoother call previews, and fresher account allowances.

- Replace the old compaction heuristic and separate payoff estimate with one numeric 0–100 Compaction Value and a consistent break-even calculation over 20 calls. Use rolling thread growth/output estimates, active-model pricing, compaction overhead, and per-call long-context rates. Show assumptions and capacity limitations.
- Keep recent-call details mounted when moving between columns. Previews appear immediately, wait 200 ms before hiding, and fade/collapse over 140 ms. Re-entry cancels dismissal; focus, pinning, Escape, and reduced-motion preferences remain supported.
- Refresh five-hour and weekly allowances from the signed-in Codex account through the installed CLI, with the newest valid local catalogue telemetry as fallback. Select each window independently and show “Awaiting refresh” when its reported reset has passed.
- Keep allowance source, observation time, and stale status in hover help, without an extra status row.

Account reads require the installed Codex CLI and existing authentication. They can use the network, but do not create logins or model turns. Local fallback covers bounded suffixes of validated catalogue transcripts and may be incomplete. Thread metrics remain tied to the selected chat. Compaction forecasts are API-equivalent financial estimates, not subscription charges or guarantees of context preservation.

The maintainer verified the updated panel locally on macOS. The release workflow builds and checks all four native packages; Windows desktop rendering and trusted lifecycle delivery remain separate from automated package validation.

Existing local release installations can use **Update and install** once this candidate is published. For manual installation, use the complete `token-monitor-1.8.0-TARGET.zip` and matching checksum, following the [installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/INSTALL.md). Restart Codex after installation and review hook trust if prompted.
