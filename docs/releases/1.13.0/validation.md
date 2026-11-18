# TokenMonitor 1.13.0 validation

Automated regressions cover the standalone analytics entry, historical filtering, model ranking and effort totals, comparable thread rankings, and category cost persistence and reconciliation. An isolated installed DEV smoke check exercised the MCP analytics entry and calls with imported history.

The bundled dashboard preview verified light and dark rendering, scale persistence, card reflow, chart resizing, effort filtering and horizontal fit at desktop and 320 px widths. The analytics changes were also exercised in the local DEV deployment.

The protected-main CI and tagged-release workflow run native package, installation, update, rollback and hook-discovery checks on macOS Apple silicon, Windows x64 and Windows ARM64. The release workflow verifies the source identity and SHA-256 checksums for all six ZIPs. [GitHub Actions](https://github.com/ACB-prgm/TokenMonitor/actions)

Desktop rendering and trusted hook delivery for the distributed packages require separate verification on the installed Codex host.
