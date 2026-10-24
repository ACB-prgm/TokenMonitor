# TokenMonitor 1.7.0

Update TokenMonitor directly from its version menu.

- Replace **Download Update** and **Download SHA-256** with **Update and install**.
- Download the native platform package, verify its checksum and inventory, and install through the existing Codex CLI flow.
- Show download, verification, preparation, installation, completion, and retry states while monitoring remains responsive.
- Run installation in a separate bundled Node process, retain previous release sources for rollback, and prevent competing updates across panels.
- Reject incompatible packages, unsafe archive paths, substituted download URLs, and checksum failures before installation changes.

In-panel installation supports existing local release marketplace installations and requires the Codex CLI. Account and Git installations continue to use their original update mechanism; the updater does not create a duplicate installation. Restart Codex after installation and review hook trust if prompted.

For first installation or updating an older version without this button, use the complete `token-monitor-1.7.0-TARGET.zip` and its checksum from this release and follow the [installation instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/INSTALL.md). The new button becomes available after loading 1.7.0.

All four native packages are built and verified by the release workflow. Desktop rendering and trusted lifecycle delivery remain separate checks; Windows desktop interaction has not been confirmed locally.
