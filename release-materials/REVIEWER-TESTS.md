# Reviewer scenarios

Use a disposable macOS account with Apple silicon, macOS 13+, local Codex desktop and synthetic tasks. No external credentials or API keys are required by TokenMonitor. The reviewer needs their own normal Codex access. Approve macOS first open and review hooks when the test calls for them.

## Five positive cases

1. **Set up TokenMonitor.** Explicit skill invocation verifies the package and installs the companion/helper and six user hooks. Reports hook trust separately. Doctor shows matching version, loaded helper and exactly one native handler per event after setup.
2. **Diagnose TokenMonitor.** Reads installation status, hook counts and bridge freshness; does not install, read transcript bodies, or change preferences. After a trusted synthetic task event, bridge freshness advances and the HUD follows the task.
3. **Update TokenMonitor.** With an existing Python-based or previous native installation and unrelated hooks, setup preserves settings/unrelated handlers and replaces only exact owned registrations. Repeating setup adds no duplicates.
4. **Repair TokenMonitor.** With the known helper/agent missing, setup restores them. Codex open/quit lifecycle behavior, manual suppression and foreground-only presentation remain intact. The shortcut and corner-anchored expand/collapse still work.
5. **Uninstall TokenMonitor.** Explicit uninstall removes owned native app/helper/user hooks while preserving unrelated hooks, Codex transcripts and monitor preferences. An explicitly requested purge also removes monitor state/preferences. Removing the plugin itself is a separate operation.

## Three negative cases

1. **Set up TokenMonitor** on Intel, macOS <13, Windows/Linux/cloud, or a Mac without Codex. Refuse with supported-platform or prerequisite information; no installation changes.
2. **Set up TokenMonitor** with a modified app byte/checksum mismatch. Stop before executing or installing the altered app. Do not redownload or bypass verification. Likewise a Gatekeeper block must be resolved by normal user approval, not quarantine removal.
3. **Set up/uninstall TokenMonitor** when the destination app or launch agent belongs to another app, or hooks.json is malformed. Refuse before replacement/deletion; leave unrelated data unchanged and report the conflict. Mentioning tokens without a maintenance request must not trigger setup.

## Optional remote monitoring

Use two disposable Macs and a dedicated SSH key. Verify no remote connections are created during ordinary installation. Configure a source through Settings, verify a protocol-v1 handshake and task selection/refresh, and confirm raw transcripts and transcript paths are not present in the wire messages. Restrict the public-key entry to the installed helper and verify an SSH request for a shell command instead starts only the telemetry protocol.

Exercise machine-qualified locking with matching session IDs, initial/reconnect snapshots without replayed selection events, transient disconnection/backoff, unknown/changed host keys, missing or incompatible helpers, unavailable/deleted tasks, and disable/remove returning to local monitoring. Verify menu-bar settings during click-through and keyboard editing in the settings window. Close local Codex and confirm SSH/helper shutdown; hiding must retain collection. Ordinary uninstall retains configuration and never changes SSH authorization.
