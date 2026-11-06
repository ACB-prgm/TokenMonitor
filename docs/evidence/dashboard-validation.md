# Historical dashboard validation

Recorded results from the previous dashboard document; these are not newly executed checks.



Validated with production builds, plugin typecheck/tests, and root development tests. Browser checks used the actual bundled panel and local MCP AppBridge preview, not a replacement mock UI.

- Widths: 760, 600, 380, and 320px; all four display scales at 320px; no horizontal document overflow.
- Collapsed KPI height: approximately 130px desktop and 127px at narrow widths with representative values.
- Light/dark rendering, keyboard picker navigation and focus restoration, empty/long-title search results, KPI Enter/Space disclosure, settings Escape, invalid threshold rejection, reset, and persistence after reload.
- Loading/missing telemetry, small amounts, capacity pressure, negative compaction savings, and comparable chart reference rendering.
- Preview counters stayed at zero model messages and zero model-context updates while telemetry polling continued.

Reproduce the preview after building:

```sh
npm --prefix plugins/token-monitor-embedded run typecheck
npm --prefix plugins/token-monitor-embedded run build
npm --prefix plugins/token-monitor-embedded test
npm run dev:test
node plugins/token-monitor-embedded/scripts/preview.mjs
python3 -m http.server 8765 --bind 127.0.0.1 --directory .build/embedded-preview
```

The preview includes scenario, width, theme, and disconnect controls. Installed Codex-host appearance still requires a local installation/restart and was not changed by this work. No release, installation, remote push, or new dependency is included.
