# TokenMonitor 1.7.0 validation

The maintainer authorized deployment, promotion to main, public release, and local installation on October 24, 2026.

- TypeScript typecheck and build, 118 plugin tests, and two isolated DEV workflow tests passed for the update feature.
- Tests cover checksum and inventory failures, unsafe paths and redirects, incompatible platforms, unsupported installation sources, interrupted workers, concurrent starts, rollback, and progress during unchanged telemetry polls.
- Browser checks cover the install action, removal of separate download buttons, busy/completion/retry states, and narrow light/dark layouts. The narrow dark menu was visually inspected.
- The native macOS ARM64 package passed runtime startup, checksum repair, MCP, clean installation, the in-panel download/extraction/installation pipeline, rollback, hook discovery, and user-state retention in disposable Codex profiles. Network responses in installation tests use package fixtures; verification and Codex operations are real.
- The protected-branch CI and annotated-tag release workflows rerun native validation on macOS ARM64/Intel and Windows ARM64/x64 before publication.

In-panel updates require an existing local release marketplace installation. Account and Git installations retain their original update mechanism. Installation never changes hook trust. Windows desktop rendering and trusted lifecycle delivery remain unverified locally.
