---
summary: "Runtime trace guide for one-message trace playbook debugging across renderer action, main bridge, SDK runtime, backend stream, local-runtime tool execution, SDK projection, renderer display, chat pill phases, renderer trace platform labeling after deprecated navigator.platform removal, tool screenshots, overlay windows, local-runtime JSON-RPC, backend websocket events, persistent app diagnostics, and app diagnostics CLI inspection helpers such as queryDiagnosticEvents, inspectDiagnosticTrace, listDiagnosticPathDefinitions, diagnosticsDatabasePath, and appUserDataRoot."
read_when:
  - When debugging event ordering across backend, Electron main, renderer, or local runtime.
  - When tracing one user message through renderer action, main bridge handoff, SDK runtime dispatch, backend stream, local-runtime tool execution, SDK projection, and renderer display.
  - When changing stream handling, overlay phases, screenshot capture, tool execution, or websocket routing.
  - When stale code, tests, or docs mention `navigator.platform` in renderer trace logging; renderer trace labels use `navigator.userAgentData.platform` with user-agent fallback.
  - When resolving app diagnostics inspection helper references such as `queryDiagnosticEvents`, `inspectDiagnosticTrace`, `listDiagnosticPathDefinitions`, `diagnosticsDatabasePath`, or `appUserDataRoot`.
title: "Runtime Traces"
---

# Runtime Traces

Runtime traces are useful when a bug depends on event order, process boundaries, or transient UI state. Enable the smallest trace that can prove which boundary broke.

Use [Observability Change Workflow](observability_change_workflow.md) before adding or renaming trace flags.

## One-Message Trace Playbook

Use this route first when one user message leaves the compose box but the
response, tool result, overlay, or transcript row looks wrong. Start with the
correlation ids from `ipc.bridge`, then move to durable turn traces once you
have a `conversationRef` and `turnRef`.

```bash
<windie> diagnostics list --path ipc.bridge --limit 50
<windie> trace <conversation-ref> <turn-ref>
```

| Stage | Owner | Evidence to prove | First place to inspect |
| --- | --- | --- | --- |
| Renderer action | Generic chat desktop UI plus WindieOS skin/config | A renderer send intent produced one SDK-shaped conversation send with message length, resource count, model checkpoint, and a `queryMessageId`. | `ipc.bridge` row `renderer query.send`; `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`; [Query Payload and Relay Reference](../frontend/main/query_payload_and_relay_reference.md). |
| Main handoff | Generic Electron agent host plus OS/window/permission/endpoint adapters | Main accepted the renderer command, applied settings/endpoint gates, and forwarded one query to the SDK/backend transport. | `ipc.bridge` rows `settings update.*`, `backend connection.*`, and `renderer query.send`; `frontend/src/main/ipc/ipc_query_send_runtime.cjs`; [Query Send and Stream Relay Change Workflow](../frontend/main/query_send_and_stream_relay_change_workflow.md). |
| SDK runtime dispatch | Durable SDK conversation runtime | The runtime resolved turn resources, shaped agent definition/client manifest data, and sent or skipped backend dispatch with explicit transport state. | Durable `query.resources`, `agent.definition`, `settings.sync`, and `query.dispatch` trace rows from `<windie> trace <conversation-ref> <turn-ref>`; [Windie Client Runtime](../sdk/windie_client_runtime.md). |
| Backend hosted orchestration | WindieOS hosted FastAPI orchestration, provider policy, prompt/runtime specifics | Backend accepted the query, built prompt/provider/tool policy, emitted stream events, and reached a terminal state. | `ipc.bridge` rows `backend first_event` and `backend complete`; durable `backend.stream`, `backend.prompt`, `provider.call`, and `tool.schema.policy` traces; Query Execution and Stream Pipeline Reference (private backend docs). |
| Local-runtime tool execution | SDK local-runtime contracts plus the current local-runtime Python implementation | A backend `tool-call` or `tool-bundle` reached the SDK coordinator, ran through the local executor, returned matching request/bundle ids, and produced one display-owned local output. | `ipc.bridge` rows `backend tool_call` / `tool_output`; durable `tool.execution`, `local_runtime.rpc`, and `browser.runtime` traces; [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md). |
| SDK projection | Durable SDK projections for current turn, rows, overlay phase, and rehydrate | Backend/local events became SDK `windie:current-turn` and `windie:rows` projections with the expected phase, tool-output, or error state. | `WINDIE_DEBUG_STREAM_EVENTS=1` for live SDK projection progress; durable `overlay.phase` traces; `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`; [Conversation Runtime](../sdk/conversation_runtime.md). |
| Renderer display | Generic chat desktop UI package plus WindieOS display skin | The renderer consumed SDK projection state and the main surface policy made the pill/overlay visible or hidden for the same turn. | `surface.visibility` app diagnostics, `[LiveSurfaceTrace]` when enabled, and renderer chat stream hooks; [Chat Stream and Tool Execution Reference](../frontend/renderer/chat_stream_and_tool_execution_reference.md). |

If evidence is missing at a stage, fix the producer for that stage before
adding downstream fallback parsing. Use app diagnostics for pre-turn app/main
state such as `ipc.bridge` or `surface.visibility`; use durable `trace_event`
rows for turn-scoped SDK/backend/local-runtime timelines that must survive
restart.

For edit/resend typing-state races, enable live-surface renderer tracing and
filter `[LiveSurfaceTrace]` for `renderer.replay.timeline`. The payload is
sanitized and includes only conversation/turn ids, action names, projection
phases, row/message counts, pending/current turn refs, stream-tracking phase,
and match booleans. It intentionally omits message text, screenshots, paths,
tool arguments, and tool output. Useful milestones include `replay_start`,
`display_timeline_loaded`, `replace_rows_start`, `replace_rows_done`,
`pending_published`, `stop_old_sent`, `stop_old_done`, `stop_old_failed`,
`send_new_sent`, `send_new_done`, `send_new_failed`,
`sdk_current_turn_applied`, `sdk_current_turn_stale_side_effects_skipped`, and
`sdk_display_rows_projected`.

Keep this playbook sanitized. Do not add prompt text, raw user/assistant
messages, provider payloads, credentials, file contents, shell output,
screenshots, URLs, browser page text, or tool output bodies to trace rows.
Prefer ids, counts, booleans, durations, enum stages, and short error
summaries.

## Durable Path Trace Events

Durable path traces are hidden SDK conversation events, not console logs. Use
them when the question is "what happened for this turn after restart?" rather
than "what is happening live in this terminal?"

The canonical event type is `trace_event`. It persists in the conversation
event ledger with:

- `traceId`, `spanId`, and `parentSpanId`
- `conversationRef` and `turnRef`
- `path`, `stage`, `status`, and `runtime`
- timestamps and `durationMs`
- sanitized counts, limits, ids, booleans, and error summaries

Trace rows must stay hidden from normal transcript display and backend
rehydrate history. Do not persist user message text, retrieved memory text,
embedding vectors, screenshots, file contents, shell output, provider payloads,
tokens, credentials, raw SQL rows, or full stack traces in durable trace rows.

Current durable traced paths:

- `memory.retrieval`: SDK query enrichment records retrieval, embedding,
  local-runtime search, injection, and completion spans. The SDK local runtime
  returns sanitized search metadata such as searched memory
  types, limits, result counts, embedding-space version, and duration.
- `screenshot.capture`: SDK query screenshot resource resolution records
  request, resolver, Electron main surface-preparation, local-runtime capture,
  artifact upload, and backend query payload application spans. The SDK local
  runtime returns sanitized capture metadata such as capture engine, dimensions,
  crop bounds, monitor id, byte count, content type, and duration.
- `query.dispatch`: SDK conversation runtime records backend send start/end or
  skip spans with transport availability, backend acceptance, request ids, and
  duration.
- `query.resources`: SDK turn-input resolution records resource counts/kinds,
  resolver count, payload key count, metadata key count, duration, and failure
  summaries without file paths, file contents, or screenshot paths.
- `backend.stream`: backend query execution records stream start/end spans with
  sanitized event counts, chunk/tool counts, terminal state, fallback-completion
  usage, request ids, and duration.
- `backend.prompt`: backend interaction loop records prompt-build spans with
  prompt mode, iteration, prompt message count, tool-schema count, metadata
  presence, final builtin/client/MCP/plugin/backend-remote tool counts, skill
  prompt-layer counts, and duration. It does not persist prompt text.
- `provider.call`: backend provider runtime records LLM request spans with
  provider/model ids, prompt/tool counts, final builtin/client/MCP/plugin/backend
  remote tool counts, skill prompt-layer counts, response length, generic
  failure kind, and duration. It does not persist raw provider payloads or
  tokens.
- `conversation.rehydrate`: SDK runtime records backend rehydrate send spans
  with message count, rehydrate mode, transport availability, and duration.
- `compaction.lifecycle`: SDK runtime records manual compaction request spans
  with force flag, payload key count, backend request id, transport
  availability, and duration.
- `backend.compaction`: backend interaction loop records compaction application
  spans with reason, strategy, token counts, removed message count,
  applied/skipped state, summary presence, skipped reason, and duration. It
  does not persist compaction summaries or replacement history.
- `tool.execution`: SDK tool coordinator records local tool execution and
  bundle spans with tool/bundle ids, tool names, argument key counts, step
  counts, screenshot-ref presence, delivery failure state, and duration. It
  does not persist tool arguments, outputs, screenshots, or file contents.
- `local_runtime.rpc`: SDK local-runtime RPC wrappers record method names,
  params/response key counts, success flags, request ids, and duration without
  persisting params, returned title text, or user content.
- `artifact.upload`: SDK resource/tool upload paths record upload mode,
  content type, artifact id, URL presence, and duration without screenshot
  bytes, screenshot paths, or file contents.
- `memory.persistence`: SDK completed-turn memory storage records enabled and
  runtime/client booleans, user/assistant text lengths, memory types, memory-id
  presence, and duration without memory text, embeddings, user text, or
  assistant text.
- `turn.supersession`: SDK edit/resend and retry supersession records late
  old-turn backend events that were stored as raw audit history but ignored for
  live authority. Rows use `stage: late_event` and
  `status: ignored_for_live_authority`, with sanitized event type/id, turn ids,
  replacement turn id, supersession reason, and backend sequence only. They do
  not include message text, system prompts, tool output, screenshots, provider
  payloads, local paths, credentials, or embeddings.
- `title.generation`: SDK completed-turn title workflow records model/provider
  presence, input text lengths, generated title length, success state, and
  duration without generated title text, user text, or assistant text.
- `settings.sync`: SDK runtime records settings update spans with updated key
  names, backend request id, transport availability, and duration. It does not
  persist credentials or provider payloads.
- `model.catalog`: SDK runtime records model-list request spans with backend
  request id, transport availability, and duration.
- `artifact.fetch`: SDK artifact helpers record backend artifact fetch spans
  with artifact-id presence, HTTP status, content type/length, success state,
  and duration without artifact bytes or ids from user-visible content.
- `overlay.phase`: SDK current-turn projection records phase transitions with
  source event type, before/after phase, active-turn match booleans, and turn
  presence without assistant or user message text.
- `browser.runtime`: SDK tool execution records local-runtime browser action spans
  with action name, mode, scope, connection state, tab count, and success
  booleans without URLs, page titles, page text, or browser output.
- `tool.schema.policy`: backend prompt projection and SDK schema helpers
  record tool-schema projection/list spans with tool counts, prompt mode, and
  source without schema bodies or tool descriptions. Backend live logs also emit
  `[Turn Tool Counts]` rows for backend-received capability manifests and
  provider-bound requests so production `journalctl` can show whether a turn had
  0, 14, or another count of model-visible tools, including MCP/plugin/client
  source counts and skill prompt-layer counts.
- `websocket.control`: SDK control sends record stop, wakeword, settings,
  model-list, rehydrate, and compaction control spans with message type,
  request id, transport availability, and duration.
- `voice.transcription`: backend transcription websocket emits producer-owned
  `trace_event` diagnostics for gateway session, provider connect, control
  messages, and audio frames. Rows include provider session class, control
  type, payload key count, sample rate, byte count, and short errors without
  transcript text or audio bytes.
- `tts.playback`: backend query execution records TTS session spans when
  speech mode is enabled or attempted, with service/task presence, provider
  mode, audio-task state, and duration without spoken text or audio chunks.
- `wakeword.runtime`: SDK wakeword activation records transport availability,
  payload key count, backend request id, and duration without transcript text.
- `extension.load`: SDK agent-definition shaping records extension/plugin
  contribution counts and definition presence without plugin payloads.
- `mcp.tool`: SDK agent-definition shaping records MCP server contribution
  counts and definition presence without server config payloads.
- `client_tool_manifest.validate`: backend turn handling records client tool
  manifest validation counts, raw tool count, accepted-name sample, and bounded
  rejected-reason sample without raw schemas or manifest payloads.
- `client_tool_manifest.apply`: backend turn handling records client manifest
  application counts, including the resulting prompt-builder client tool count,
  without raw schemas or manifest payloads.
- `workspace.context`: SDK turn send records workspace resource/path presence,
  source kind, and resource counts without workspace paths.
- `install.auth`: SDK install identity helper records identity lookup spans
  with install-id presence and response key count without install ids, user ids,
  tokens, or credentials.
- `run.control`: backend VM run-control service appends sanitized
  `trace_event` entries to the existing per-run event timeline for create,
  control, dispatch, and worker stream events. Rows include run id as request
  id, action/status/control mode, counts, assignment booleans, and payload key
  counts without query text or worker payload bodies.
- `local_runtime.lifecycle`: SDK local-runtime helpers record status,
  tool-list, and shutdown spans with ready/running booleans, tool count,
  version presence, shutdown mode, and response key counts.
- `agent.definition`: SDK conversation send records agent definition shape with
  merged tool/plugin/MCP/skill counts, SDK-vs-query agent-definition presence,
  SDK-vs-query client-manifest tool counts, key count, workspace-path presence,
  and local runtime availability without definition payload text or schemas.

Renderer diagnostics should read the same rows through
`DesktopConversationContinuityService.loadTraceTimeline(...)`, which loads
persisted conversation events and applies the SDK trace projection. Use
`<windie> trace <conversation-ref> <turn-ref>` to inspect persisted trace
events without renderer health. Add `--path <path>` to filter a runtime path and
`--json` to export the raw sanitized timeline.

Some producer-owned feature traces live on their existing non-conversation
timeline because that runtime has no conversation writer. `voice.transcription`
is emitted on `/ws/transcription`; `run.control` is appended to the VM run
event timeline, which has the same lifetime as the run-control service.

## Persistent App Diagnostics

Use app diagnostics when the path is not naturally tied to a conversation turn
or can fail before a conversation exists. These rows are separate from hidden
conversation `trace_event` rows. Resolve the platform-specific diagnostics
database and registered path surface with:

```bash
<windie> diagnostics paths
```

App diagnostic paths:

- `conversation.metadata.list`: dashboard/sidebar chat-list load.
- `browser.session_control`: chat header browser readiness and browser action
  request lifecycle before a conversation turn exists.
- `desktop.startup`: Electron main startup metrics, single-instance behavior,
  and app shutdown cleanup.
- `renderer.interaction`: renderer UI interaction breadcrumbs normalized through
  Electron main without raw labels, chat text, or message text.
- `renderer.display_projection`: renderer SDK display-row projection summaries
  for dashboard/open-conversation and SDK stream paths. Rows store ids and image
  counts only, not message text, screenshot URLs, refs, or image bytes.
- `ipc.bridge`: compact Electron main bridge milestones formerly mirrored to
  stdout as `[ElectronTrace]`, including backend connection, renderer query
  send, backend event milestones, tool call/output markers, and settings update
  send/ack summaries.
- `local_runtime.lifecycle`: Electron main local-runtime bridge
  initialization and lifecycle status outside a specific browser action.
- `permission.probe`: Electron main permission probe/request and workspace
  activation diagnostics by default. Rows include permission id, platform,
  status enum, granted boolean, details presence, workspace-path presence,
  duration, and short errors without selected filesystem paths. If a caller
  explicitly supplies both `conversationRef` and `turnRef`, the same sanitized
  path may be written as a hidden conversation `trace_event` because it is then
  part of a real user turn. `ipc_main_process_trace_runtime.cjs` owns this
  app-diagnostic versus conversation-trace routing in Electron main.
- `mcp.discovery`: local-runtime MCP discovery and stdio initialization,
  including sanitized command basename, argument summary, timeout phase,
  elapsed time, stderr tail, and short spawn/request errors.
- `mcp.enablement`: Electron main MCP dashboard toggle and desktop UI config
  persistence lifecycle, including whether a renderer save preserved MCP
  enablement from loaded main config or disk.
- `mcp.registration`: local-runtime MCP registration
  lifecycle, including `/mcps/register` request, replace/reconcile, and
  registered tool counts.
- `mcp.execution`: local-runtime MCP `tools/call` execution for MCP tools that
  have already been discovered and registered into the local tool manifest.
- `surface.visibility`: chat pill and response-overlay show/hide decisions,
  phase-driven window decisions, guard refs, requested visibility, and final
  visibility state.
- `wakeword.lifecycle`: Electron main wakeword service toggle, process
  start/exit, readiness, frame parsing, detection, and audio-send lifecycle.

The `conversation.metadata.list` path covers:

```text
renderer dashboard load
-> Electron main `conversations.list`
-> SDK `Agent.listConversations()`
-> SDK `LocalRuntimeConversationStore.listMetadata()`
-> sidecar `conversation.list`
-> sidecar history SQLite read
```

Rows are sanitized app/runtime events with `traceId`, `spanId`, `path`,
`stage`, `status`, `runtime`, `requestId`, timestamps, duration, and allowlisted
metadata. They may include booleans and counts such as `hasUserId`, `limit`,
`resultCount`, `backendConnected`, `localRuntimeReady`,
and `canonicalHistoryDbExists`.

Electron main diagnostics runtime helpers accept canonical camelCase fields
such as `conversationRef`, `turnRef`, `responseWindowVisible`, and
`activeGuardRef`. SQLite columns keep their existing snake_case storage names;
there is no migration required for persisted diagnostic rows, and removed
snake_case helper input aliases are ignored.

`browser.session_control` rows may include local-runtime readiness booleans,
status strings, browser action names, wake success/failure booleans, tab counts,
response key counts, request ids, durations, and short errors. They must not
include browser URLs, page titles, page text, screenshots, tool output, local
paths, raw payloads, or stack traces.

`mcp.discovery` rows may include server id, command basename, sanitized argument
summary, phase, timeout and elapsed milliseconds, tool count, exit code, signal,
stderr tail, and short errors. They must not include environment variables,
absolute command paths, raw MCP payloads, tool schemas, tool results, tokens, or
stack traces.

`mcp.enablement` rows may include server id, requested enabled state, config
save phase, preserve source (`latest`, `disk`, or `none`), persisted enabled
server count, registry status counts, and MCP tool counts. They must not include
raw desktop UI config, provider secrets, absolute paths, raw MCP payloads, tool
schemas, prompt text, or message text.

`mcp.registration` rows may include replace/reconcile booleans, requested
server count, registered server/tool counts, status/error counts, active MCP
server count, MCP tool count, elapsed time, and short errors. They must not
include raw server definitions, absolute command paths, environment variables,
tool schemas, raw MCP payloads, tokens, prompt text, or message text.

`mcp.execution` rows may include server id, exposed Windie tool name, original
MCP tool name, phase, elapsed milliseconds, request id, conversation ref,
tool-call/correlation/bundle ids, turn ref, stderr tail, and short timeout or
transport errors. They must not include tool arguments, raw MCP payloads, tool
results, schemas, screenshots, tokens, absolute paths, stack traces, prompt text,
or user/assistant message text.

Do not store raw user ids, chat titles, last-message text, workspace paths,
SQL rows, stack traces, tokens, prompt text, user text, assistant text, or raw
payloads in app diagnostics.

Inspect the latest rows with:

```bash
<windie> diagnostics list --path conversation.metadata.list --limit 50
```

The Electron main app diagnostics store exposes inspection helpers such as
`queryDiagnosticEvents`, `inspectDiagnosticTrace`,
`listDiagnosticPathDefinitions`, `diagnosticsDatabasePath`, and
`appUserDataRoot` for the `<windie> diagnostics ...` command surface.
Runtime feature code should emit diagnostics through exported path constants
plus `appendDiagnosticEvent(...)`; it should not query diagnostic storage to
drive behavior. Focused tests may read temporary SQLite diagnostics databases
directly when they need to prove the stored row shape.

For browser header readiness:

```bash
<windie> diagnostics list --path browser.session_control --limit 50
```

For MCP discovery:

```bash
<windie> diagnostics list --path mcp.discovery --limit 50
```

List the full registered app diagnostics surface and each path purpose with:

```bash
<windie> diagnostics paths
```

For MCP enablement/persistence:

```bash
<windie> diagnostics list --path mcp.enablement --limit 50
```

For MCP registration into the local runtime:

```bash
<windie> diagnostics list --path mcp.registration --limit 50
```

For MCP tool execution:

```bash
<windie> diagnostics list --path mcp.execution --limit 50
```

Inspect a single trace timeline with:

```bash
<windie> diagnostics inspect <trace-id>
```

## Stream Event Trace

Use this when the backend sends events but the UI displays stale, missing, or duplicated content. Keep the route through SDK-owned backend-event handling and renderer SDK-normalized conversation-event consumption instead of treating Electron main as a second stream normalizer.

| Layer | Code root | What to inspect |
| --- | --- | --- |
| Backend formatter | `backend/src/api/processing/formatters`, `backend/src/api/contracts` | Event type and payload shape. |
| Websocket route | `backend/src/api/routes/websocket` | Incoming query, task ownership, outgoing event stream. |
| SDK backend-event handling and main fan-out | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `frontend/src/main/ipc/ipc_agent_backend_event_runtime.cjs`, `frontend/src/main/ipc/ipc_renderer_windows.cjs` | SDK-normalized conversation events, current-turn projections, and main renderer-window fan-out. |
| Renderer SDK conversation-event consumption | `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`, `frontend/src/renderer/features/chat/hooks/useChatStream.ts` | SDK conversation-event dispatch, stale-turn filtering, stream tracking, and workspace state. |

Enable:

```bash
cd frontend
WINDIE_DEBUG_STREAM_EVENTS=1 <windie> start desktop
```

Expected markers:

- `[StreamTrace][main][recv]`
- `[StreamTrace][main][broadcast]`
- `[StreamTrace][renderer][before]`
- `[StreamTrace][renderer][after]`
- `[StreamTrace][renderer][response-surface]`

## Chat Pill And Response Overlay Trace

Use this when the minimal pill, awaiting indicator, or response overlay flickers, hides, opens at the wrong time, or ignores a terminal phase.

| Layer | Code root | What to inspect |
| --- | --- | --- |
| Phase contract | `frontend/src/shared/response_overlay_phase_contract.json` | Legal phase names and terminal states. |
| Main phase IPC | `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`, `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs` | Phase writes and renderer notification. |
| Main window policy | `frontend/src/main/surfaces/surface_runtime.cjs`, `frontend/src/main/surfaces/window_visibility_runtime.cjs`, `frontend/src/main/surfaces/display_affinity_runtime.cjs` | Visibility, capture, content protection, and display affinity. |
| Renderer view model | `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`, `frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime.js` | SDK current-turn projection, awaiting, streaming, complete, and error state transitions. |
| Chat pill trace | `frontend/src/main/debug/chat_pill_trace_runtime.cjs`, `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts` | Main and renderer state snapshots. |

Enable:

```bash
cd frontend
WINDIE_DEBUG_CHAT_PILL=1 <windie> start desktop
```

Expected stdout markers when chat-pill or live-surface debug flags are enabled:

- `[ChatPillTrace][main]`
- `[ChatPillTrace][renderer]`
- `[LiveSurfaceTrace]`

Minimal chat pill reset, lifecycle, and hit-test live-surface traces are
projected through `desktopRendererTraceRuntime.ts`; `MinimalChatPill.jsx`
reports send/lifecycle/pointer values and does not assemble `turn_surface.reset`,
`renderer.chat_pill.*`, `chat_pill.hit_test.set`, or `ignoreMouseEvents`
payload fields locally.

Chat-pill visibility and response-overlay window decisions are stored in app
diagnostics under `surface.visibility` instead of being emitted to stdout by
default:

```bash
<windie> diagnostics list --path surface.visibility --limit 50
```

Rows include the show/hide reason, phase, mode, whether persisted `user_hidden`
intent was active, response-window visibility, guard refs, and whether a generic
restore was suppressed.
`[ChatPillTrace][main]` and `[ChatPillTrace][renderer]` require the debug flag
above and include deeper phase/window snapshots. Response-overlay visibility
fields use explicit `response_visible` and `awaiting_visible` names on both
main and renderer trace payloads.

Renderer trace platform labels are diagnostic metadata only. The renderer trace
helper no longer reads deprecated `navigator.platform`; it prefers
`navigator.userAgentData.platform` and falls back to `navigator.userAgent` when
user-agent data is not available. Stale deprecation-audit searches for
`navigator.platform` in `desktopRendererTraceRuntime.ts` should route here.

`ipc.bridge` is the compact Electron main bridge timeline. It stores milestones
for renderer query send, backend connection state, the first backend event
received for a turn, tool call/output, backend completion, and settings updates.
Inspect it with `<windie> diagnostics list --path ipc.bridge --limit 50`.
Set `WINDIE_DEBUG_IPC_STDOUT=1` only when the `[ElectronTrace]` stdout mirror is
needed. The rows summarize ids, counts, text lengths, selected setting names,
provider ids, and model ids without raw user text, assistant text, provider
payloads, or secrets. Backend event trace summaries read canonical backend
fields such as `turn_ref`, `conversation_ref`, `request_id`, `correlation_id`,
`tool_name`, and `final_response`; removed camelCase aliases are ignored.
Renderer query trace rows read the main-process query helper fields
`queryMessageId` and `conversationRef`, not backend payload fallbacks such as
`turn_ref` or `conversation_ref`. SDK current-turn stdout traces read the SDK
projection fields `turnRef` and `conversationRef`; removed snake_case
projection aliases are ignored.

`[LiveSurfaceTrace]` is the verbose official ephemeral surface trace. Enable it
with `WINDIE_DEBUG_LIVE_SURFACE=1` or the broader chat-pill debug flag when the
bug depends on overlay/window ordering. `npm run electron:dev` does not enable
it automatically. Renderer live-surface decisions are forwarded through the
allowlisted `live-surface-trace` preload channel and printed by Electron main,
so the terminal contains both `process: 'main'` and `process: 'renderer'`
timeline entries. This channel is diagnostics-only; it does not drive window
behavior. The trace intentionally logs ids, lengths, booleans, modes, counts,
and window policy state; it does not log full message text, file contents,
screenshot pixels, or credentials.

High-value `[LiveSurfaceTrace]` events:

- `sdk.current_turn.received`
- `renderer.current_turn.applied`
- `renderer.display_rows.projected`
- `typing.show` / `typing.hide`
- `typing.rendered.show` / `typing.rendered.hide`
- `response_overlay.intent.show_awaiting`
- `response_overlay.intent.show_response`
- `response_overlay.intent.hide`
- `response_overlay.intent.ignored`
- `response_overlay.intent.noop`
- `response_overlay.renderer.size_report`
- `response_overlay.window.show`
- `response_overlay.window.hide`
- `response_overlay.window.resize`
- `response_overlay.window.hide_ignored`
- `response_overlay.dismiss.native_snapshot`
- `phase.received`
- `phase.window_mode.resolved`
- `chat_pill.window.show`
- `chat_pill.window.hide`
- `chat_pill.hit_test.set`
- `response_overlay.hit_test.set`
- `tool_lease.pointer.begin`
- `tool_lease.pointer.release`
- `tool_lease.screenshot.begin`
- `tool_lease.screenshot.protect`
- `tool_lease.screenshot.hide`
- `tool_lease.screenshot.release`
- `tool_lease.screenshot.unprotect`
- `tool_lease.screenshot.restore`
- `window.content_protection.set`
- `window.topmost.set`
- `renderer.response_overlay.mount` / `renderer.response_overlay.unmount`
- `renderer.chat_pill.mount` / `renderer.chat_pill.unmount`
- `renderer.overlay_view_model.resolved`
- `stale_guard.changed`
- `turn_surface.reset`

Phase invariants to check:

- Awaiting indicator is latched from `tool-call`, `tool-output`, and `awaiting-first-chunk`.
- Transient `idle` must not clear the awaiting latch while the backend turn is still active.
- `streaming`, `complete`, `error`, or visible response content clears the awaiting shell.
- Linux can hide overlay surfaces during screenshot capture; Windows and macOS should not add capture-time hide/show for minimal chat pill or response overlay.
- When a chat pill screenshot reaches the model but is missing from the
  dashboard row, compare `renderer.display_rows.projected` rows from
  `sdk-display-rows-stream` and `dashboard-open-conversation`: `sdkUserImageCount`
  proves the SDK display rows carried image metadata,
  `sdkProjectedUserImageCount` proves renderer display projection converted it,
  and `mergedUserImageCount` proves the visible renderer store retained it after
  replacing any optimistic text-only user row.

## Tool Screenshot Trace

Use this when screenshots are missing, stale, include overlays, or do not attach to the right turn.

| Layer | Code root | What to inspect |
| --- | --- | --- |
| Renderer query resource handle | `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts` | Whether the outgoing query requested a screenshot resource handle. |
| SDK turn resource resolver | `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts` | Whether the SDK resolved the screenshot resource into artifact refs. |
| SDK/main tool screenshot | `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs` | Tool screenshot stage and payload. |
| Main screenshot bridge | `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs` | Upload/fetch path for screenshot artifacts. |
| Sidecar screenshot tool | `frontend/src/main/python/tools/computer/screenshot_tool.py` | Platform capture path and cursor/overlay behavior. |
| Backend artifact load | `backend/src/services/artifacts/store.py`, `backend/src/api/routes/artifacts` | Artifact lookup and binary response. |

Enable:

```bash
cd frontend
WINDIE_DEBUG_TOOL_SCREENSHOT=1 <windie> start desktop
```

Expected marker:

- `[ToolShotDebug][renderer]`

## Local-Runtime Python JSON-RPC Trace

The current local-runtime Python stdout is JSON-RPC only. Debug local-runtime Python
RPC issues by combining Electron bridge logs with local-runtime Python stderr
logs.

| Path | Code root |
| --- | --- |
| Main bridge process lifecycle | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_supervisor.cjs` |
| Main bridge request mapping | `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`, `frontend/src/main/sidecar/local_runtime_tool_args.cjs`, SDK local-runtime store/client code |
| Local-runtime Python protocol | `frontend/src/main/python/core/ipc_protocol.py`, `frontend/src/main/python/local_backend.py` |
| Tool registry | `frontend/src/main/python/tools/registry.py` |

Enable local-runtime Python debug:

```bash
cd frontend
WINDIE_SIDECAR_LOG_LEVEL=DEBUG <windie> start desktop
```

If a local-runtime result is missing, check for all of these before editing:

- Backend emitted a tool-call event with a request id.
- SDK runtime accepted the event for the active turn and claimed local execution.
- Main bridge sent a JSON-RPC request for local-runtime Python execution.
- Local-runtime Python executed a registered tool and returned a JSON-serializable result.
- SDK runtime sent the result back to the backend with the original request id.
