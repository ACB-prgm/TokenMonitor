# DEV resume probe

This experiment is available only in Token Monitor DEV. It sends one explicitly
armed message through the desktop app's existing tools connection, without a
scheduled model turn to decide when to send it. It does not modify a goal's
status or consume a reset credit.

## Test tonight

1. Open **Token Monitor DEV** and confirm the selected chat's title.
2. Turn on **Resume this chat after usage reset**. You can enable this while a
   turn is running or before usage runs out, and keep working in that chat.
3. When the worker observes exhausted usage and an idle chat, it records that
   turn and waits until the latest exhausted-window reset plus five seconds.
   Fresh usage must confirm capacity before the one continuation is submitted.
   The toggle turns off after dispatch; turn it on again for another reset.
4. Keep the app running and computer awake. Turning the toggle off cancels it.
   Once exhausted usage has been detected, a new turn cancels the pending send.
   Before that point, new turns are followed. Switching the monitor selection
   does not cancel another chat's toggle. Requests expire after at least 24 hours.
5. **Send harmless test in 30 seconds** still provides a separate idle-chat test.
   It asks for **Token Monitor DEV continuation received.** and uses one ordinary
   model turn once live capacity is available.

The panel may be hidden if the host keeps its MCP process alive. Any MCP shutdown
cancels pending work; restarting never restores a pending continuation.

The panel displays a probe ID, earliest send time, last check, and outcome:

| State | Meaning |
| --- | --- |
| `armed` | Waiting, including read failures or usage still blocked. |
| `sending` | One dispatch has been claimed; cancellation is no longer offered. |
| `sent` | The app acknowledged the message. Inspect the target chat to verify execution. |
| `uncertain` | Delivery failed or could not be established. Check the chat before re-arming; no send retry occurs. |
| `cancelled` / `expired` | The pending request ended without a new dispatch by this worker. |

Record the probe ID, displayed status, whether a new user message appeared,
whether a response completed, and whether a `usageLimited` goal actually became
active. Acknowledged delivery alone does not validate recovery from a real cap.

## Implementation and limitations

The experiment uses the app-supplied `CODEX_APP_TOOLS_PIPE_PATH` and only three
tools: `read_thread`, `get_usage_limits`, and `send_message_to_thread`. This is a
private app interface and may change between builds. No pipe discovery,
authentication bypass, backend switching, or direct transcript writes occur.

The installed macOS app closed the connection for the Homebrew Node runtime and
accepted its bundled Node runtime, consistent with its peer authorization code.
Build and install this experiment with:

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/dev.mjs --install
```

The DEV build records that executable in the MCP configuration and hooks. It
also explicitly passes the current app-supplied bridge pipe and caller host into
the MCP environment: the app does not inherit those variables into plugin servers.
No other environment values are copied. It must remain at that path. Other hosts may reject the bridge or not
supply it; the UI reports those failures. The pipe belongs to the current app session. After an app restart, rebuild and
reinstall DEV from that session. Reconnect the DEV plugin server to load an updated
installation; restarting the entire app can invalidate the saved pipe. This is a
DEV-only shortcut pending a supported persistent host integration. Regular `npm run dev` uses whichever
Node runs npm and can therefore produce a DEV build without working bridge access.

The worker checks every 15 seconds while its MCP process remains alive. It checks
the latest turn before waiting and again immediately before dispatch. It requires
explicit ordinary-usage eligibility and known, non-exhausted windows across all
returned limit buckets. This is conservative: it may wait for a bucket unrelated
to the selected model. It does not override the chat's model, reasoning settings,
or permissions. The account's answer can change after a check, and a user action
can race the final dispatch; the bridge provides no atomic compare-and-send API.

Claims and outcomes are stored in
`~/.codex/token-monitor-dev/resume-probe.sqlite` (or the configured `CODEX_HOME`).
A unique pending claim per target and an atomic transition to `sending` prevent
duplicate sends across panels/processes. Uncertain sends are never replayed.
The database stores request metadata, not credentials or tool outputs. The current pipe path is stored only in the DEV
MCP configuration.
Pending requests expire after at least 24 hours, or one hour after their expected
reset if later. Crash recovery marks abandoned sends uncertain; PID reuse can
require waiting for the old process to exit before an abandoned claim is cleared.

## Validation

- TypeScript check and build passed.
- Worker coverage includes enabling during a running turn, following later turns,
  waiting for actual exhaustion, reset-time recovery, cancellation, and one send.
- UI coverage verifies per-chat toggle state, clickability, cancellation, and
  disabled states during mutation and dispatch.
- DEV build/install suite: four tests passed, including DEV-only app-visible tool
  registration and rejection of an unbound panel.
- Live bridge read with the app's bundled runtime returned account identity,
  usage eligibility, and Codex limit buckets without requesting a model turn.
- Control preview inspected at 600px and 320px; neither had horizontal overflow.

The original probe was installed locally as `1.10.0-dev.1794197991559.224635`. A smoke test against the
installed package verified the bundled runtime path, panel-only probe tool,
monitor refresh, supplied bridge, and live account/thread reads. It requested
zero model turns and armed no pending probe. Reconnect DEV to replace already-running MCP processes.

The live send and actual capped-account reset test are intentionally left to the
explicit controls above. The earlier
[feasibility investigation](RESUME-AFTER-RESET-INVESTIGATION.md) describes the
remaining Continue-button and goal-state questions.

## Per-chat toggle update (November 9)

The original installed MCP processes lacked `CODEX_APP_TOOLS_PIPE_PATH`, which
made the old buttons disabled. The updated DEV package explicitly forwards the
supplied bridge into its MCP configuration. The toggle itself remains clickable
so bridge failures produce an actionable error instead of a silently disabled
control. Reset mode now accepts running chats and follows new turns until it
observes an exhausted window and a stopped turn.

Validation: 293 plugin tests and four DEV build/install tests passed, along with
TypeScript and documentation checks. An installed-package smoke test started MCP
with its configured environment, then read live usage and this chat through the
bundled Node runtime. It requested no model turns and armed no continuation.
The same socket check needs an unsandboxed local runtime; the shell sandbox blocks
it. An actual capped-account continuation still needs the manual overnight test.
