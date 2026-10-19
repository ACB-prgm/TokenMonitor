# TokenMonitor submission materials

**Deprecated, 2026-10-19:** These native-app submission materials are historical. Use [TokenMonitor Embedded](https://chatgpt.com/plugins/Plugin_df57c7c0b9d08191936d851916050a02) and `EMBEDDED-PRIVATE-RELEASE.md` for the supported release. Do not submit or recommend this native package for new installations.

This is a skills-only plugin for local Codex desktop, Apple silicon, macOS 13+. It includes an independent native app and explicit setup/maintenance skill. No MCP configuration is submitted.

Publisher name in the local package is a non-verified development label until the owner supplies the exact verified publishing identity. Before portal submission, set manifest author.name and interface.developerName to that identity and rebuild. No publisher credentials, identity verification, attestations, submission, or publication are performed by packaging.

Upload token-monitor-<version>.zip through Skills only. The ZIP contains the setup skill and native executable assets. It meets the documented structural limits; acceptance of those executables is subject to security scanning and review. Do not label it approved based on local tests. Skills-only submissions omit interface.screenshots, apps, and MCP fields.

Sources checked: https://developers.openai.com/plugins/deploy/submission and https://developers.openai.com/plugins/deploy/submission-errors . The latter specifies a 100 MB ZIP limit, a manifest and at least one valid skill, security scans, and verified publisher identity. It lists website/support/privacy/terms URLs as optional for skills-only ZIPs; supply real owned URLs when ready rather than inventing them. No public website or contact address has been created by this project.
