---
name: token-monitor
description: Remove or diagnose the deprecated TokenMonitor native companion when explicitly requested. Direct new installations to TokenMonitor Embedded.
---

# TokenMonitor

Deprecated on 2026-10-19. Use [TokenMonitor Embedded](https://chatgpt.com/plugins/Plugin_df57c7c0b9d08191936d851916050a02) for new installations, including Codex remote chats; it needs no separate native app or monitoring SSH setup. Do not install, update, or repair this legacy companion unless the user explicitly requests the deprecated native version after learning about the replacement. The instructions below are retained for legacy maintenance and removal.

This plugin ships the native app. It processes local Codex telemetry without model calls; optional remote monitoring streams parsed telemetry over SSH. It is not made by or affiliated with OpenAI.

Only perform the requested maintenance action. Mentioning tokens or using a normal Codex task does not authorize installing or changing TokenMonitor. The skill is explicitly invoked; once the user requests setup, do not add another generic confirmation.

## Set up, update, or repair

1. Explain briefly that setup installs a companion app under `~/Applications`, six user hooks, and an event-driven per-user launch helper. It preserves existing monitor preferences. Apple silicon, macOS 13+, and local Codex desktop are required; it cannot install on web/cloud/Linux/Windows/Intel environments.
2. Resolve `scripts/setup.sh` relative to this SKILL.md and run `/bin/bash "<absolute skill directory>/scripts/setup.sh"`. The script verifies the bundled release, stages it, and opens native setup through Launch Services. Do not invoke the staged binary directly to bypass a first-open failure.
3. Read the result. If macOS blocks the unnotarized app, explain the system's first-open review using [troubleshooting](references/troubleshooting.md). Do not remove quarantine, disable Gatekeeper, or edit hook trust.
4. Tell the user to review and trust the six TokenMonitor hooks in Codex Settings > Hooks and restart/resume a task. Never report the hooks as trusted just because setup completed.
5. Remote monitoring is optional and is configured through the app gear > Manage remotes or the menu bar Settings. Do not create remote connections as a side effect of ordinary installation.
6. After successful setup, run the installed executable with `--doctor` and report any remaining setup issues. A current bridge timestamp is evidence of events, not proof that every hook is trusted.

Updates are explicit: reinstall/update the plugin, then run setup again. No background downloading or automatic native-app update occurs.

## Diagnose

Run `"$HOME/Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor" --doctor` if installed. This reads local installation health, helper status, native hook counts, and bridge freshness without reading transcript contents. If missing, say so and offer setup; do not install as a side effect of diagnosis. Use [troubleshooting](references/troubleshooting.md) for failures. Do not print raw transcripts, prompts, credentials, or unrelated configuration.

## Uninstall

On an explicit uninstall request, run `"$HOME/Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor" --uninstall`. Add `--purge` only when the user explicitly requests removal of saved monitor state and preferences. Uninstall preserves unrelated hooks and refuses unrecognized files.

If the installed app is missing, explain that repair/setup is needed to restore its native management command before companion cleanup; do not blindly delete paths. Removing the plugin from Codex does not remove the companion app/helper/user hooks. The app menu also offers Uninstall TokenMonitor, retaining preferences.

Privacy details: [privacy](references/privacy.md).

## Remote setup assistance

Only assist with remote setup when explicitly requested. The viewing Mac owns its private key; authorize only its public key on the source Mac. Never print/read private-key contents, store passphrases, accept host keys silently, or reuse OpenAI Remote Control credentials.

1. Confirm the source Mac has the current TokenMonitor app installed through normal setup. Preserve quarantine and existing hook trust; remote collection needs trusted hooks but not an open source HUD. Update through normal plugin setup; never bypass first-open review.
2. Use the app's Settings to configure a label, SSH hostname/alias, username, port and existing private-key path. Connection tests are read-only. Missing/outdated helper, host-key or authentication errors require the stated setup repair; no automatic upload occurs.
3. When authorizing or restricting a key is requested, modify only the exact supplied public-key entry in the source user's authorized_keys, preserving unrelated entries and a backup. Use `restrict` plus a forced command invoking the installed `CodexUsageMonitor --remote-agent`. Copy the exact escaped example from the app's Settings. Do not restrict before the new helper is installed. This key then cannot perform app updates or shell administration.
If the SSH agent offers the restricted monitoring key during ordinary shell logins, verify the user's existing administration identity for that same destination. During requested remote setup, a backed-up SSH config Match scoped to the exact host and user can select that administration identity with IdentitiesOnly while TokenMonitor explicitly selects its dedicated key. Preserve unrelated configuration and verify both ordinary shell access and telemetry afterward.

4. Verify the JSON protocol handshake and a source-local telemetry snapshot without printing task bodies or raw transcripts. Verify general shell commands do not execute. Report whether network resolution, authentication, helper protocol and telemetry are verified separately.
5. Removing an app connection does not authorize deleting private keys or remote authorized_keys entries. Revocation is a separate explicitly requested action.
