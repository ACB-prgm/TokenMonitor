# Validation scope

Version 1.8.1 contains audit fixes for task selection, unknown cache readings, telemetry parsing, keyboard previews, allowance shutdown, update response cleanup, and vulnerable dependencies. Automated tests compare captured reference scenarios and cover pricing, attribution, compaction forecasts, activity association and bounds, missing data, call replay, incremental files, SQLite contention, concurrent hooks, Windows path rules and MCP Apps integration.

The package test exercises the native bundled runtime with developer tools removed from PATH, first-prompt and lifecycle hooks, checksum repair, direct tools, UI-only metrics and clean shutdown. Foreign-architecture packages are inspected for correct binaries, launchers, hashes and metadata; executing them requires the matching OS and processor.

The maintainer authorized deployment and publication of 1.8.1. Release-specific results are recorded in the repository's `docs/VALIDATION-1.8.1.md`; automated checks and native platform CI must complete before publication. Windows desktop interaction requires separate verification. Hook discovery alone does not confirm trusted hook delivery or desktop rendering.
