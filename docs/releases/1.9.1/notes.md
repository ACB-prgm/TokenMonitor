# TokenMonitor 1.9.1 release notes

- Display Context / call and Cost / call with exactly four decimal places in the Thread and Comp rows and expanded calculation results.
- Fix gray KPI percentage badges overriding their assigned colors. Increases above 10% are amber, increases above 30% are red, and decreases of at least 10% are green. Provisional comparisons remain neutral.

This release provides macOS Apple silicon, Windows x64 and Windows ARM64 packages. Intel macOS and Linux packages are not included.

Existing local release installations can use **Update and install** in Settings → About. For manual installation, use the complete `token-monitor-1.9.1-TARGET.zip` and matching checksum, following the [installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/guides/installation.md). Restart Codex after installation and review hook trust if prompted. Account and Git installations retain their original update mechanism.

See the [validation record](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/releases/1.9.1/validation.md). Automated package checks are separate from trusted desktop rendering and lifecycle delivery; Windows desktop interaction remains unverified locally.
