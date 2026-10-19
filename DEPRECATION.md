# Native TokenMonitor retired

As of 2026-10-19, TokenMonitor Embedded replaces the native monitor app and the
legacy `token-monitor` plugin. The owner confirmed that embedded hooks work after
reinstalling the plugin and that Codex remote machines work without a separate
SSH monitoring connection.

Install [TokenMonitor Embedded](https://chatgpt.com/plugins/Plugin_df57c7c0b9d08191936d851916050a02).
Review its plugin hooks in Codex. Existing native personal hooks are separate and
should be removed along with the native app using its own uninstaller:

```sh
"$HOME/Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor" --uninstall
```

Run this on each Mac where the native app was installed, then uninstall the old
TokenMonitor plugin. The command preserves saved monitor data and preferences;
`--purge` is a separate, explicitly requested action. Removing the plugin alone
does not remove the app, launch helper, or personal hooks. Dedicated SSH keys and
remote authorization entries are not removed by this migration.

The native source is retained for historical reference, legacy cleanup, and core
telemetry code shared with the embedded collector. Its presence is not an
installation or a recommendation to keep the native app running.
