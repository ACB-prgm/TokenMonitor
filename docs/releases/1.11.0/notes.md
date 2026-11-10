# TokenMonitor 1.11.0

- Account for verified recorded compaction usage, disclose remaining estimates, and show separate gray compaction bars with break-even markers.
- Keep spending comparisons in the KPI container and focus insights on context capacity and evidence-backed compaction guidance.
- Share live app-bridge account usage and add persistent Off, Current thread and All threads continuation settings for confirmed usage-limit interruptions.
- Harden continuation capacity checks, atomic scope changes, offline revocation, uncertain delivery and restart recovery.
- Count valid active compactions at break-even and retain recovery checks beyond the visible chart window.
- Consolidate documentation into canonical guides, references and release records with checked navigation.

Automatic continuation is off by default. Enable **Continue after reset** in Settings for the current thread or all local threads. It only resumes a confirmed usage-limit interruption after fresh capacity and target checks. Keep Codex running and the computer awake. Ambiguous dispatches are not automatically retried. The app bridge is private and may change.

This release provides macOS Apple silicon, Windows x64 and Windows ARM64 packages. Intel macOS and Linux packages are not included.

Existing local release installations can use **Update and install** in Settings → About. For manual installation, use `token-monitor-1.11.0-TARGET.zip` and its matching checksum, following the [installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/guides/installation.md). Restart Codex and review hook trust if prompted. Account and Git installations retain their original update mechanism.

See the [validation record](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/releases/1.11.0/validation.md). Automated checks and read-only DEV smoke checks do not establish live capped-work recovery, full desktop restart acceptance, or Windows desktop interaction; these remain unverified. The sustained usage-source comparison across a reset also remains incomplete.
