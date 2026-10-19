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

## 0.3.2 — command-hook discovery repair

Updated the same account plugin on 2026-10-19.
Release: `pluginrel_6ad6a4d1d9048191a4aeaab2fd28ec5d`.

Codex 0.163.0-alpha.10.2 silently suppresses plugin command hooks when the root
Agent Plugins manifest is selected. A controlled comparison discovered six hooks
from the legacy format and none from an otherwise equivalent portable package.
The account update explicitly deleted root `plugin.json` and `mcp.json` and retained
`.codex-plugin/plugin.json`, `.mcp.json`, and the six hooks. Account readback
confirmed both root files are absent. Account installation requires no marketplace.

Added `scripts/test_embedded_hook_discovery.py`, which reads the actual release
manifest/hooks into a temporary Codex home and checks app-server `hooks/list`.
All six are reported with `source=plugin` and `trustStatus=untrusted`; no hook
commands execute and no user trust state is modified. Production build, type
checking, all 22 Node tests, offline archive validation and host discovery pass.
Users must receive version 0.3.2 and review/trust the plugin's hooks. Live account
installation refresh and logo rendering remain separate from this validation.
