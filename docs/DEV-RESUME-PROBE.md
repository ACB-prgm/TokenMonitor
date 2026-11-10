# DEV continuation testing

The one-shot DEV probe has been replaced by persistent per-chat Settings.
See [App bridge cutover](APP-BRIDGE-CUTOVER.md) for current behavior, storage,
validation commands and remaining acceptance checks.

1. Reconnect Token Monitor DEV after installing an update and reopen the panel.
2. Verify the selected chat title, open Settings and enable **Continue this chat
   after usage reset**. New settings default to off; old probes grant no permission.
3. Work in that chat until it actually fails at a usage limit. An already-idle
   chat no longer qualifies as a test. Keep Codex running and the computer awake.
4. After reset, verify one continuation message and a completed response. The
   setting stays enabled. A manual new turn supersedes the interrupted episode.
5. Test a full app restart separately: preferences and waiting episodes should
   recover, but an uncertain dispatch must never be replayed.

The earlier successful idle-chat dispatch demonstrated message delivery, not
recovery of genuinely interrupted work. See the historical
[feasibility investigation](RESUME-AFTER-RESET-INVESTIGATION.md).
