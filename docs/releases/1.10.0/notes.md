# TokenMonitor 1.10.0 release notes

- Add a **KPIs** tab to Recent calls with smooth Context / call and Cost / call USD trends, without data dots. Each point represents the running thread average through that call, including earlier calls outside the visible window. Cost / call includes compaction charges; the Cost tab retains its call cost bars.
- Show compaction progress in the context ring.
- Preserve queued history updates from concurrent panels and refresh saved history metadata independently of transcript changes.
- Preserve saved thread titles when catalogue metadata is unavailable.
- Avoid repeated remainder copies when reading JSONL records.

This release provides macOS Apple silicon, Windows x64 and Windows ARM64 packages. Intel macOS and Linux packages are not included.

Existing local release installations can use **Update and install** in Settings → About. For manual installation, use the complete `token-monitor-1.10.0-TARGET.zip` and matching checksum, following the [installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/guides/installation.md). Restart Codex after installation and review hook trust if prompted. Account and Git installations retain their original update mechanism.

See the [validation record](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/releases/1.10.0/validation.md). Automated package checks are separate from trusted desktop rendering and lifecycle delivery; Windows desktop interaction remains unverified locally.
