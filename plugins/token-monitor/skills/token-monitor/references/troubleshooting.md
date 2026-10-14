# Setup and recovery

TokenMonitor supports local Codex desktop on Apple silicon Macs with macOS 13 or later. Run the setup shell natively, not in a Rosetta terminal. Recipients do not need Python or Xcode. The app is ad-hoc signed, not Developer ID signed/notarized.

## macOS first open

Setup opens a verified, staged app through Launch Services. A downloaded app may be blocked by macOS. Review the publisher and source before using System Settings > Privacy & Security > Open Anyway when macOS offers it. Return to the staged app path printed by setup. Opening that staged app completes setup automatically. Keep its adjacent release.json in place. If device policy disallows unnotarized apps, stop and report that limitation; do not bypass policy, remove quarantine, or disable Gatekeeper.

## Hooks and launcher

In Codex Settings > Hooks, review and trust the six new user hook commands pointing to the installed TokenMonitor app with --hook. The native command changes the hook definition, so previously trusted Python hooks may need review again. Restart/resume a task to load changes. There is no task-selection hook; the next supported lifecycle event follows the task unless locked.

The launcher listens for Codex application launch events. The HUD observes app lifecycle events and retains its existing lightweight fallback. A manual Quit Monitor suppresses auto-launch for the current Codex process; reopen TokenMonitor explicitly or restart Codex to resume.

## Repair and rollback

Run setup from the current plugin to repair missing components or update. No update is downloaded. Setup validates configuration before replacing installed files. Hook backups are alongside ~/.codex/hooks.json. An update failure restores the previous app and configuration; if rollback itself fails, the error identifies retained recovery files. Do not delete these until recovery is complete.

Unrecognized app bundles, helper files, malformed hooks, and redirected installation paths are refused. Inspect the reported conflict; never replace unrelated files to force setup.

## Cleanup

Invoke the skill's uninstall action or use Uninstall TokenMonitor in the app menu. Removing the Codex plugin alone does not remove its separately installed companion. Ordinary uninstall retains monitor data/preferences; --purge removes them only when explicitly requested. Codex transcripts and unrelated hooks are never purged. Known legacy Python bridge files may be removed; unrecognized legacy files are left alone.
