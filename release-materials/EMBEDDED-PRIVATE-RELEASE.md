# TokenMonitor Embedded private account release

Created 2026-10-19 with Plugin Creator from `dist/token-monitor-embedded-0.3.1.zip`.

- Plugin: `Plugin_df57c7c0b9d08191936d851916050a02`
- Release: `pluginrel_6ad69b34b2d0819181aa590e6bc156f3`
- Scope: WORKSPACE; visibility: PRIVATE
- Link: https://chatgpt.com/plugins/Plugin_df57c7c0b9d08191936d851916050a02
- Source package version: 0.3.1

Account readback confirmed the portable stdio MCP server, six hooks, original
TokenMonitor icon, collector, compressed Node runtime and embedded UI are retained.
Plugin Creator normalized author/developer metadata to the authenticated creator;
stored manifest bytes therefore differ from the source archive inventory hashes.

Build, type checking, 22 Node tests and the extracted offline archive regression
passed. The archive test also verifies cold/warm startup, private cache permissions,
corruption recovery and PLUGIN_DATA precedence. Individual runtime upload limits
required compressing Node; the launcher verifies SHA-256 before execution.

Installation, host rendering, sharing controls and remote-chat execution on the
Mac Studio have not yet been verified. Use the same workspace on that Mac. Disable
the development-marketplace copy before enabling the account copy on a machine,
review/trust its hooks, and test in a fresh chat. Do not remove the existing working
installation until the replacement is available. No public submission or audience
expansion was performed.

For future account changes, update this exact plugin ID rather than creating a
second account plugin. Read its current release first and use guarded updates.
