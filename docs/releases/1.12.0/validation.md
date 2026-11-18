# TokenMonitor 1.12.0 validation

The pricing regression tests cover offline startup, conditional refresh, invalid responses and concurrent refresh triggers. They also cover changes to live and historical estimates, effective-date and context boundaries, missing rates, promotion expiry and estimates with missing transcripts.

The bundled panel preview was exercised at 320, 380, 600 and 760 px in light and dark themes, including every display scale at 320 px. Checks included button and icon dimensions, thread-picker fit, keyboard focus, and the update highlight before and after dismissal.

The protected-main CI and annotated-tag release workflow run package, install, update, rollback and hook-discovery checks on macOS Apple silicon, Windows x64 and Windows ARM64. The release workflow checks that all six ZIPs and their SHA-256 files identify the same tagged main commit. [GitHub Actions](https://github.com/ACB-prgm/TokenMonitor/actions)

The bundled preview and isolated package checks leave installed Codex desktop rendering, restart behavior and trusted lifecycle event delivery unverified.
