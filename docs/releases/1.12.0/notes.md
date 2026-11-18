# TokenMonitor 1.12.0

- Refresh the public OpenAI pricing catalog in the background and use the last validated copy offline. Future changes to the catalog can reach TokenMonitor without a plugin update.
- Use the rates in effect when each call or compaction ran, including published tiers, long-context bands, regional uplifts and promotion end dates. Keep token counts visible when a rate is unavailable.
- Recalculate estimates from readable transcripts after a rate change. Preserve saved estimates when the source is missing and mark affected comparisons as provisional.
- Standardize the header controls and highlight the entire Settings button in orange when an update is available.

Packages are available for macOS Apple silicon, Windows x64 and Windows ARM64. Existing local installations can use **Update and install** in Settings → About. For manual installation, use the matching `token-monitor-1.12.0-TARGET.zip` and SHA-256 file. Restart Codex after installation and review hook trust if prompted. [Installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/guides/installation.md)

[Validation record](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/releases/1.12.0/validation.md)
