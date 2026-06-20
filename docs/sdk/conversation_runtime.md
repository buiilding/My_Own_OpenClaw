---
summary: "SDK conversation runtime contract for normalized conversation events, dumb stores, live turn projection, conversationProjections ownership, display/rehydrate projections, toolPairKeys pairing after the removed toolPairKey helper, removed renderer ToolRunnerHook callback/turn-guard tests, removed renderer transcript/rehydrate helpers, tool output content fallback behavior, removed fallbackText top-level tool-output fallback helper behavior, assistant-shaped content rejection, final_response fallback tool output rejection, compaction lifecycle handling, edit/resend resource preservation, retry revisions, and UI adapter boundaries."
read_when:
  - When changing SDK conversation state, store adapters, live turn projection, display/rehydrate projections, edit/resend, retry, compaction replay, or desktop chat migration.
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
conversation-runtime factories, managed backend sessions, and tool coordination
modules. The boundary rule is that Electron must not reimplement those SDK
semantics separately, and Electron-only adapters must remain isolated behind
SDK interfaces such as `ConversationStore` and `AgentRuntimeTransport`.

`AgentRuntimeEvent` is the generic SDK stream event union emitted by
`conversation.stream(...)`.

## Ownership

| Surface | Owner | Notes |
| --- | --- | --- |
| normalized conversation events | SDK runtime | source of truth for local client-side conversation state |
| event store adapters | SDK-defined interface; adapter implementation owns persistence mechanics | stores append/load events and snapshots, but do not interpret display or rehydrate shape |
| display transcript | SDK projection | React, CLI, and custom UIs render this projection |
| current-turn projection | SDK projection | active assistant text, reasoning text, tool rows, phase, error state, and live presentation state for UI surfaces |
| backend rehydrate payload | SDK projection | generated from normalized events, not visible transcript rows |
| tool execution coordination | SDK runtime | claimed local tools must return exactly one backend result or failure |
| local tool execution | SDK local runtime | the local runtime runs local-runtime-backed tools; it does not own conversation replay semantics |
| backend provider history | backend | provider-safe history remains backend-owned after result ingress |

## Event Model

The runtime records normalized events:

- `conversation_created`
- `conversation_loaded`
- `conversation_rewritten`
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
- `runtime_error`

Every event carries `eventId`, `conversationRef`, `revisionId`, `timestamp`,
`source`, and optional `turnRef`.

Backend-origin events must use backend `event_id` as `eventId` and copy backend
`sequence` into `payload.backendSequence`. Backend `id` remains turn
correlation, not event identity. The SDK rejects backend stream events missing
`event_id` or `sequence` into `runtime_error`, ignores duplicate `event_id`
values, and records `runtime_error` when a turn's backend `sequence` regresses
or jumps forward.

Backend-origin events are scoped before the runtime applies active-turn
filtering:

- Turn-stream events such as assistant deltas, reasoning deltas, assistant
  messages, tool events, usage, and terminal turn events must match the
  runtime's active `turnRef` when an active turn exists.
- Conversation-control events such as `compaction_started`,
  `compaction_applied`, `compaction_skipped`, and `compaction_failed` are
  accepted by `conversationRef` plus backend sequence/deduping. Their backend
  `turnRef` is a compaction operation id, not the active chat/model turn.

The reducer updates `state.activeTurnRef` only from turn-stream events.
Conversation-control compaction events update `state.compaction` and replay
checkpoint state without replacing the active turn identity or changing the
active turn phase. Manual compaction after a completed turn preserves the
completed, non-busy current-turn state. Compaction during an active loop
preserves that loop's existing turn-stream phase without extending it.

`settings_updated` is the conversation-runtime record for SDK-owned settings
changes such as model/provider selection. `conversation.setModel(...)` and
per-turn `model` options write this event only after the backend settings update
succeeds. Runtime snapshots expose the latest merged settings on
`snapshot.state.settings`, but display and rehydrate projections do not render
or replay those settings as chat/provider history.

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
- `presentation.entries[*].sourceChannel`: SDK presentation metadata uses
  `sdk:current-turn`; host IPC channel names are adapter details and must not
  leak into reusable SDK projections
- Tool presentation entries carry explicit SDK display fields such as
  `modelFacingToolCall`, `toolArguments`, `toolCallDetails`,
  `toolOutputDetails`, `toolMetadata`, `toolDisplayMetadata`, normalized
  bundled `toolCalls`, recovery fields (`toolCallValidationFailed`,
  `rawToolCallPreview`, `rawArgumentsPreview`, `parseError`), screenshot
  refs/URLs, `executionTime`, `success`, and `executionSkipped`. Renderer
  adapters may preserve `payload` and raw `toolMetadata` for diagnostics, but
  should render live tool rows and side effects from these SDK fields rather
  than decoding backend-wire event payloads.

### Removed Standalone Current Turn Projector

Current-turn projection is not a separate projection module. The removed
standalone `packages/windie-sdk-js/src/projections/currentTurnProjection.ts`
and generated `cjs/projections/currentTurnProjection.js` files must not be
reintroduced. `packages/windie-sdk-js/src/projections/conversationProjections.ts`
owns `buildCurrentTurnProjection(...)`, the live-turn presentation builder, and
the display/rehydrate projection helpers so one event sequence produces the
same transcript, active-turn, and replay views.

Electron main emits the projection to renderer surfaces as
`conversation-runtime-updated`. Renderer overlays should
render `currentTurn.presentation.entries` instead of independently interpreting
backend-wire stream/tool events or synthesizing current-turn chat messages.
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
  replay snapshots, and provider-safe backend rehydrate projections.
- Electron/renderer app-runtime facades call SDK continuity APIs; they do not
  rebuild transcript payload or backend rehydrate shape from renderer-local row
  helpers.
- Renderer transcript modules are adapters for session identity, SDK-backed
  stores, and display projection consumption.

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

`trace_event` is the SDK-owned durable path trace row. It is stored in the same
conversation event ledger as normal conversation events, but display and
rehydrate projections must ignore it. A trace row records sanitized runtime
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
Dashboard and custom UIs render `snapshot.displayRows`; they must not
reconstruct transcript rows from `snapshot.currentTurn`. `snapshot.currentTurn`
remains the SDK-owned phase/status/overlay projection for busy state, stop
eligibility, active turn identity, and overlay-specific progressive state.
Desktop may render a temporary, textless thinking disclosure from
`snapshot.currentTurn.reasoningText` while a turn is active, but that disclosure
is not a transcript assistant row and must disappear once the SDK display row
contains assistant-visible text for the same turn.

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
  -> complete active replay snapshot, when present
  -> otherwise store.loadEvents(conversationRef)
  -> SDK rehydrate projection
```

Do not implement separate role/message/tool interpretation inside each adapter.
The adapter methods are API conveniences; they must delegate to shared SDK
projection builders or to a complete active compacted replay snapshot. This
keeps desktop, CLI, web, and tests on one interpretation path.

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
to load the SDK rehydrate projection from the configured store and send the
backend rehydrate command.
They should not fetch projection rows and shape provider history themselves.

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

Desktop reasoning projection consumes SDK `currentTurn.reasoningText` from the
conversation runtime snapshot. Renderer UI/debug state may keep the source label
`llm-thought` for continuity, but the handler should not reconstruct backend
`llm-thought` events from `payload.sourceEvent` or consume normalized
`reasoning_delta` as a separate live-state path.

Desktop assistant live text consumes SDK `currentTurn.assistantText` from the
conversation runtime snapshot. Backend-wire `streaming-response` and normalized
SDK `assistant_delta` events may still exist in the event log, but they should
not be renderer live-row or active-turn state fallbacks.

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

Desktop live tool projection consumes SDK `snapshot.currentTurn.toolEvents`.
Renderer UI/debug state may keep source labels such as `tool-call`,
`tool-output`, and `web-search-progress`, but active tool rows and phase
tracking should come from the SDK current-turn projection instead of a separate
normalized-event live-state path.
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
request/correlation ids, and `userId`, while `structuredPayload` carries backend
detail fields needed for transcript trace rows. Renderer active tool-call
display should come from `snapshot.currentTurn.toolEvents`, and should not
reconstruct backend `tool-call` events from `payload.sourceEvent`.

Desktop tool-output transcript persistence may consume SDK `tool_output`
directly. The SDK payload exposes normalized identity, request/correlation id,
tool name, and screenshot fields, while `structuredPayload` carries backend
detail fields used for transcript trace rows and malformed-payload fallbacks.
For `tool_output` and `tool_progress`, normalized `correlationId` prefers
backend `payload.correlation_id` and falls back to `payload.request_id`.
Renderer active tool-output display should come from
`snapshot.currentTurn.toolEvents`, and should not reconstruct backend
`tool-output` events from `payload.sourceEvent`.

Desktop tool-bundle transcript persistence may consume SDK `tool_bundle_call`
directly. The SDK payload exposes normalized bundle identity, correlation id,
tool list, and user id, while `structuredPayload` carries backend detail fields
used for transcript trace rows. Renderer active bundle display should come from
`snapshot.currentTurn.toolEvents`, and should not reconstruct backend
`tool-bundle` events from `payload.sourceEvent`.

## Continuity Service Rule

`ConversationContinuityService` is the SDK-owned orchestration layer for chat
continuity over any `ConversationStore`. It owns the common flow:

```text
store.loadForDisplay(conversationRef)
  -> SDK display projection

store.loadForRehydrate(conversationRef)
  -> provider-safe backend rehydrate payload
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

- SDK owns conversation semantics, display projection, rehydrate projection, and
  continuity orchestration.
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

When a complete active compacted replay generation exists, `rehydrate()` uses
that replay snapshot. Otherwise it derives rehydrate messages from normalized
events. Rehydrate projection keeps only complete tool-call/tool-output pairs;
dangling calls, orphan outputs, or incomplete bundle pairs stay available to
display/debug projections but are not sent back to backend provider history.
Generated rehydrate rows must carry canonical backend stored-history
`message_type` values (`user_query`, `assistant_response`, `tool_output`, or
`context_compaction`); renderer/source labels such as `tool-call`,
`tool-output`, and `assistant-message` remain display/debug labels, not backend
rehydrate message types.

## Revision and Resource Preservation Rule

Edit/resend and retry are revision operations:

```text
load events
  -> choose target user turn
  -> preserve events before that user turn
  -> commit conversation_rewritten with new revisionId
  -> build and send the SDK rehydrate projection for the new revision
  -> send replacement user message as a new turn
```

The old revision remains valid until the rewrite commits. The SDK does not
delete display rows and then reconstruct backend history through a separate
lossy path.

Replay preparation reconstructs the target user turn from the normalized event
ledger before cutting the revision. It merges the base `user_message` with
same-turn `user_message_metadata`, so resolved resources such as
`screenshot_refs` and `attachment_filenames` survive edit/resend and retry even
when the visible row was produced by display projection metadata merging.
Renderer replay payloads are preserve-by-default: absent or null attachment
fields must not erase prior resolved resources without an explicit removal
operation.

Edit/resend identifies the target user turn by canonical event or payload
message id. Retry with an explicit `messageId` first resolves that canonical
event, then walks backward to the preceding user turn. The SDK no longer accepts
a user-message ordinal fallback and no longer silently retries the latest user
turn when an explicit retry id is missing from the event ledger. Renderer-only
transcript ids must be normalized to canonical SDK event ids before they reach
`editAndResend` or `retryTurn`.

Desktop edit/resend and try-again seed the current visible projection into the
desktop conversation store adapter, then call `SdkConversationRuntime.editAndResend`
or `SdkConversationRuntime.retryTurn`. The renderer hook may identify which
button was clicked, but revision cutting, rewritten persistence, rehydrate
projection generation, model sync, and query send live behind the SDK runtime
facade.

## Stream Rule

`SdkConversationRuntime.stream(input)` is the canonical custom-client loop
surface. It sends the user turn, stores the same normalized events used by
display and rehydrate projections, yields `conversation_event` updates as
backend packets normalize, and exits when the conversation reaches
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
The underlying `currentTurn.toolEvents` projection exposes those identity fields
for hosts that still render directly from tool events.
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

The desktop local snapshot loader uses this SDK projection path when generating
rehydrate payloads from stored transcript rows. That is the first migration step
away from separate renderer-only replay shaping.

## Desktop Migration Target

Desktop React should call runtime commands and render projections. It should not
directly mutate transcript/replay state, interpret compaction lifecycle events,
or route backend tool results after migration. The desktop runtime should expose
a small first-party service surface backed by `ConversationContinuityService`
instead of letting dashboard hooks, chat hooks, and storage adapters each own a
piece of resume semantics.

## Evidence Notes

- Conversation-runtime fixes should include the store event, projection output,
  and UI adapter input that prove the normalized path is coherent.
- If a desktop workaround bypasses SDK projections, document the deletion path
  or route the behavior back into the runtime contract.
