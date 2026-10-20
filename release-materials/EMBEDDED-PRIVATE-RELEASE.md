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

## Confirmed migration and native deprecation — 2026-10-19

The owner confirmed successful plugin hook discovery after uninstall/reinstall,
and embedded execution on remote machines without a separate monitoring SSH setup.
Remote capability no longer needs a separate SSH implementation for this workflow.

Uninstalled the local `token-monitor@personal` plugin using Codex's uninstall tool.
The installed native app's own `--uninstall` removed the companion app, launch
agent, launcher and six owned personal hooks. Verified all three installed paths
are absent and the six user hook arrays are empty. State and preferences were
retained. This cleanup is verified on the local Mac only; remote native installs
and dedicated SSH credentials were not modified.

Marked the older account plugin `Plugin_8278deeb4afc81918745eed8e7110074` deprecated
in version 1.1.1, release `pluginrel_6ad6a9a535748191986cb76b3ea24410`. Its listing
directs users to Embedded; its maintenance skill defaults to migration/removal.
Existing native executable assets remain available for legacy maintenance.
The source native listing and submission materials are also marked deprecated.

The logo problem remains unresolved in host presentation. Both Embedded and
JobHunter have correct installed assets but null catalog image URLs. See
`LOGO-DIAGNOSIS.md` for reproducible evidence and the catalog repair point.

## 0.3.3 — selected-thread allowance estimates

Published to the same private workspace plugin on 2026-10-19.
Release: `pluginrel_6ad6d4e495a081918b0d25a67f36ff42`.

Adds 5-hour and weekly (7-day) estimates beneath selected-thread API-equivalent
cost, using the owner's fixed multipliers of 12.9 and 2.1 percentage points per
USD. Full recorded thread cost is used across resets; partial coverage is marked,
unknown pricing stays unknown, and estimates are not capped at 100%.

Production build, type checking, all 26 Node tests, offline archive startup and
six-hook host discovery pass. The bundled browser fixture shows both estimates.
Before upload, verified every package inventory hash, no file removals, and
unchanged manifest metadata/MCP configuration apart from the version bump.
Runtime, hooks, launch script, notices and assets have identical hashes to 0.3.2.
Account readback confirms version 0.3.3 and the estimate row/multipliers in both
panel and inline-summary HTML. Audience remains WORKSPACE / PRIVATE.
Existing running host connections may retain 0.3.2 until the installed plugin
updates and a fresh chat loads the new connection; that host refresh was not
performed as part of this release.

## 0.3.4 — latest-call readability

Published to the same private workspace plugin on 2026-10-19.
Release: `pluginrel_6ad6d740eed88191b009e7bf69c5dd9b`.

Deploys commits `21568b6` and `103fefe`: larger latest-call bar text at normal
and narrow widths, and “Fresh Input” in the composition legend.

Production build, type checking, all 26 Node tests, offline archive startup and
six-hook discovery pass. Verified all package inventory hashes, no removals,
and preserved manifest metadata/MCP configuration apart from version 0.3.4.
Only manifest, README, validation notes and panel/summary HTML changed from
0.3.3; runtime, hooks, server, launch script, notices and assets match exactly.
Account readback confirms 0.3.4, the matching release inventory and configuration,
and both new font sizes plus the Fresh Input label in the deployed panel HTML.
Audience remains WORKSPACE / PRIVATE. Installed-host refresh/rendering was not
verified; update the installed plugin and open a fresh chat to load the new UI.

## 0.3.5 — latest call placement and lock removal

Published to the same private workspace plugin on 2026-10-19.
Release: `pluginrel_6ad6e9eb81fc819180762cf46c3182de`.

Deploys `ed24035`: Latest call now sits between Thread usage and Recent calls.
Removed embedded locking from the task picker, status/help text, panel state and
MCP action schema. Manual task inspection and per-chat automatic following remain.
Release metadata and UI/resource versions are synchronized in `34caf0f`.

Production build, type checking, all 26 Node tests, extracted offline archive
startup and six-hook discovery pass. Visually checked the production panel in
the local browser fixture. Verified every package inventory hash, no removals,
and unchanged manifest metadata/MCP configuration except the version bump.
Runtime, hooks, startup hook, launcher, notices and assets match 0.3.4.

Account readback confirms version 0.3.5, release ID, complete file inventory,
matching manifest, MCP configuration and release inventory. Deployed panel HTML
contains 0.3.5 and no retired lock status/help text. Audience remains WORKSPACE /
PRIVATE. Existing running host connections may retain the previous UI until the
installed plugin updates and a fresh chat loads its connection; installed-host
refresh/rendering was not performed as part of this release.
