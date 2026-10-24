# TokenMonitor 1.6.0

Inspect recent calls with themed, persistent details and a compact Activity section.

- Hover a bar to preview its details. Click to pin them, then click the same bar again to clear. Keyboard selection and Escape are supported.
- Remove the duplicate bar tooltip and match the detail card to the panel theme.
- Show a bounded assistant response excerpt, tool requests with short command details, and file targets from explicit edit requests. Calls without visible activity show an empty-state message. File targets do not prove a successful edit; shell-created files are not inferred.
- Set latest-call normal text to 12px at the default scale.
- Recalibrate compaction value labels: Very High at six or fewer break-even calls, High at seven to eight, Medium at nine to twelve, Low at thirteen to twenty, and Very Low above twenty or without estimated savings. The underlying estimate is unchanged.
- Add an isolated Token Monitor DEV build/install workflow for local testing alongside the release plugin.

Activity is associated with the next accepted usage event and may be absent for continuation calls. Excerpts are limited to 600 characters, six tool requests, and eight file targets; user prompts, reasoning, and tool results are excluded. This view does not navigate to a location in the chat.

Download the complete `token-monitor-1.6.0-TARGET.zip` and its `.sha256` companion, verify before extracting, and follow the [installation/update instructions](https://github.com/ACB-prgm/TokenMonitor/blob/main/docs/INSTALL.md). Plugin-only ZIPs remain available for existing direct/account deployments. Packages include pinned Node runtimes. Restart Codex after updating and review hook trust if prompted.

The release workflow builds and validates all four native platform packages. Desktop rendering and trusted lifecycle delivery remain separate checks; Windows desktop interaction has not been confirmed locally.
