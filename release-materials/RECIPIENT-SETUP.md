# Recipient setup

1. Install the TokenMonitor plugin in local Codex desktop. For the ZIP before directory publication, unpack it, add the token-monitor folder to a local/personal marketplace using Codex's plugin-creator, and install it from that source. The archive is a plugin package, not a standalone macOS installer.
2. Start a new Codex task and invoke the TokenMonitor skill: “Set up TokenMonitor.” The skill is explicitly invoked; use $token-monitor if normal text does not select it.
3. Review the setup summary. The bundled app is copied locally; no download, Python or Xcode is needed.
4. If macOS blocks the unnotarized app, review its origin and use Privacy & Security > Open Anyway if offered and allowed by your device policy. Open the staged app path reported by setup. Do not remove quarantine or disable Gatekeeper.
5. In Codex Settings > Hooks, review and trust the six native TokenMonitor hook commands. Restart/resume a task, then send a normal message and verify the monitor updates.
6. Use “Diagnose TokenMonitor” for installation health. Update the plugin and invoke setup again for native updates.

The app uses the existing local.codex.usage-monitor identity, ~/Applications/Codex Usage Monitor.app, ~/.codex/usage-monitor and per-user launch helper. It cannot run on Intel or cloud execution environments.

To remove it, invoke “Uninstall TokenMonitor” or use the app menu. Removing only the plugin leaves the companion app, helper and user hooks installed. Ordinary uninstall keeps preferences; request purge explicitly to remove monitor state too. Codex transcripts are retained.

## Optional SSH remotes

Update TokenMonitor on both Macs, then open the HUD gear > Manage remotes or menu bar Settings. Create a dedicated SSH key on the viewing Mac and authorize only its public key on the source Mac. Verify the source host fingerprint, enable Remote Login, and load the private key into the viewing Mac's SSH agent. Add the host/SSH alias, username, port, key path and machine label in Settings. No app copying or key authorization occurs automatically.

After verifying the helper, use the restricted-key instructions in Settings to constrain that public-key entry to telemetry. Keep unrelated keys and a backup; updates need a separate administration connection. If your agent offers the monitoring key during a normal shell connection, select your admin key explicitly with IdentitiesOnly. Outside your LAN, configure a reachable VPN/mesh-network address. Removing a remote from Settings does not revoke its public key on the source Mac.
