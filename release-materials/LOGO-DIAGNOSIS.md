# Account catalog logo diagnosis — 2026-10-19

## Finding

Both TokenMonitor Embedded and JobHunter have packaged images and correct
`interface.logo` / `interface.composerIcon` references in their installed manifests.
The account catalog returns null for **all** logo and composer-icon fields for
both plugins. This supports a shared catalog asset-registration problem rather
than an outdated cached image. It does not identify the server-side root cause.

Official requirements: https://developers.openai.com/plugins/deploy/submission#icons-and-screenshots
The required fields point to included images using `./`-prefixed plugin-relative
paths. Naming an image `icon.png` without those references is insufficient.

## Evidence

- TokenMonitor Embedded: `Plugin_df57c7c0b9d08191936d851916050a02`, version 0.3.2,
  release `pluginrel_6ad6a4d1d9048191a4aeaab2fd28ec5d`.
  Account source readback and installed `.codex-plugin/plugin.json` both reference
  `./assets/icon.png` for `logo` and `composerIcon`. The installed image exists;
  SHA-256 is `11317283d5e84c6edb3bfab718712cb1e24cfa7bf2b92ea853a27b8d6c81222f`.
- JobHunter: `Plugin_4f6982fc7c388191aac83350b4879bca`, installed version 0.2.1.
  Installed `.codex-plugin/plugin.json` references `./assets/jobhunter.png` for
  both fields. The image exists; SHA-256 is
  `5a49e739df5ce9abfcfc9abfd63c64cec65fc447ed0e65802bd4aca3947718ab`.
- Read-only Codex app-server `plugin/read` requests using each exact backend ID
  as `pluginName` and `remoteMarketplaceName: "workspace-shared-with-me"` return
  `logo: null`, `logoDark: null`, `logoUrl: null`, `logoUrlDark: null`,
  `composerIcon: null`, and `composerIconUrl: null` for both plugins.
- Inspection of the installed desktop JavaScript shows catalog entries use
  `release.interface.logo_url` / `composer_icon_url` for presentation. The packaged
  file and the account catalog image are distinct inputs to the desktop display.

## Limits and next repair point

No browser was used. No cache was deleted, and no logo fix is claimed. The exposed
Plugin Creator update tool accepts archives, but has no separate catalog-image
registration parameter. The current packaged image and pointers are already valid.
The evidence is suitable for a Plugin Creator/Codex bug report or for checking the
primary app icon in the plugin dashboard. JobHunter was inspected but not changed.

Keep the embedded hook-compatible manifest; introducing a portable root manifest
would suppress its hooks in the installed Codex runtime. Renaming the image as a
cache workaround is not supported by the null catalog-URL result.
