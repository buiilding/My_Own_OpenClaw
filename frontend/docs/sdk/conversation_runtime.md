---
summary: "SDK conversation runtime contract for normalized conversation events, dumb stores, live turn projection, conversationProjections ownership, display projections, diagnostic rehydrate snapshots, model-history resume, toolPairKeys pairing after the removed toolPairKey helper, removed renderer ToolRunnerHook callback/turn-guard tests, removed renderer transcript/rehydrate helpers, tool output content fallback behavior, removed fallbackText top-level tool-output fallback helper behavior, assistant-shaped content rejection, final_response fallback tool output rejection, compaction lifecycle handling, edit/resend resource preservation, retry revisions, and UI adapter boundaries."
read_when:
  - When changing SDK conversation state, store adapters, ConversationView, live turn projection, display projections, diagnostic rehydrate snapshots, model-history resume, edit/resend, retry, compaction replay, or desktop chat migration.
  - When resolving stale references to removed `ToolRunnerHook.callbacks.test.ts` or `ToolRunnerHook.turnGuards.test.ts`; local tool execution moved from renderer hooks into SDK runtime coordination.
  - When resolving stale references to the removed standalone `currentTurnProjection.ts` or `currentTurnProjection.js` files; current-turn projection is built in `conversationProjections.ts`.
  - When resolving stale references to removed renderer transcript helpers such as `transcriptMessagePayload.js`, `structuredToolPayload.js`, `rehydrateMessageState.js`, `rehydratePayload.js`, `transparencyNormalization.ts`, `storedTranscriptSdkProjection.ts`, `storedTranscriptMemoryState.js`, `storedTranscriptChatMessageState.js`, `desktopTranscriptProjectionRuntimeClient.ts`, `pendingTranscriptMessages.ts`, `pendingAssistantQueue.ts`, `pendingUserQueue.ts`, `transcriptPendingFlush.ts`, `TranscriptPendingFlush.test.ts`, or `transcriptRecordWrite.ts`.
  - When debugging edit/resend resource preservation, retry resource preservation, missing screenshot refs, or attachment metadata lost across revisions.
  - When debugging skipped compaction display, replay/rehydrate drift, duplicate transcript rows, tool-pair matching, removed `toolPairKey` helper references, tool output content fallback behavior, removed `fallbackText` helper references, `normalizeToolOutputContent` searches, assistant-shaped content fields, final_response fallback tool output fields, or custom UI/CLI conversation behavior.
  - When debugging TypeScript `ToolExecutionCoordinator` claim failures, SDK-shaped local execution events, or direct snake_case SDK tool events that remain unclaimed.
title: "SDK Conversation Runtime"
---

# SDK Conversation Runtime

The TypeScript SDK owns the reusable client-side conversation runtime. The
Electron desktop is the flagship client, but it should consume SDK projections
instead of privately shaping transcript, replay, tool, and compaction state.
External app authors normally use `AgentClient.wakeUp(...)` and
`agent.conversation(...)`. The built-in Electron desktop is a first-party SDK
host, so its app runtime facades may use lower-level SDK runtime pieces such as
conversation-runtime factories, managed hosted sessions, and tool coordination
modules. The boundary rule is that Electron must not reimplement those SDK
semantics separately, and Electron-only adapters must remain isolated behind
SDK interfaces such as `ConversationStore` and `AgentRuntimeTransport`.

`AgentRuntimeEvent` is the generic SDK stream event union emitted by
`conversation.stream(...)`.

## Ownership

| Surface | Owner | Notes |
| --- | --- | --- |
| normalized conversation events | SDK runtime | immutable audit/runtime stream and legacy display seed when no display timeline exists; not the editable display document and not normal resume context |
| event store adapters | SDK-defined interface; adapter implementation owns persistence mechanics | stores append/load events and snapshots, but do not interpret display or rehydrate shape |
| display transcript | SDK projection + display timeline checkpoints | React, CLI, and custom UIs render the projection fallback or the editable display timeline document |
| current-turn projection | SDK projection | active assistant text, reasoning text, tool rows, phase, error state, and live presentation state for UI surfaces |
| backend rehydrate payload | SDK model-history install | normal resume sends backend-normalized model-history checkpoints, not display/runtime-event projections |
| model-history checkpoints | backend-normalized contract + SDK store adapters | provider-neutral, bounded inference rows persisted separately from full display/runtime events; normal resume installs these checkpoints and skips backend hydration when no checkpoint exists |
| tool execution coordination | SDK runtime | claimed local tools must return exactly one backend result or failure |
| local tool execution | SDK local runtime | the local runtime runs local-runtime-backed tools; it does not own conversation replay semantics |
| backend provider history | backend | provider-safe history remains backend-owned after result ingress |

The package root exposes conversation runtime, store, event, and projection
contracts for host UIs. The lower-level reducer and event-scope helpers
(`createInitialConversationRuntimeState`, `reduceConversationRuntimeState`,
`getConversationEventScope`, and related scope predicates) are implementation
helpers owned by their `runtime/conversationReducer` and
`runtime/conversationEventScope` modules rather than package-entrypoint API.
Trace recording, turn-input resource resolution, and default resource resolver
construction follow the same rule: they stay in their owner modules
(`runtime/TraceRecorder`, `runtime/TurnInputPipeline`, and
`runtime/DefaultTurnResourceResolvers`) and are consumed by SDK runtime classes
instead of being published as package-root API.

### Conversation Document Authority

The conversation runtime intentionally keeps four durable documents separate:

- `ConversationEvent[]` is append-only audit/runtime history. It keeps traces,
  lifecycle events, raw tool facts, attachment refs, and legacy fallback
  material.
- `DisplayTimelineCheckpoint` is the editable user-visible conversation
  document. `replaceRows(...)`, retry, edit/resend, and future fork flows write
  this document through revision APIs.
- `ModelHistoryCheckpoint` is the backend-normalized LLM-facing document.
  Resume/rehydrate installs this bounded provider-neutral history instead of
  rebuilding from visible rows.
- `ConversationRevision` is branch authority. Store adapters choose the current
  branch from revision metadata, then load display/model contents by the ids on
  that revision.

Host UIs must not rewrite raw events for edit/resend. Store adapters may build
display rows from events only when no display timeline checkpoint exists. A
checkpoint with zero rows is still authoritative and must clear prior visible
history for that branch.

For debugging, use:

```bash
<windie> conversation state <conversation-ref> --json
```

The diagnostic prints selected revision, parent revision, display timeline row
count, model-history row count, raw event count, and stale parent/child branch
mismatches without dumping prompt text, tool output, screenshot bytes, or
provider payloads.

## Event Model

The runtime records normalized events:

- `conversation_created`
- `conversation_loaded`
- `conversation_rewritten`
- `turn_superseded`
- `turn_started`
- `turn_completed`
- `turn_stopped`
- `turn_error`
- `user_message`
- `user_message_metadata`
- `assistant_delta`
- `reasoning_delta`
- `assistant_message`
- `tool_call`
- `tool_progress`
- `tool_output`
- `tool_bundle_call`
- `tool_bundle_output`
- `usage_updated`
- `memory_store_changed`
- `trace_event`
- `compaction_started`
- `compaction_skipped`
- `compaction_applied`
- `compaction_failed`
- `settings_updated`
- `model_history_updated`
- `runtime_error`

Every event carries `eventId`, `conversationRef`, `revisionId`, `timestamp`,
`source`, and optional `turnRef`.

Backend-origin events must use backend `event_id` as `eventId` and copy backend
`sequence` into `payload.backendSequence`. Backend `id` remains turn
correlation, not event identity. The SDK rejects backend stream events missing
`event_id` or `sequence` into `runtime_error`, ignores duplicate `event_id`
values, records `runtime_error` when a turn's backend `sequence` regresses
or jumps forward, and records a hidden `backend.event.reject` trace when the
active-turn gate rejects a backend event.

Backend-origin events are scoped before the runtime applies active-turn
filtering:

- Turn-stream events such as assistant deltas, reasoning deltas, assistant
  messages, tool events, usage, and terminal turn events must match the
  runtime's active `turnRef` when an active turn exists.
- Conversation-control events such as `compaction_started`,
  `compaction_applied`, `compaction_skipped`, and `compaction_failed` are
  accepted by `conversationRef` plus backend sequence/deduping. Their backend
  `turnRef` is a compaction operation id, not the active chat/model turn.

The reducer updates `state.activeTurnRef` only from authoritative turn lifecycle
events. `turn_started` and `user_message` may claim a new active turn.
Continuation and terminal events may keep ownership only when there is no active
turn yet or when they match the current active turn. Diagnostic and persistence
side-effect events such as `trace_event`, `memory_store_changed`, and
`model_history_updated` never claim active turn ownership, and stale old-turn
`turn_stopped` events do not replace a newer active resend turn.
`turn_superseded` is a hidden SDK control event for edit/resend and retry. It
records the superseded turn, replacement turn, revision id, reason, and
timestamp, immediately removes old-turn live authority, and lets replacement
turns continue through the normal `send()` path. After a turn is superseded,
late events for that turn may remain in raw audit history, but reducer state,
current-turn projection, display/replay projection, model-history checkpoint
installation, local tool execution, completed-turn memory persistence, title
generation, and pending-turn handoff must treat those events as inert. The SDK
records sanitized `turn.supersession` traces with
`status: ignored_for_live_authority` when late backend events are stored for
audit but ignored for live authority.
Conversation-control compaction events update `state.compaction` and replay
checkpoint state without replacing the active turn identity or changing the
active turn phase. Manual compaction after a completed turn preserves the
completed, non-busy current-turn state. Compaction during an active loop
preserves that loop's existing turn-stream phase without extending it.

`settings_updated` is the conversation-runtime record for SDK-owned settings
changes such as model/provider selection. `conversation.setModel(...)` and
per-turn `model` options write this event only after the backend settings update
succeeds. Runtime snapshots expose the latest merged settings on
`snapshot.state.settings`, but display projections and diagnostic rehydrate
snapshots do not render or replay those settings as chat/provider history.

Backend `model-history-updated` packets normalize to hidden
`model_history_updated` conversation events. They carry a provider-neutral
checkpoint id, revision id, creation timestamp, and backend-normalized
`ModelHistoryRow[]`; display projections and diagnostic rehydrate snapshots
ignore them.
`ConversationRuntime` persists the checkpoint through
`store.replaceModelHistory(...)` when the store exposes that method. `send()`
passes the active SDK `revision_id` to the backend query payload so emitted
checkpoints can prove which display revision they belong to.

Runtime snapshots expose `snapshot.currentTurn` alongside `state`, `display`,
and `rehydrate`. The current-turn projection is the SDK-owned live-turn view for
UI adapters:

- `phase`: `idle`, `awaiting`, `streaming`, `tool_call`, `tool_output`,
  `complete`, or `error`
- `assistantText`: accumulated assistant deltas or final assistant text
- `reasoningText`: accumulated reasoning/thinking deltas
- `toolEvents`: normalized tool call/progress/output rows
- `lastError`: normalized terminal runtime error text
- `presentation`: SDK-owned live-turn UI contract with ordered visible entries,
  `hasVisibleContent`, `typingVisible`, `overlayVisible`, `isBusy`, and
  `isTerminal`
- Renderer surface, visible-lifecycle, response-overlay, thread presentation,
  live-turn side-effect, and trace-counter adapters treat the presence of
  `presentation` as the SDK-owned visual contract: visible rows, derived
  stream/tool effects, and trace summary counts come from
  `presentation.entries`, terminal error display from `presentation.lastError`,
  overlay thinking text from thinking entries, and busy/terminal lifecycle from
  presentation fields plus phase. They must not scan raw `assistantText`,
  `reasoningText`, or `toolEvents` to decide overlay/thread visibility, side
  effects, or trace counts when a presentation object exists.
- `presentation.entries[*].sourceChannel`: SDK presentation metadata uses
  `sdk:current-turn`; host IPC channel names are adapter details and must not
  leak into reusable SDK projections
- Tool presentation entries carry SDK-owned preview `text` plus explicit
  display fields such as `modelFacingToolCall`, `toolArguments`, `toolCallDetails`,
  `toolOutputDetails`, `toolMetadata`, `toolDisplayMetadata`, normalized
  bundled `toolCalls`, recovery fields (`toolCallValidationFailed`,
  `rawToolCallPreview`, `rawArgumentsPreview`, `parseError`), typed
  `attachments[]`, compatibility screenshot refs/URLs, `executionTime`,
  `success`, and `executionSkipped`. SDK projection builds live tool-call
  preview text from recovery previews or normalized tool identity/arguments, so
  renderer adapters should render live tool calls and tool outputs from entry
  `text` and typed display fields instead of decoding `modelFacingToolCall`,
  `toolOutputDetails`, backend-wire event payloads, or whole-message screenshot
  aliases. Screenshot aliases remain compatibility metadata for replay/provider
  boundaries.

Runtime snapshots also expose `snapshot.view`, and callers may use
`conversation.getView()` or `conversation.subscribeView(...)` for the Phase 0
SDK-owned `ConversationView` projection. The view is the normal UI contract that
collapses display rows, live turn entries, surface modes, and action
capabilities into one conversation-scoped object:

Display rows carry SDK-authored `metadata.toolCallDetails` and
`metadata.toolOutputDetails` for renderer tool cards. Renderer adapters should
pass those detail records through as component metadata and must not rebuild
them by copying request ids, bundle ids, tool-call ids, raw payloads, structured
payloads, attachment aliases, or provider/model fields out of generic row
metadata.

```text
ConversationView = displayRows + liveTurn + surfaces + actions
```

The view filters internal `conv-agent-*` lanes out of normal UI authority. Those
lanes remain available to diagnostics as counts and raw event/trace inspection,
but they must not replace the active display rows, live turn, response overlay
owner, busy state, or action metadata for the user-facing conversation. If an
internal lane is the only build input, the SDK view is idle with a hidden
response overlay; Electron main does not carry a separate `conv-agent-*`
responsebox-name filter as normal surface policy. During the migration,
existing `snapshot.currentTurn` remains available so
renderer/main surfaces can move one at a time; desktop renderer display-row
facades no longer consume `snapshot.displayRows` as normal UI input.
The response overlay is migrated first: renderer adapters render
`snapshot.view.liveTurn.entries` and Electron main applies
`snapshot.view.surfaces.responseOverlay`. Raw
`snapshot.currentTurn.presentation.overlayIntent` remains available only as
legacy payload/debug input and no longer controls the native responsebox when
the main-process live surface controller applies normal UI state.
The minimal pill and dashboard control surfaces also consume the view for the
busy/Stop contract: `snapshot.view.surfaces.pill.mode` drives the pill loop
lock, `snapshot.view.surfaces.dashboard.mode` drives the dashboard composer
loop lock, and `snapshot.view.liveTurn.canStop` drives Stop availability in
renderer and Electron-main Stop shortcut resolution.
The pill response-overlay `turnId` is also resolved inside the app runtime from
SDK response rows, SDK overlay intent, visible lifecycle, or the pending bridge;
React hooks pass those inputs through instead of composing renderer-owned
turn-ref fallbacks.
Renderer pending-turn state remains a short pre-view bridge immediately after
send acceptance; raw current-turn snapshots and idle conversation refs must not
enable Stop or become the main-process stop target, even before a view arrives.
That bridge may carry turn identity, text, and timestamps, but it must not
carry filename metadata, visual attachment lifecycle descriptors, screenshots,
preview bytes, or ready artifact refs. SDK display rows and
`ConversationView` own user-included image, camera screenshot, and replay
attachment presentation. Renderer display projection may synthesize only this
explicit `pendingTurn` bridge beside SDK display rows; it must not scan prior
`renderer-compose` chat messages and carry them forward as visible user rows.
Conversation-view chat projection receives renderer annotation records, not raw
current chat messages, when copying local feedback state onto SDK rows.
Raw current-turn snapshots remain live context for migrated display/surface
handoff and diagnostics, while normal Stop authority is only the view or the
local pending bridge. Minimal live surfaces receive a null raw current-turn
projection whenever a `ConversationView` exists, so the pill and response
overlay do not run a separate "latest current turn wins" decision beside the
SDK view. Dashboard chat selectors apply the same rule for the active
conversation: once `conversationView` is present, dashboard live rows, busy/Stop
state, and action wiring receive `currentTurnProjection: null` and use the SDK
view as the only normal UI authority.
Renderer no longer retains a global raw `latestCurrentTurnProjection` in the
chat store or consumes it as a normal UI authority; cross-surface live state
comes from `latestConversationView`, while per-workspace current-turn
projections remain only the temporary no-view bridge for unmigrated/pre-view
snapshots and diagnostics.
Electron main also hydrates newly tracked renderer windows with the cached
`ConversationView` on the `windie:current-turn` envelope, so renderer reloads
enter the same view-owned path as live runtime updates instead of starting from
a raw current-turn-only sync.
Renderer current-turn IPC adapters should treat a valid `presentation.entries`
array as the normal current-turn shape and must not require raw `assistantText`
or `toolEvents` when presentation exists. The raw field requirement remains
only for legacy no-presentation snapshots.
For the Phase 3 transcript migration, Electron renderer projects dashboard
messages from `snapshot.view.displayRows` when a current-turn payload includes
the view, and dashboard busy state reads `snapshot.view.surfaces.dashboard.mode`.
Dashboard thread live rows also render from `snapshot.view.liveTurn.entries`
whenever a view exists; SDK view construction removes discrete tool-call,
tool-output, and tool-progress live entries once the same tool event has
materialized in `snapshot.view.displayRows`, so a tool card has one UI row
owner. Legacy no-view tool-call rows must still preserve request identity from
the tool event or nested payload as the renderer `correlationId`, because
display-row reconciliation keys live/materialized tool cards by that identity
before falling back to tool name or text. Raw
`snapshot.currentTurn.presentation.entries` and phase-derived current-turn rows
remain only as the no-view bridge and must not append visible rows beside the
SDK view.
The `conversation.loadDisplay` command also carries `snapshot.view`, and
desktop renderer display-row facades consume `snapshot.view.displayRows`
without falling back to legacy `snapshot.displayRows`. SDK snapshots may still
carry `snapshot.displayRows` for SDK/custom callers and diagnostics, but the
Electron command payload and renderer transcript loaders no longer use it as a
normal UI authority.
Dashboard conversation opening stores the returned `ConversationView` in the
chat store before projecting messages from `view.displayRows`, so resumed
dashboard chats use the same SDK view authority as active chat surfaces.
The renderer dashboard conversation library facade exposes only
`loadConversationView` for this path; raw display-row and legacy display-message
load helpers remain outside normal React dashboard resume ownership.
For the Phase 4 action migration, renderer chat surfaces no longer turn
`snapshot.view.actions.canEdit` or `snapshot.view.actions.canRetry` into a
global message-list gate. `snapshot.view.displayRows[]` carries row `actions`
metadata with `canEdit`/`editTargetRowId` for user rows and
`canRetry`/`retryTargetRowId` for terminal assistant rows. The renderer projects
those row targets into chat messages so a replacement row can remain the visible
edit surface while replay targets the SDK-provided original row identity;
row-level SDK action metadata gates whether the edit/resend or Try again
controls are shown, and missing row action booleans on SDK display rows mean
the command is unavailable rather than defaulting to a renderer heuristic.
Renderer message-list controls apply the same rule for all rows: copy and
feedback remain renderer-local affordances, but edit/resend and Try again are
shown only when row `actions.canEdit` or `actions.canRetry` is explicitly
`true`.
Renderer display-row adapters do not JSON-stringify malformed content for row
types whose SDK contract owns string content, such as user, assistant,
tool-output, and progress rows. Producers must normalize those rows before they
reach `ConversationView`; the renderer may only stringify SDK-declared
structured tool rows such as tool calls and bundle outputs for component
compatibility.
Renderer display-row and live-turn adapters also keep SDK attachment
descriptors on the typed `attachments[]` prop only. Tool detail panels may
receive display identity fields such as `toolName`, `requestId`,
`correlationId`, `bundleId`, `toolCallId`, and `success`, plus SDK-authored
display details, but component correlation identity comes from the SDK-authored
`displayCorrelationId` field. Renderer adapters must not recover correlation
identity by trying request, bundle, tool-call, or legacy correlation fields in
fallback order. Tool detail panels must not receive provider-facing
`modelFacingToolCall`, model-selection metadata, raw payloads, screenshot
aliases, or SDK attachment lifecycle descriptors as generic detail payload.
Copy/feedback actions remain renderer-local affordances. Renderer
replay execution calls the SDK edit/resend and retry commands directly; when a
`ConversationView` exists, replay target preparation derives its row model from
`ConversationView.displayRows` instead of raw `chatStore.messages`.
`ChatInterface` no longer passes a replay row model or fallback transcript into
replay hooks. The renderer's temporary replay bridge retains already projected
visible prefix rows as UI rows only; it does not filter tool pairs, reconstruct
model context, or provide fallback rows for replay command resolution.
React replay hooks do not select store `activeConversationRef`, `addMessage`,
or skin failure copy for replay orchestration; `desktopConversationReplayRuntime`
resolves active conversation state from its store dependency and leaves replay
failure display to SDK/main conversation events rather than publishing a
renderer-local row. SDK replay commands own the durable child revision and
provider-safe replacement history.
Thread presentation no longer accepts caller-built `currentTurnMessages` as an
alternate live-row input; no-view live rows must come from the SDK current-turn
projection/presentation adapter, and `ConversationView` remains the normal
read model once present.
When a caller supplies `ConversationView`, thread presentation accepts only
SDK display-row messages plus the explicit renderer pending-send bridge as its
base rows. Raw renderer transcript rows are ignored in that mode so view-owned
live rows cannot be positioned, deduped, or suppressed by stale chat-store
messages.

For debugging, use:

```bash
<windie> conversation view <conversation-ref> --json
```

The diagnostic prints active revision id, display row count, live turn ref and
phase, response overlay mode and guard ref, pending turn ref, superseded turn
count, filtered internal lane count, model-history checkpoint id, and last
SDK/backend event refs. It does not print message text, raw tool output, local
paths, screenshots, provider payloads, credentials, or internal lane details.

### Removed Standalone Current Turn Projector

Current-turn projection is not a separate projection module. The removed
standalone `packages/windie-sdk-js/src/projections/currentTurnProjection.ts`
and generated `cjs/projections/currentTurnProjection.js` files must not be
reintroduced. `packages/windie-sdk-js/src/projections/conversationProjections.ts`
owns `buildCurrentTurnProjection(...)`, the live-turn presentation builder, and
the display/rehydrate projection helpers so one event sequence produces the
same transcript, active-turn, and replay views.

Electron main emits the projection to renderer surfaces on the SDK current-turn
IPC payload. Renderer overlays should render `view.liveTurn.entries` when a
`ConversationView` is present, falling back to `currentTurn.presentation.entries`
only for non-migrated hosts. If `currentTurn.presentation` exists, an empty
`presentation.entries` array is authoritative for overlay and thread
presentation and must not trigger raw `assistantText`/`toolEvents` row
synthesis. They must not independently interpret backend-wire stream/tool
events or synthesize current-turn chat messages.
Conversation-control compaction events are not current-turn events: they must
not reset the current-turn anchor to a compaction operation id, set
`presentation.isBusy`, or turn a manual compaction failure into an assistant
turn error. Compaction status remains available through `state.compaction` and
display/debug projections.
Electron main emits SDK-normalized conversation side-effect events separately
as `conversation-event`; chat transcript/session handlers consume that channel
instead of subscribing to raw `from-backend` stream semantics.
When a same-turn `currentTurn` projection is present, renderer backend-wire
compatibility handlers should not build duplicate live assistant/tool rows or
own chat stream normalization. Backend-wire events may remain as compatibility traffic for
non-chat consumers, diagnostics, or legacy hosts that do not emit the SDK
projection.
Renderer live-turn presentation adapters should render explicit SDK
presentation-entry fields such as `toolCallDetails`, `toolOutputDetails`,
`toolArguments`, `toolCalls`, and identity refs; they should not recover tool
display details from raw `payload` or `structuredPayload` fallbacks.
Older renderer fallback adapters that read `snapshot.currentTurn.toolEvents`
directly follow the same boundary: use projected tool-event fields and
projected detail objects, not backend-wire payload recovery.

### Removed Renderer Transcript and Rehydrate Helpers

Renderer-local transcript payload, transparency normalization, rehydrate, and
pending-write helper files were removed from the active runtime path. Stale
searches for `transcriptMessagePayload.js`, `structuredToolPayload.js`,
`rehydrateMessageState.js`, `rehydratePayload.js`,
`transparencyNormalization.ts`, `storedTranscriptSdkProjection.ts`,
`storedTranscriptMemoryState.js`, `storedTranscriptChatMessageState.js`,
`desktopTranscriptProjectionRuntimeClient.ts`, `pendingTranscriptMessages.ts`,
`pendingAssistantQueue.ts`, `pendingToolQueue.ts`, `pendingUserQueue.ts`,
`transcriptPendingFlush.ts`, `TranscriptPendingFlush.test.ts`,
`transcriptEntryPersistence.ts`, or `transcriptRecordWrite.ts` should route
here.

Current ownership:

- SDK conversation runtime owns normalized conversation events, display rows,
  replay/diagnostic rehydrate snapshots, and model-history-backed resume
  install.
- Electron/renderer app-runtime facades call SDK continuity APIs; they do not
  rebuild transcript payload or backend rehydrate shape from renderer-local row
  helpers.
- Renderer transcript modules are adapters for session identity, SDK-backed
  stores, and display projection consumption.

Normal inference-context resume must call `ConversationRuntime.rehydrate()` so
the SDK can choose the backend `model_history` payload when a checkpoint exists.
Electron/main or renderer code must not convert `snapshot.rehydrate.messages`
back into a backend `rehydrate-conversation.payload.messages` request for the
send path. `RehydrateSnapshot.messages` is a fallback/debug projection and only
uses backend fallback entry fields; model-history-only fields such as
`image_refs`, `source_display_row_ids`, and `compaction_facts` stay inside the
`model_history.rows[]` transport payload.

Live current-turn projection is emitted from the runtime's in-memory event
sequence before durable store append completes. Local-runtime-backed persistence is
allowed to lag behind a streamed chunk, but it must not block the active
assistant text, phase, tool events, or completion state used by dashboard,
response overlay, and minimal chat pill surfaces.

Backend stream events are processed by the conversation runtime through one
serialized queue. Backend-origin events must not mutate runtime state, durable
storage, local-tool execution, completed-turn memory, or terminal notifications
from overlapping fire-and-forget handlers.

Completed-turn memory persistence is terminal-turn behavior owned by
`ConversationRuntime`. `send()` opens a pending-turn ledger entry keyed by
`turnRef` with the original user text. A backend `turn_completed` event consumes
that ledger entry and persists memory from `{ userText, assistantText }`.
Completed-turn memory must not rediscover the user query by scanning historical
conversation events or store rows. If a terminal backend event has no pending
ledger entry, the SDK skips memory storage without emitting a memory-store
invalidation.

Completed-turn memory persistence is a side effect after the terminal event has
already been stored, reduced, and emitted to subscribers. It must not block the
serialized backend event queue, active-turn updates, or later edit/resend
replacement turn streams. Slow embedding calls, local-runtime memory failures,
or memory trace rows from an old turn are allowed to complete after a newer turn
has started, but they must not delay system prompt, tool schema, assistant
delta, or terminal events for that newer turn.

`trace_event` is the SDK-owned durable path trace row. It is stored in the same
conversation event ledger as normal conversation events, but display projections
and diagnostic rehydrate snapshots must ignore it. A trace row records sanitized runtime
timeline metadata such as `traceId`, `spanId`, `path`, `stage`, `status`,
`runtime`, timestamps, duration, ids, counts, limits, and sanitized error
summaries. It must not store user message text, retrieved memory text,
embedding vectors, screenshots, file contents, raw provider payloads, secrets,
or raw SQL rows.

Backend-origin `trace-event` payloads follow the backend API schema's camelCase
trace fields such as `traceId`, `spanId`, `requestId`, and `durationMs`.
Conversation identity remains on the backend event envelope as
`conversation_ref`, `turn_ref`, and `user_id`; SDK normalization does not read
snake_case trace payload aliases.

After completed-turn memory is successfully stored, the SDK emits
`memory_store_changed` with the authenticated `userId`, `conversationRef`,
changed memory types, `reason: "completed_turn"`, and the memory id when the
local runtime returns one. Hosts should treat this as an invalidation signal and
reload memory display data through SDK memory APIs. Skipped or failed
completed-turn memory persistence does not emit `memory_store_changed`, so open
memory surfaces do not refresh against unchanged storage.

Generated conversation titles are also terminal-turn enrichment owned by
`ConversationRuntime`, but they are best-effort and asynchronous after the
completed-turn snapshot is emitted. After the first successful assistant text
completion for a conversation, the SDK checks local-runtime title state; if there is
no locked, manual, model, or unknown durable title, it calls the hosted title
route with the first completed user/assistant pair and active model/provider
metadata, then persists the result through the local
`update_conversation_title` RPC. Title generation failures, empty titles, and
the backend fallback title `New chat` do not affect transcript persistence,
turn completion, sidebar visibility, or replay. The first user message remains
the deterministic title fallback until a generated title is persisted.

Renderer surfaces must not fall back from `currentTurn` to renderer
`streamTracking` or `response-overlay-phase` for active turn state.
`streamTracking` remains telemetry/transcript bookkeeping, and
`response-overlay-phase` remains an Electron window/layout signal only.

`ConversationRuntime.send()` emits `turn_started` and a base `user_message`
before SDK memory enrichment or backend transport. If enrichment changes
display metadata such as screenshot refs or attachment filenames, the runtime
emits `user_message_metadata`; the display projection merges that metadata into
the existing turn-scoped user row without changing the row identity. If backend
transport fails after the base row exists, the runtime emits a terminal
`turn_error` so typing state and overlays settle from SDK state rather than a
renderer-local failure row.

The display projection is the canonical live and historical transcript state.
It renders user, assistant, tool, and terminal error rows from canonical
conversation events. During a live turn, `assistant_delta` and
`reasoning_delta` events update turn state, but reasoning-only deltas do not
reserve a visible assistant display row. The first assistant-visible delta
creates the stable streaming assistant row at the current transcript position
and carries any prior reasoning metadata. When the final `assistant_message`
event arrives, that same row identity becomes the completed assistant row.
Desktop dashboard and renderer transcript facades render
`snapshot.view.displayRows`; SDK/custom no-view callers may render
`snapshot.displayRows`. Normal UI consumers must not reconstruct transcript
rows from `snapshot.currentTurn`. `snapshot.currentTurn` remains the SDK-owned
phase/status/overlay projection for busy state, stop eligibility, active turn
identity, and overlay-specific progressive state.
Desktop may render a temporary, textless thinking disclosure from
`snapshot.currentTurn.presentation.entries` while a turn is active, but that
disclosure is not a transcript assistant row and must disappear once the SDK
display row contains assistant-visible text for the same turn. Raw
`snapshot.currentTurn.reasoningText` is legacy no-presentation fallback context
only.

Terminal `turn_error` and `runtime_error` events are authoritative for their
turn. If assistant text or deltas were already projected for the same
`conversationRef` and `turnRef`, the display projection replaces that same-turn
assistant row with the error row, and the current-turn projection clears
`assistantText`. Renderer surfaces must show the terminal error, not a prior
empty-response fallback or partial assistant text from the failed turn.

## Store Rule

Stores expose first-class projection loaders, but they should stay dumb:

```text
store.loadForDisplay(conversationRef)
  -> store.loadEvents(conversationRef)
  -> SDK display projection

store.loadForRehydrate(conversationRef)
  -> active model-history checkpoint snapshot, when present
  -> diagnostic/export fallback projection for legacy no-checkpoint conversations

store.replaceDisplayTimeline(checkpoint)
  -> persist an editable display timeline checkpoint for a child revision

store.loadDisplayTimeline({ conversationRef, revisionId? })
  -> load the active editable display timeline checkpoint for a revision

store.replaceModelHistory(checkpoint)
  -> persist provider-neutral bounded model-history rows for a revision

store.loadModelHistory({ conversationRef, revisionId? })
  -> load the active provider-neutral checkpoint for backend install during normal resume
```

SDK callers use the matching public revision primitives:

```text
conversation.loadDisplayTimeline({ revisionId? })
conversation.loadModelHistory({ revisionId? })
conversation.listRevisions({ limit? })
conversation.replaceRows({ rows, baseRevisionId, reason })
conversation.fork({ sourceRevisionId, cutAfterRowId?, newConversationRef? })
conversation.checkoutRevision({ revisionId })
```

Electron main and renderer hosts expose those same revision primitives through
SDK-shaped commands: `conversation.listRevisions`,
`conversation.checkoutRevision`, and `conversation.fork`. Normal UI branch
forks pass only source revision intent and let the SDK generate the new
conversation ref; explicit `newConversationRef` remains available for callers
that need a predetermined fork id.
navigation calls that command/service boundary instead of reconstructing
display prefixes or model-history rows in renderer code. The dashboard
revision menu lists sanitized revision metadata, checks out selected revisions
from the returned SDK `ConversationView`, and forks selected revisions by
calling the SDK fork command with the selected `sourceRevisionId`. When
`cutAfterRowId` is omitted, the SDK resolves the selected revision's last
display row and returns the forked SDK view to the newly active conversation,
so renderer code does not load display timelines just to reconstruct a branch
prefix. Renderer revision controls receive app-runtime-prepared menu items:
the adapter owns revision id normalization, active-row metadata,
checkout/fork action ids, disabled state, and checkout-result active revision
marking, while React renders the item and sends only the selected
checkout/fork intent to SDK commands. Renderer
app-runtime facades should not expose direct display timeline
load/replace helpers to React; low-level timeline mutation remains SDK/main
command-handler and diagnostics ownership. Diagnostics can inspect a
selected branch view with
`<windie> conversation view <conversation-ref> --revision <revision-id>` and
can inspect the matching storage ownership state with
`<windie> conversation state <conversation-ref> --revision <revision-id>`;
those revision-scoped diagnostics must not borrow live-turn or overlay state
from the active branch.

Do not implement separate role/message/tool interpretation inside each adapter.
The adapter methods are API conveniences; they must delegate to shared SDK
projection builders or to a complete active compacted replay snapshot. This
keeps desktop, CLI, web, and tests on one interpretation path.

Model-history checkpoint methods are the ADR 008 migration surface. They do not
make display rows, runtime events, and backend active history interchangeable:
checkpoints store bounded model-facing rows only, while full tool output and
display attachments remain in display/runtime history.
When backend `model-history-updated` rows omit `sourceDisplayRowIds`, the SDK
enriches persisted checkpoint rows only when the current display projection can
match role/message-type order unambiguously. Unmatched rows keep an empty source
list and are not guessed into edit/fork child checkpoints. Inference stops after
`context_compaction` rows unless a later model row carries explicit display
provenance, so compacted model-history tails do not bind to old visible rows.
Normal `ConversationRuntime.rehydrate()` and
`ConversationContinuityService.rehydrateFromStore(...)` prefer
`loadModelHistory(...)` and send `rehydrate-conversation.payload.model_history`
with an empty `messages` array. The backend installs those rows directly into
session history. If no checkpoint exists, normal resume skips backend
hydration instead of rebuilding provider history from display/runtime events.
No storage migration is required for the new checkpoint format; older
no-checkpoint conversations remain inspectable through display and diagnostic
snapshot loaders, but they need a model-history checkpoint before continuation
can preserve prior model context.

## Display Timeline Rule

`ConversationRuntime.loadDisplayTimeline()` loads the first-class editable
display document when a store has one, and otherwise falls back to
`loadDisplayRows(...)` from the event projection. `replaceRows(...)` creates a
child display revision, validates that submitted rows belong to the active
conversation and base revision, normalizes row indexes and revision metadata,
checks basic tool-output pairing, and persists the result through
`store.replaceDisplayTimeline(...)`. When the base revision has a model-history
checkpoint with `sourceDisplayRowIds`, `replaceRows(...)` also writes a child
model-history checkpoint containing only rows whose source display ids are all
still present in the retained display prefix. Rows without display provenance
are not guessed into the child checkpoint; this avoids carrying stale inference
context after an edit.

This API is the foundation for edit/resend and retry replay. It does not
rewrite raw runtime events. Raw events remain the audit/runtime log; display
timeline checkpoints are the user-editable document. Runtime snapshots prefer
the active display timeline checkpoint and append same-revision live send rows
on top of it, so a replacement becomes visible state instead of a side table.
`conversation.loadDisplayTimeline(...)` returns that same merged editable
document when a checkpoint exists; callers must not receive a stale checkpoint
prefix that excludes later same-revision replacement send rows.
The SDK records a sanitized trace event with row counts, revision ids, and
reason only. No migration is required for adding the checkpoint table or store
methods: conversations without display timeline checkpoints continue to
project display rows from events until a replacement writes the first
checkpoint.

The local-runtime store records display replacements as durable revision graph
nodes, not only active display checkpoints. Each node keeps the revision id,
parent revision id, operation (`edit`, `retry`, `fork`, `send`, `compact`, or
`manual_rewrite`), display timeline id, model-history checkpoint id when one
is attached, timestamps, and active state. The public `getRevision(...)` path
still returns the active head for existing callers, while
`loadDisplayTimeline({ revisionId })` and `loadModelHistory({ revisionId })`
can inspect inactive ancestors.

`checkoutRevision(...)` is an SDK runtime checkout primitive for existing
display revisions. It requires a stored display timeline for the requested
revision, moves the runtime head to that revision, returns the matching
model-history checkpoint when one exists, and records only sanitized checkout
trace metadata. A later runtime reload must preserve that explicit checkout
selection rather than drifting back to the store active head; the resulting
`ConversationView` scopes live-turn, busy/Stop, and response-overlay authority
to events from the selected revision only. It does not rebuild backend history
from raw events.

Fork uses the same display timeline boundary. `conversation.fork(...)` copies
the selected display prefix into a new conversation revision with reason
`fork`, copies only model-history rows whose `sourceDisplayRowIds` are wholly
inside that prefix, and leaves the source branch unmodified aside from a
sanitized runtime trace. If callers omit `cutAfterRowId`, the SDK uses the last
display row in the selected source revision so whole-revision fork UI does not
need to load display rows first. Store metadata must list fork children from
their active display checkpoint even before the child has raw events; after the
child continues, the forked display prefix can still provide the title while
newer child events provide the last-message tail. Forked `ConversationView`
loads from the child display checkpoint and starts idle until that child branch
has its own runtime events; source-branch display rows and model-history
checkpoints remain inspectable by revision id.

When a display timeline row already represents a raw event under a stable row
id or `metadata.eventId`, runtime snapshots must not append a second visible
row for that event. The same applies to same-revision event rows with the same
visible turn/type/content key, which prevents checkout and fork views from
duplicating rows when stored display rows use user-facing row ids rather than
raw event ids.

Metadata pagination and search helpers stay in the `conversation/metadata`
owner module for SDK stores and runtime classes. Public package-root callers
should use `agent.listConversations(...)`, `agent.searchConversations(...)`,
or store methods such as `listMetadata(...)` and `searchMetadata(...)` instead
of importing `applyConversationMetadataPagination(...)` or
`searchConversationMetadata(...)` from the entrypoint.

The SDK ships two reusable store adapters:

- `InMemoryConversationStore` for tests, demos, and short-lived processes.
- `FileConversationStore` for Node CLI/custom UI hosts that want durable JSON
  event logs without Electron local-runtime storage. Same-conversation mutations are
  serialized inside the adapter so overlapping append/rewrite/replay/delete
  operations do not lose events through read-modify-write races.
- `LocalRuntimeConversationStore` for Node/Electron hosts that want durable
  local-runtime storage through the SDK store interface instead of renderer IPC
  transcript helpers. The canonical module path is
  `stores/LocalRuntimeConversationStore`. The Electron dashboard
  conversation library uses this store for metadata operations such as list,
  search, delete, and generated-title invalidation refreshes. The desktop
  conversation store adapter also delegates its read/projection conveniences to
  this SDK store. Metadata rows read from the local runtime use canonical snake_case
  local-runtime fields such as `conversation_id`, `revision_id`,
  `last_timestamp`, `entry_count`, `workspace_path`, and `workspace_name`;
  removed camelCase row aliases are ignored. Desktop supplies Electron-specific
  write enrichment such as workspace binding and attachment extraction through
  the store's host write-params hook, while the SDK store still owns the
  local-runtime write RPC.
  Rewrites send `newRevisionId` as explicit conversation revision metadata; the
  local runtime stores that revision separately from preserved event rows so
  `getRevision()` and metadata listing advance even when the rewrite keeps only
  old events or no events.

`AgentClient.wakeUp(...)` enables persistence by default. When a local
runtime is available, the agent default store is `LocalRuntimeConversationStore`;
callers only need to pass `store` when they intentionally want a non-default
adapter. Set `persistence: false` for an in-memory session.

`LocalRuntimeConversationStore` stores backend producer metadata separately from
local order. Backend events write `producer = "backend"`,
`producer_event_id = eventId`, and `producer_sequence =
payload.backendSequence`. SDK, UI, and local-runtime-created events write
`producer = "sdk"` and keep SDK-owned event ids. The local runtime still assigns
`message_index` locally, and display/replay loading orders by `message_index`
rather than backend sequence.

Electron's local-runtime-backed store is a first-party adapter. It is allowed to know
about transcript storage IPC, but it must stay behind the SDK store interface.
Desktop chat code should call public conversation commands through the desktop
runtime facade and render SDK projections, not depend on the adapter as its
normal feature-code surface.

Desktop stored-conversation rehydrate is also SDK-continuity-owned.
Feature/session helpers ask `DesktopConversationContinuityService.rehydrateFromStore(...)`
to load the active model-history checkpoint from the configured store and send
the backend rehydrate command.
They should not fetch display/runtime projections and shape provider history
themselves.

Desktop compaction replay persistence follows the same rule. Chat stream
handlers render visible lifecycle/debug state from SDK `compaction_*` events and
build complete active replay snapshots from the SDK-normalized compaction
payload before delegating persistence through the desktop conversation
continuity service.

## History DB Read Model Boundary

Electron local-runtime-backed stores persist normalized conversation events in
`history/history.db` under `conversation_events`. That database exposes
`conversation_display_messages` as a diagnostic and prototyping read model for
visible chat rows, but first-party UI code should still call SDK/store display
APIs instead of reading SQLite directly.
The SDK owns display projection semantics; the SQLite view owns only a durable,
ordered subset of user messages, assistant messages, and terminal turn errors.

Use the read model for CLI inspection and future UI experiments that need a
deterministic local transcript export:

```bash
<windie> conversation messages <conversation-ref> --json
```

Do not rebuild provider history, compaction replay state, tool semantics, or
memory enrichment from `conversation_display_messages`. Those remain SDK,
backend, and memory-pipeline responsibilities.

Desktop metadata and transparency projection also consumes SDK-normalized
payloads directly. Renderer handlers should read SDK `system_prompt`,
`user_message_metadata`, `assistant_message`, and `tool_schemas_metadata` fields
instead of unwrapping backend `payload.sourceEvent` metadata diagnostics.

Desktop terminal projection follows the same rule. Renderer terminal handlers
read SDK `turn_error` and `usage_updated` payloads directly; they should not
reconstruct backend `error` or `token-count` events from `payload.sourceEvent`.
`usage_updated` is telemetry only; it should not clear live send state or
advance the response phase. Completion and error phase ownership stays with
`snapshot.currentTurn`.

Desktop reasoning projection consumes SDK thinking presentation entries from
the conversation runtime snapshot. Renderer UI/debug state may keep the source
label `llm-thought` for continuity, but the handler should not reconstruct
backend `llm-thought` events from `payload.sourceEvent`, consume normalized
`reasoning_delta` as a separate live-state path, or require raw
`currentTurn.reasoningText` when presentation exists.

Desktop assistant live text consumes SDK `llm-text` presentation entries from
the conversation runtime snapshot. Backend-wire `streaming-response`,
normalized SDK `assistant_delta` events, and raw `currentTurn.assistantText`
may still exist in the event log/snapshot for compatibility, but they should
not be renderer live-row or active-turn state fallbacks when presentation
exists.

Desktop completion projection consumes SDK `turn_completed` identity directly.
The SDK event carries `conversationRef`, `turnRef`, and `payload.userId` for
renderer transcript writes, so the completion handler should not unwrap
`payload.sourceEvent` to recover backend `conversation_ref` or `user_id`.
Completed-turn model metadata is normalized onto `payload.modelId` and
`payload.modelProvider` before runtime title generation, so runtime code does
not unwrap backend-wire payloads to recover model identity.
Active desktop completion and error phase tracking consumes
`snapshot.currentTurn.phase` and `snapshot.currentTurn.lastError`; renderer
terminal handlers should only materialize/persist transcript rows for
`turn_completed` and `turn_error`.
The current-turn projection filters benign settings-update failures and
recoverable streamed tool-call parse failures so those non-turn errors do not
become response-overlay errors.

Desktop live tool projection consumes SDK tool presentation entries from
`snapshot.currentTurn.presentation.entries`. Renderer UI/debug state may keep
source labels such as `tool-call`, `tool-output`, and `web-search-progress`,
but active tool rows and phase tracking should come from the SDK current-turn
presentation instead of a separate normalized-event live-state path. Raw
`snapshot.currentTurn.toolEvents` is legacy no-presentation fallback context
only.
When provider-native web search progress has to be rehydrated as a synthetic
`web_search` tool pair, the SDK projection uses provider-neutral display text.
Backend web-search docs remain the source of truth for whether OpenAI native,
Gemini native grounding, or Brave fulfillment produced the progress.

Desktop local-user projection consumes SDK `user_message` directly for backend
`local-user-message` echoes. Renderer UI/debug state may keep the source label
`local-user-message`, but the handler should not consume a backend-wire
`local-user-message` fallback after SDK dispatch.

Desktop tool-call transcript persistence may consume SDK `tool_call` directly.
The SDK payload exposes normalized fields such as `toolName`, `args`,
request/correlation ids, and `userId`, and SDK projection owns any backend
detail recovery before emitting renderer-visible rows. Renderer active
tool-call display should come from SDK presentation entries or SDK-authored
display rows, and should not reconstruct backend `tool-call` events from
`payload.sourceEvent`.

Desktop tool-output transcript persistence may consume SDK `tool_output`
directly. The SDK payload exposes normalized identity, request/correlation id,
tool name, and typed display attachments adapted from either
`attachments[]`/`display_attachments` or old screenshot refs. SDK projection
owns backend detail recovery and malformed-payload fallback before emitting
renderer-visible rows.
For `tool_output` and `tool_progress`, normalized `correlationId` prefers
backend `payload.correlation_id` and falls back to `payload.request_id`.
Renderer active tool-output display should come from SDK presentation entries
or SDK-authored display rows, and should not reconstruct backend `tool-output`
events from `payload.sourceEvent`.

Desktop tool-bundle transcript persistence may consume SDK `tool_bundle_call`
directly. The SDK payload exposes normalized bundle identity, correlation id,
tool list, and user id. SDK projection owns backend detail recovery before
emitting renderer-visible rows. Renderer active bundle display should come
from SDK presentation entries or SDK-authored display rows, and should not
reconstruct backend `tool-bundle` events from `payload.sourceEvent`.

## Continuity Service Rule

`ConversationContinuityService` is the SDK-owned orchestration layer for chat
continuity over any `ConversationStore`. It owns the common flow:

```text
store.loadForDisplay(conversationRef)
  -> SDK display projection

store.loadForRehydrate(conversationRef)
  -> diagnostic/export rehydrate snapshot

store.loadModelHistory({ conversationRef, revisionId? })
  -> provider-safe backend model-history payload
  -> agentRuntimeTransport.rehydrateConversation(...)
```

Electron may provide a local-runtime-backed store adapter and agent runtime transport, but
it should not duplicate projection, provider-history filtering, compacted
replay, or delete orchestration in feature code. Desktop facades can expose
commands such as `loadForDisplay`, `rehydrateFromStore`, and
`deleteConversation`, but those commands should delegate to the SDK continuity
service. Manual compaction follows the same boundary: callers use
`SdkConversationRuntime.compactHistory(...)`, and the host agent runtime transport
maps that SDK command to the backend `compact-history` control message.

Responsibility split:

- SDK owns conversation semantics, display projection, diagnostic/export
  rehydrate snapshots, model-history install, and continuity orchestration.
- Electron owns local IPC, local-runtime-backed persistence, and renderer wiring.
- Local runtime owns durable rows, ordering, list/search/title/delete queries,
  and SQLite/FAISS mechanics; the current desktop implementation remains behind
  the local-runtime boundary.
- SDK local-runtime clients own the raw local-runtime event subscription surface.
  Electron hosts classify local events such as `conversation-title-updated` at
  the main-process boundary and broadcast public invalidations such as
  `windie:conversation-metadata-invalidated` to renderer UI. The SDK
  `conversationMetadataInvalidationFromLocalRuntimeEvent(...)` helper owns that
  normalizer so host adapters do not invent local-runtime payload parsing. It reads
  the canonical local-runtime payload fields `conversation_id`, `title`, and `source`;
  removed top-level, camelCase, and `conversation_ref` aliases are ignored. UI
  adapters reload metadata from the store instead of handling raw local-runtime event
  payloads. No persisted-data migration is required for alias removal because
  title updates are transient local-runtime events.

## Compaction Rule

Backend `context-compaction-completed` with `skipped_reason` normalizes to
`compaction_skipped`. It is runtime/debug state, not assistant output.
Completed compaction without replacement history also normalizes to
`compaction_skipped` with `skippedReason: "missing-replacement-history"`; the
SDK only uses `compaction_applied` when replay-safe replacement entries are
present. SDK compaction payloads expose renderer-facing camelCase fields such as
`summaryText`, `replacementHistoryPreview`, and `replacementHistoryEntries`, so
renderer handlers do not need to unwrap `payload.sourceEvent`. Applied compaction
payloads also expose replay fields (`entries`, `entryCount`, `complete`,
`active`, `sourceRevisionId`, `sourceTurnRef`, and `createdAt`) so store
adapters can use the persisted `compaction_applied` event itself as the compacted
rehydrate base.

After applied manual compaction, backend also emits a `model-history-updated`
checkpoint for the active revision. That checkpoint is the normal resume source:
SDK store adapters persist it through `replaceModelHistory(...)`, and revision
metadata marks checkpoints containing `context_compaction` rows as `compact`
revision nodes. The `compaction_applied` event remains replay/debug state; the
model-history checkpoint is the bounded inference ledger installed on resume.

Manual compaction may use a backend operation id that differs from the current
active chat turn. The SDK preserves that id as `operationRef`/`compactionRef`
metadata and the event's `turnRef`, but compaction events are
conversation-control events and must not mutate `state.activeTurnRef`,
`state.phase`, or the current-turn projection. The renderer may show a
compaction lifecycle row, but stop eligibility and live-loop state continue to
come only from turn-stream events.

Only `compaction_applied` with actual replacement history should affect compacted
replay snapshots. A store adapter must activate a compacted replay generation
only after the generation is complete and its entry count matches.

Complete active compacted replay generations remain available through
`store.loadForRehydrate(...)` for diagnostics/export and legacy inspection, but
normal `rehydrate()` does not install compacted replay or event projections into
backend session history. Rehydrate projection keeps only complete tool-call/tool-output pairs;
dangling calls, orphan outputs, or incomplete bundle pairs stay available to
display/debug projections but are not sent back to backend provider history.
Generated rehydrate rows must carry canonical backend stored-history
`message_type` values (`user_query`, `assistant_response`, `tool_output`, or
`context_compaction`); renderer/source labels such as `tool-call`,
`tool-output`, and `assistant-message` remain display/debug labels, not backend
rehydrate message types.

## Revision and Resource Preservation Rule

Edit/resend and retry are display revision operations:

```text
visible row action/message id selects the SDK target
  -> SDK editAndResend/retryTurn resolves the stored display row
  -> SDK replaces the retained prefix plus replacement user row
  -> SDK send() sends the replacement user message as the same new turn
```

The old raw event log remains intact for audit and diagnostics. The active
display child revision hides the edited/retried suffix from the user-facing
document without deleting the original events. The replacement user row is
persisted in that child display checkpoint with the normal SDK user row id
(`<turnRef>-sdk-evt-000002-user_message`) and a `replacedDisplayRowId`
metadata pointer back to the original target. This means a repeated resend can
still resolve the original row id while the later SDK send event dedupes into
the already-persisted display row instead of appending a second user bubble.
The renderer active path calls `conversation.editAndResend` or
`conversation.retryTurn` with the stable SDK target id; it does not call
`conversation.loadDisplayTimeline`, `conversation.replaceRows`, a separate
`conversation.send`, `prepareEditAndResend`, `prepareRetryTurn`,
`conversation.rewrite_after_event`, or backend rehydrate as part of normal
edit/retry execution. The SDK commands resolve the stored target display row,
preserve display attachments and legacy screenshot refs from that row, write
the child display/model revision, emit supersession for old live work, apply
model overrides, and dispatch the replacement through the normal `send()` path.

Resource preservation comes from the target display row. Typed display
attachments become the edited pending user row's visible `attachments[]` and
the replacement send payload's `screenshot_refs`/`attachment_filenames`. When a
typed image attachment has a display-local id and a separate `screenshotRef`,
replay uses the real screenshot/artifact ref for the backend payload and carries
the typed attachment as SDK display metadata. Legacy display-row
`screenshot_refs` and single screenshot refs still flow through replay
screenshot resolution inside the SDK command. Renderer replay command payloads
must not infer or forward screenshot aliases; absent renderer payload fields
must not erase prior resolved resources without an explicit removal operation.

The Electron renderer does not publish a replay-specific pending turn, retained
display prefix, or separate replacement query. It passes row intent, edited
text when applicable, workspace context, model override, user id, conversation
ref, and no renderer-owned replacement turn ref into the SDK command. The SDK
command chooses the replacement turn ref. If the SDK command cannot resolve
the stored target row or fails, the renderer records replay diagnostics and
returns failure without rolling its own display replacement, failure row, or
resource restoration. Typed
visual `attachments[]`, screenshot descriptors, preview bytes, ready artifact
refs, and replacement event ids remain SDK display-row state.

Edit/resend can target a turn that is still awaiting or streaming. In that
case the SDK treats the replacement as an active-turn handoff: once
`editAndResend(...)` or `retryTurn(...)` accepts the child display/model
revision, it emits
`turn_superseded` for the old turn, deletes the old live authority locally,
sends a best-effort stop for active old work, and then sends the replacement
turn through the normal `send()` path. Main and renderer adapters consume the
SDK current-turn and display projections; they must not rebuild supersession by
diffing local rows, pending-turn state, or visible transcript shape. This keeps
the edit Send button usable under repeated clicks while the editable display
document remains the visible authority. If the later normal send fails after
the child display
revision is accepted, the renderer keeps the accepted child timeline visible,
appends a send-failure error row instead of rolling back to the parent
transcript. No migration is required for existing conversations; before their
first display checkpoint, the active timeline loads from the event projection
fallback.

Fork is also a revision operation rather than a raw-event rewrite:

```text
load source display timeline
  -> copy rows through cutAfterRowId, or the whole source revision when omitted
  -> copy matching bounded model-history rows into the child revision
  -> continue the child conversation independently
```

The source conversation keeps its original branch. The fork child does not copy
unbounded raw tool output into model history, and it appears in list/dashboard
metadata from the active display checkpoint without flattening ancestor events.

## Stream Rule

`SdkConversationRuntime.stream(input)` is the canonical custom-client loop
surface. It sends the user turn, stores normalized events for display and
diagnostic snapshots, persists model-history checkpoints for resume, yields
`conversation_event` updates as backend packets normalize, and exits when the conversation reaches
`completed`, `stopped`, or `error`.

Prefer this over wiring `send()` and `subscribe()` separately in CLI or custom
UI clients. UI components can still use `subscribe()` when they only need
projected snapshots.

Backend-wire websocket packets are not the normal authoring surface. Use
`agent.subscribeRawBackendEvents(...)` only for debug traces or protocol tests;
display, rehydrate, tool execution, and compaction behavior should consume
normalized conversation events. The backend-wire normalizer remains an SDK
transport implementation detail rather than a top-level package export.

Startup surfaces should load metadata before full logs. Use
`agent.listConversations({ limit?, cursor? })` for a conversation list,
`agent.searchConversations({ query, limit?, cursor? })` for filtered metadata,
then `agent.loadConversation(conversationRef)` when a row is opened. The
`cursor` value is the last `conversationRef` from the previous page; stores
return metadata after that row in the same newest-first order. The string
shorthand returns the same projected snapshot as the object form; use
`agent.loadConversation({ conversationRef, store, revisionId })` only when a
host needs a non-default store adapter or revision seed. Deletion should go
through `agent.deleteConversation(conversationRef)` or the continuity service
so store adapters, Electron, CLI, and custom UIs share one library command
surface.

UI clients that want one high-level chat object should use
`agent.chat({ conversationRef })`. The chat session wraps
`SdkConversationRuntime` with UI-oriented methods: `stream`, `send`, `stop`,
`retry`, `editAndResend`, `load`, `display`, `onEvent`, and `subscribe`.
`chat.stream(...)` emits normalized public chat events by default:
`state`, `reasoning_delta`, `assistant_delta`, `assistant_message`,
`tool_calls`, `tool_outputs`, and `error`. Bundled tool calls and outputs are
presented as the same plural arrays used for single tools; callers should render
the array length and not branch on bundle-specific event names.

Backend events must carry `conversation_ref` or `turn_ref` to enter a
conversation runtime. The runtime drops ambiguous packets and ignores packets
whose `conversationRef` or active `turnRef` does not match the runtime. This is
what keeps two conversations on the same websocket from sharing streamed chunks
or stale tool events. The active-turn match applies to turn-stream events only;
conversation-control compaction events are accepted by matching
`conversationRef` because their `turnRef` identifies the compaction operation.

Explicit `rehydrateMessages(...)` payloads must carry their own
`conversation_ref`. The runtime forwards that identity as supplied instead of
repairing missing values from the active runtime conversation.

## Tool Rule

When the SDK claims a local tool call or bundle:

1. execute through the local runtime adapter
2. send `tool-result` or `tool-bundle-result` to backend
3. append normalized `tool_output` or `tool_bundle_output`
4. notify UI subscribers through projections and notify public stream callers
   through `tool_calls` / `tool_outputs` arrays

Malformed or unclaimable tool events should remain unclaimed or become explicit
failures; they should not be marked display-only without a backend result path.
When a local runtime is available but a backend tool event is missing the fields
needed to claim execution, the SDK stores a `runtime_error` with
`reason: "malformed_tool_event"` instead of invoking the local runtime or inventing a
backend result id.

`SdkConversationRuntime` can be constructed with a `localRuntime` adapter. In
that mode, backend `tool-call` / `tool-bundle` wire payloads first pass through
the SDK backend-event normalizer. The normalizer is the only place that maps
backend snake_case fields into SDK-shaped local execution events: single calls
become `toolName`, `requestId`, `correlationId`, and `toolCallId`; bundle calls
become `bundleId` plus executable step rows shaped as `name`, `args`, and
optional `toolCallId`. `ToolExecutionCoordinator` consumes only that SDK-shaped
event contract. Direct `tool_call` or `tool_bundle_call` events with snake_case
payload keys such as `tool_name`, `request_id`, `bundle_id`, or step
`tool_call_id` are malformed for coordinator execution and remain unclaimed.
The high-level `agent.stream(...)` projection mirrors that boundary: single
tool call/output events read top-level SDK fields such as `toolName`,
`requestId`, and `toolCallId`; backend-wire aliases must be converted by the
backend-event normalizer first. Normalized bundle step rows still use `name` for
call steps and `tool` for output steps.
Current-turn live presentation entries mirror the same SDK-shaped identity
fields (`toolName`, `requestId`, `correlationId`, and `bundleId`) so renderer
UI code can render live tool rows without re-reading backend-wire aliases from
`structuredPayload`.
The underlying legacy `currentTurn.toolEvents` projection exposes those identity
fields for hosts that still render directly from tool events.
Claimed SDK-shaped events execute the local runtime, send the result back
through the transport, and append the corresponding normalized output event
through the same store/projection path. When backend metadata marks the tool
event as display-only, the event remains claimed with reason
`backend-skipped-local-execution` so the SDK does not execute a local tool or
fabricate a backend result while still projecting `executionSkipped` for UI
consumers.
Local tool result screenshot metadata uses backend-facing snake_case fields
(`screenshot_ref`, `screenshot_url`, and `screenshot_content_type`). The
coordinator rejects camelCase screenshot result aliases instead of rewriting
them.

If local execution succeeds but backend delivery of `tool-result` or
`tool-bundle-result` fails, the coordinator stores the output as an explicit
failure with `deliveryFailed: true` and the conversation runtime appends a
`turn_error` with `reason: "tool_result_delivery_failed"`. The UI can then show
the turn as failed instead of treating an undelivered local result as a
completed tool wait.

Projection builders collapse duplicate tool outputs that share the same
`requestId`, `bundleId`, `correlationId`, or `toolCallId` as a defensive guard
for stored legacy rows. The live local-runtime flow should not produce backend
acknowledgement `tool-output` events for local results: the SDK appends the
local raw output row, sends `tool-result` or `tool-bundle-result` to backend,
and backend ingests that result for model/history continuation without echoing a
second UI row.

Tool call/output pairing uses the private `toolPairKeys(event)` helper in
`conversationProjections.ts`. It returns every usable pairing key for single
tool and bundle events, rather than reducing the event to one preferred key.
The old single-key `toolPairKey(...)` helper was removed; stale references to it
should route here. Do not reintroduce a single-key pairing path, because stored
legacy rows may need any of `requestId`, `bundleId`, `correlationId`, or
`toolCallId` to match a call with its output.

### Tool Output Content Fallback

Tool output content projection is intentionally narrow. `readToolOutputContent`
and display/model projections treat only canonical `output`, `message`, or
`error` fields on the payload or nested `result` object as model-facing tool
text. Assistant-shaped fields such as `content`, `text`, `finalResponse`, and
`final_response` are not fallback tool-output text. When no canonical field is
present, the SDK keeps the structured payload visible by JSON-stringifying it
for display/projection, but `hasModelContent` stays false so callers do not
mistake an assistant-stream payload shape for tool result text. Fix producers to
emit `output`, `message`, or `error`; do not re-add assistant-shaped content or
final-response fallback fields in SDK projection code.

The removed `fallbackText(...)` helper must not be reintroduced. It re-read the
same top-level `output`, `message`, and `error` fields after
`readToolOutputContent(...)` had already checked them, so it could not produce
additional model-facing content. Searches for `normalizeToolOutputContent`,
removed top-level tool-output fallback helpers, or missing canonical
tool-output text should route here: current behavior falls straight through to
structured JSON display with `hasModelContent: false`.

Rehydrate projections preserve provider-safe tool history for both single calls
and bundles. A `tool_call` projection must carry the original `tool_calls` and
`toolCallId` when available. A `tool_bundle_call` projection must preserve the
`bundleId`, executable step list, and any provider-facing calls nested in step
metadata; the matching `tool_bundle_output` becomes one model-visible tool
result with the same bundle id. This keeps restart/edit/resend history valid
without replaying a lossy display transcript.

The Electron host local snapshot loader uses this SDK projection path when generating
rehydrate payloads from stored transcript rows. That is the first migration step
away from separate renderer-only replay shaping.

## Host UI Migration Target

Host UIs should call runtime commands and render projections. They should not
directly mutate transcript/replay state, interpret compaction lifecycle events,
or route backend tool results after migration. The Electron agent host should
expose a small first-party service surface backed by
`ConversationContinuityService` instead of letting dashboard hooks, chat hooks,
and storage adapters each own a piece of resume semantics.

## Evidence Notes

- Conversation-runtime fixes should include the store event, projection output,
  and UI adapter input that prove the normalized path is coherent.
- If a desktop workaround bypasses SDK projections, document the deletion path
  or route the behavior back into the runtime contract.
