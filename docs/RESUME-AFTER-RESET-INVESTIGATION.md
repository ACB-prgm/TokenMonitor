# Resume after a usage reset: investigation

Investigated November 8, 2026 against Token Monitor commit `9e02a13` and the
installed ChatGPT/Codex desktop app version `26.1103.41825` (build `25679`).
This is a feasibility assessment, not an implemented or end-to-end validated feature.

Follow-up: a [DEV-only test prototype](DEV-RESUME-PROBE.md) now exercises an
app-supplied local tools pipe. Read-only access passed using the app's bundled
runtime. The live capped-account continuation and goal-state questions below
remain open.

## Finding

The design is plausible: read usage without a model turn, wait outside the model,
then submit a continuation to the same chat. Both building blocks exist inside
the app. Token Monitor does not currently have a demonstrated, supported path to
invoke the app's chat dispatch from its background process. A model-visible
`send_message_to_thread` tool is not itself such a bridge.

The installed heartbeat scheduler can submit a turn without first asking a model
to decide whether to submit it. However, it is a recurring prompt scheduler, not
a reset-aware continuation service. Its inspected path does not read usage before
dispatch. A prompt telling a scheduled model turn to check usage therefore does
not solve the capped-account problem.

## Evidence and limits

| Mechanism | Evidence | Validation level |
| --- | --- | --- |
| Read current usage | `get_usage_limits` returned a live account response | Live, while usage was available |
| Read usage without inference | Token Monitor sends only initialization and `account/rateLimits/read`; official app-server documentation confirms the request and update notification | Source inspection and existing tests |
| Poll and receive updates | `AccountLimits` polls every 30 seconds while touched and handles `account/rateLimits/updated` | Existing tests passed |
| Submit to an existing chat | Installed tool handler resolves the target and calls `sendFollowUpMessage` through the target host's manager | Source inspection; no live message sent |
| Schedule without a preceding model turn | Main-process heartbeat code calls `resumeThread`, then `startTurn` | Source inspection and isolated dispatch test |
| Recover a real usage-limited chat | Account was not capped during this investigation | Not established |
| Background Token Monitor dispatch over the existing app connection | No demonstrated bridge in the current plugin | Not established |
| Exact usage-limit “Continue” button behavior | Normal message submission was traced; the specific button callback was not established | Still unresolved |

No automation was installed, no existing chat was messaged, no reset credit was
used, and no app configuration or backend connection was changed.

## Usage refresh

The existing implementation is in
[`allowances.ts`](../plugins/token-monitor-embedded/server/src/allowances.ts).
It starts a separate installed CLI app-server using existing authentication,
initializes it, reads account limits, and accepts push notifications. It does not
send thread or model-turn requests. This account reader is separate from the
desktop conversation connection.

The protocol is documented in
[official OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt).
The multi-bucket map is authoritative when present. Reset timestamps are Unix
seconds; missing data is unavailable, not zero usage.

The live desktop tool response reported ordinary usage allowed, with 9% used in
the five-hour window and 18% used in the weekly window. It also contained a
spend-control flag. That combination is evidence that checking a single boolean
or percentage is insufficient to classify every account's eligibility. These
values are an observation at investigation time, not a current status guarantee.

Current Token Monitor normalization keeps only the `codex` bucket's five-hour and
weekly display values. It drops credit, spend-control, limit-classification, and
other model-bucket information. A continuation decision needs richer, fresh
account evidence and the target model's applicable limits. It must handle unknown
eligibility conservatively and still handle server rejection at dispatch time.

Two existing behaviors prevent reuse as an unattended scheduler:

- `touch()` keeps the connection alive for 60 seconds; it disconnects after
  inactivity. The panel refreshes only while visible.
- Passing the reset timestamp marks a reading `awaitingRefresh`; it does not
  establish renewed capacity. Catalogue telemetry and stale snapshots are useful
  display fallbacks, not authorization to dispatch.

A direct read-only CLI probe could not initialize in this task's filesystem
sandbox because the app-server needed to initialize its SQLite runtime under
`~/.codex`. It exited before the account request. The live account read above
therefore validates the desktop tool path, not a successful independent CLI read
in this sandbox or a CLI read during a real cap.

## Continuation

The installed `send_message_to_thread` path resolves the accessible target host,
obtains follow-up context, and calls the target manager's `sendFollowUpMessage`.
That method resumes/loads the conversation and builds a normal prepared user
message. The turn coordinator can start, steer, or queue the message according
to the chat's state. A successful tool dispatch is not proof that a new model
turn completed, or even that it started immediately in a busy chat.

This supports using an ordinary follow-up for an idle chat after capacity
returns. It does not establish equivalence to the exact usage-limit “Continue”
button. The app also has separate goal statuses, including `usageLimited`, and
goal status update/resume operations. A successful follow-up must not be treated
as proof that an autonomous goal returned to `active`.

The current UI uses `App.callServerTool` for Token Monitor's own server tools.
Nothing in the inspected integration demonstrates that its Node server can call
the desktop's `send_message_to_thread` implementation. Before product work,
prove a supported host bridge with the correct account, host, and thread identity.
Resuming a transcript through another CLI connection is a different approach;
it cannot be assumed to preserve the existing desktop connection or its state.

## Scheduler

The installed app's main-process scheduler ticks independently of model
inference. For heartbeats, the inspected code checks scheduling, renderer
eligibility, collaboration/model state, and target thread activity. It can defer
for missing state, active work, approvals, or user input. It then resumes the
thread and calls `startTurn` with an `automation_heartbeat_*` trigger and the
configured prompt. It observes turn-start and completion notifications.

No usage-read or reset-time gate was present in that inspected heartbeat path.
The scheduler can attempt a dispatch without an already-running model, but the
server still enforces usage when executing the turn. Its behavior across a real
cap and reset remains untested. Source inspection does not establish operation
while the desktop app is closed or the computer is asleep.

## Checks performed

`node --test tests/allowances.test.mjs` in the plugin directory: **14 passed**.
Coverage includes polling, initialization, notifications, timeouts, backoff,
cleanup, authoritative buckets, and expired/stale readings. These use fixtures
and do not simulate the service lifting an actual account cap.

The installed heartbeat dispatch function was extracted into a temporary VM test
with a mocked connection. Four cases passed: turn started, turn completed,
dispatch rejected with a fixture usage error, and turn completed as failed. Each
case made exactly one mocked `startTurn` call and removed its notification
subscription. This confirms the dispatch branch and error propagation, not live
model execution, full scheduler eligibility, or reset recovery. Temporary test
files are outside the repository under `/tmp/tokenmonitor-resume-investigation`.

For reproducibility, the inspected archive was
`/Applications/ChatGPT.app/Contents/Resources/app.asar`, SHA-256
`766faa8a3da8f6d6902c751d5b6b29395a6c5bf3c966ef7f8ca3f629d931df85`.
Relevant installed chunks and search anchors:

- `.vite/build/early-bootstrap-854-5239e17d5abd99b3.js`:
  `setHeartbeatThreadRendererState`, `Heartbeat automation blocked by thread state`,
  `automation_heartbeat_`, `async function sP`, `function sY`.
- `webview/assets/async/182735.d1916dd704.js`:
  modules `QhQG` and `whfw`, `sendFollowUpMessage(e,t)`, and `thread/goal/set`.

These are private build details, useful as evidence for this version rather than
stable APIs to depend on or modify.

## Validation required before implementation

1. Prove a non-model bridge can read fresh usage and dispatch a harmless,
   explicitly armed continuation through the existing host connection. Observe
   the target thread and turn IDs; a delivery acknowledgement alone is inadequate.
2. On a deliberately selected chat stopped by a real account usage cap, show
   that the background reader still works while capped. After reset, confirm
   fresh eligible limits and submit exactly one continuation. Observe a new turn
   and successful response without clicking Continue or consuming a reset credit.
3. Repeat for a goal in `usageLimited`; verify whether it becomes active or
   needs a separate explicitly authorized goal-resume operation. Compare with
   the actual Continue button path.
4. Exercise manual continuation before reset, cancellation, model/account
   changes, archiving, concurrent armed chats, restart, sleep/wake, network
   failure, and an ambiguous dispatch response. Confirm no duplicate message.

If the bridge is established, persist the explicit arm request with account,
host, thread, model, latest turn identity, expected reset, and expiry. A background
worker should re-read live limits, revalidate that the chat is still waiting,
atomically claim the request, and dispatch once. Reconcile uncertain sends before
retrying; use a stable message identity only if the bridge supports it. Cancel on
manual continuation or changed identity. Treat server rejection as an outcome to
handle, never infer success from a timer or a lower display percentage.

The next milestone is the bridge plus the real cap/reset acceptance test. A
resume toggle would be premature until those pass.
