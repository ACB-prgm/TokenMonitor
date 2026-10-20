# Validation scope

Version 1.4.0 migrates telemetry collection into the MCP server. Automated tests compare six captured reference scenarios and cover pricing, attribution, compaction, missing data, call replay, incremental files, SQLite contention, concurrent hooks, Windows path rules and MCP Apps integration.

The package test exercises the native bundled runtime with developer tools removed from PATH, first-prompt and lifecycle hooks, checksum repair, direct tools, UI-only metrics and clean shutdown. Foreign-architecture packages are inspected for correct binaries, launchers, hashes and metadata; executing them requires the matching OS and processor.

Private Mac user confirmation is required before pushing these changes. Windows desktop testing is separate and remains pending. Public GitHub releases are held until that testing. Hook discovery alone does not confirm trusted hook delivery or desktop rendering.
