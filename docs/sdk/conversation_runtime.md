---
summary: "SDK conversation runtime contract for normalized conversation events, dumb stores, projections, compaction lifecycle handling, edit/retry revisions, and UI adapter boundaries."
read_when:
  - When changing SDK conversation state, store adapters, projections, edit/resend, retry, compaction replay, or desktop chat migration.
  - When debugging skipped compaction display, replay/rehydrate drift, duplicate transcript rows, or custom UI/CLI conversation behavior.
title: "SDK Conversation Runtime"
---

# SDK Conversation Runtime

The TypeScript SDK owns the reusable client-side conversation runtime. The
Electron desktop is the flagship client, but it should consume SDK projections
instead of privately shaping transcript, replay, tool, and compaction state.
External app authors normally use `WindieClient.wakeUp(...)` and
`agent.conversation(...)`. The built-in Electron desktop is a first-party SDK
host, so its app runtime facades may use lower-level SDK runtime pieces such as
conversation-runtime factories, managed backend sessions, and tool coordination
modules. The boundary rule is that Electron must not reimplement those SDK
semantics separately, and Electron-only adapters must remain isolated behind
SDK interfaces such as `ConversationStore` and `BackendTransport`.

## Ownership

| Surface | Owner | Notes |
| --- | --- | --- |
| normalized conversation events | SDK runtime | source of truth for local client-side conversation state |
| event store adapters | SDK-defined interface; adapter implementation owns persistence mechanics | stores append/load events and snapshots, but do not interpret display or rehydrate shape |
| display transcript | SDK projection | React, CLI, and custom UIs render this projection |
| current-turn projection | SDK projection | active assistant text, reasoning text, tool rows, phase, and error state for live UI surfaces |
| backend rehydrate payload | SDK projection | generated from normalized events, not visible transcript rows |
| tool execution coordination | SDK runtime | claimed local tools must return exactly one backend result or failure |
| sidecar execution | local sidecar | sidecar runs local tools; it does not own conversation replay semantics |
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
- `assistant_delta`
- `reasoning_delta`
- `assistant_message`
- `tool_call`
- `tool_progress`
- `tool_output`
- `tool_bundle_call`
- `tool_bundle_output`
- `usage_updated`
- `memory_stored`
- `compaction_started`
- `compaction_skipped`
- `compaction_applied`
- `compaction_failed`
- `settings_updated`
- `runtime_error`

Every event carries `eventId`, `conversationRef`, `revisionId`, `timestamp`,
`source`, and optional `turnRef`.

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

Electron main also emits this projection to renderer surfaces as
`conversation-runtime-updated`. Renderer overlays should render this projection
instead of independently interpreting raw backend stream/tool events.
Electron main emits SDK-normalized conversation side-effect events separately
as `conversation-event`; chat transcript/session handlers consume that channel
instead of subscribing to raw `from-backend` stream semantics.
When a same-turn `currentTurn` projection is present, renderer raw backend
handlers should not build duplicate live assistant/tool rows or own chat stream
normalization. Raw backend events may remain as compatibility traffic for
non-chat consumers, diagnostics, or legacy hosts that do not emit the SDK
projection.

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
  event logs without Electron sidecar storage. Same-conversation mutations are
  serialized inside the adapter so overlapping append/rewrite/replay/delete
  operations do not lose events through read-modify-write races.
- `SidecarConversationStore` for Node/Electron hosts that want durable local
  sidecar storage through the SDK store interface instead of renderer IPC
  transcript helpers. The Electron dashboard conversation library uses this
  store for metadata operations such as list, search, delete, and generated-title
  invalidation refreshes. The desktop conversation store adapter also delegates
  its read/projection conveniences to this SDK store. Desktop supplies
  Electron-specific write enrichment such as workspace binding and attachment
  extraction through the store's host write-params hook, while the SDK store
  still owns the sidecar write RPC. Rewrites send `newRevisionId` as explicit
  conversation revision metadata; the sidecar stores that revision separately
  from preserved event rows so `getRevision()` and metadata listing advance even
  when the rewrite keeps only old events or no events.

Electron's sidecar-backed store is a first-party adapter. It is allowed to know
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

Desktop metadata and transparency projection also consumes SDK-normalized
payloads directly. Renderer handlers should read SDK `system_prompt`,
`user_message_metadata`, `assistant_message`, and `tool_schemas_metadata` fields
instead of unwrapping backend `payload.rawEvent` metadata events.

Desktop terminal projection follows the same rule. Renderer terminal handlers
read SDK `turn_error`, `usage_updated`, and `memory_stored` payloads directly;
they should not reconstruct backend `error`, `token-count`, or `memory-store`
events from `payload.rawEvent`. `usage_updated` and `memory_stored` are
telemetry/session side effects only; they should not clear live send state or
advance the response phase. Completion and error phase ownership stays with
`snapshot.currentTurn`.

Desktop reasoning projection consumes SDK `currentTurn.reasoningText` from the
conversation runtime snapshot. Renderer UI/debug state may keep the source label
`llm-thought` for continuity, but the handler should not reconstruct backend
`llm-thought` events from `payload.rawEvent` or consume normalized
`reasoning_delta` as a separate live-state path.

Desktop assistant live text consumes SDK `currentTurn.assistantText` from the
conversation runtime snapshot. Raw backend `streaming-response` and normalized
SDK `assistant_delta` events may still exist in the event log, but they should
not be renderer live-row or active-turn state fallbacks.

Desktop completion projection consumes SDK `turn_completed` identity directly.
The SDK event carries `conversationRef`, `turnRef`, and `payload.userId` for
renderer transcript writes, so the completion handler should not unwrap
`payload.rawEvent` to recover backend `conversation_ref` or `user_id`.
Active desktop completion and error phase tracking consumes
`snapshot.currentTurn.phase` and `snapshot.currentTurn.lastError`; renderer raw
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

Desktop local-user projection consumes SDK `user_message` directly for backend
`local-user-message` echoes. Renderer UI/debug state may keep the source label
`local-user-message`, but the handler should not consume a raw backend
`local-user-message` fallback after SDK dispatch.

Desktop tool-call transcript persistence may consume SDK `tool_call` directly.
The SDK payload exposes normalized fields such as `toolName`, `args`,
request/correlation ids, and `userId`, while `structuredPayload` carries backend
detail fields needed for transcript trace rows. Renderer active tool-call
display should come from `snapshot.currentTurn.toolEvents`, and should not
reconstruct backend `tool-call` events from `payload.rawEvent`.

Desktop tool-output transcript persistence may consume SDK `tool_output`
directly. The SDK payload exposes normalized identity, request/correlation id,
tool name, and screenshot fields, while `structuredPayload` carries backend
detail fields used for transcript trace rows and malformed-payload fallbacks.
For `tool_output` and `tool_progress`, normalized `correlationId` prefers
backend `payload.correlation_id` and falls back to `payload.request_id`.
Renderer active tool-output display should come from
`snapshot.currentTurn.toolEvents`, and should not reconstruct backend
`tool-output` events from `payload.rawEvent`.

Desktop tool-bundle transcript persistence may consume SDK `tool_bundle_call`
directly. The SDK payload exposes normalized bundle identity, correlation id,
tool list, and user id, while `structuredPayload` carries backend detail fields
used for transcript trace rows. Renderer active bundle display should come from
`snapshot.currentTurn.toolEvents`, and should not reconstruct backend
`tool-bundle` events from `payload.rawEvent`.

## Continuity Service Rule

`ConversationContinuityService` is the SDK-owned orchestration layer for chat
continuity over any `ConversationStore`. It owns the common flow:

```text
store.loadForDisplay(conversationRef)
  -> SDK display projection

store.loadForRehydrate(conversationRef)
  -> provider-safe backend rehydrate payload
  -> backendTransport.rehydrateConversation(...)
```

Electron may provide a sidecar-backed store adapter and backend transport, but
it should not duplicate projection, provider-history filtering, compacted
replay, or delete orchestration in feature code. Desktop facades can expose
commands such as `loadForDisplay`, `rehydrateFromStore`, and
`deleteConversation`, but those commands should delegate to the SDK continuity
service. Manual compaction follows the same boundary: callers use
`SdkConversationRuntime.compactHistory(...)`, and the host backend transport
maps that SDK command to the backend `compact-history` control message.

Responsibility split:

- SDK owns conversation semantics, display projection, rehydrate projection, and
  continuity orchestration.
- Electron owns local IPC, sidecar-backed persistence, and renderer wiring.
- Sidecar owns durable rows, ordering, list/search/title/delete queries, and
  SQLite/FAISS mechanics.
- SDK SDK local-runtime clients own the sidecar event subscription surface. Hosts
  should consume metadata invalidations such as `conversation-title-updated`
  through SDK/local-runtime events instead of opening sidecar `/events`
  connections from UI feature code. The
  `ConversationContinuityService.subscribeMetadataInvalidations(...)` API is
  the shared library boundary for this: local-runtime events are normalized into
  conversation metadata invalidations, and UI adapters reload metadata from the
  store instead of handling raw sidecar event payloads.

## Compaction Rule

Backend `context-compaction-completed` with `skipped_reason` normalizes to
`compaction_skipped`. It is runtime/debug state, not assistant output.
Completed compaction without replacement history also normalizes to
`compaction_skipped` with `skippedReason: "missing-replacement-history"`; the
SDK only uses `compaction_applied` when replay-safe replacement entries are
present. SDK compaction payloads expose renderer-facing camelCase fields such as
`summaryText`, `replacementHistoryPreview`, and `replacementHistoryEntries`, so
renderer handlers do not need to unwrap `payload.rawEvent`.

Only `compaction_applied` with actual replacement history should affect compacted
replay snapshots. A store adapter must activate a compacted replay generation
only after the generation is complete and its entry count matches.

When a complete active compacted replay generation exists, `rehydrate()` uses
that replay snapshot. Otherwise it derives rehydrate messages from normalized
events. Rehydrate projection keeps only complete tool-call/tool-output pairs;
dangling calls, orphan outputs, or incomplete bundle pairs stay available to
display/debug projections but are not sent back to backend provider history.

## Revision Rule

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

Raw backend websocket packets are not the normal authoring surface. Use
`agent.subscribeRawBackendEvents(...)` only for debug traces or protocol tests;
display, rehydrate, tool execution, and compaction behavior should consume
normalized conversation events.

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

Backend events must carry `conversation_ref` or `turn_ref` to enter a
conversation runtime. The runtime drops ambiguous packets and ignores packets
whose `conversationRef` or active `turnRef` does not match the runtime. This is
what keeps two conversations on the same websocket from sharing streamed chunks
or stale tool events.

## Tool Rule

When the SDK claims a local tool call or bundle:

1. execute through the local runtime adapter
2. send `tool-result` or `tool-bundle-result` to backend
3. append normalized `tool_output` or `tool_bundle_output`
4. notify UI subscribers through projections

Malformed or unclaimable tool events should remain unclaimed or become explicit
failures; they should not be marked display-only without a backend result path.
When a local runtime is available but a backend tool event is missing the fields
needed to claim execution, the SDK stores a `runtime_error` with
`reason: "malformed_tool_event"` instead of invoking the sidecar or inventing a
backend result id.

`SdkConversationRuntime` can be constructed with a `localRuntime` adapter. In
that mode, normalized backend `tool_call` and `tool_bundle_call` events are
handed to `ToolExecutionCoordinator`, which executes the local runtime, sends
the result back through the transport, and appends the corresponding normalized
output event through the same store/projection path.

If local execution succeeds but backend delivery of `tool-result` or
`tool-bundle-result` fails, the coordinator stores the output as an explicit
failure with `deliveryFailed: true` and the conversation runtime appends a
`turn_error` with `reason: "tool_result_delivery_failed"`. The UI can then show
the turn as failed instead of treating an undelivered local result as a
completed tool wait.

Projection builders collapse duplicate tool outputs that share the same
`requestId`, `bundleId`, `correlationId`, or `toolCallId`. This handles the
common local-runtime flow where the SDK appends the local sidecar result and the
backend later emits an acknowledgement `tool-output` for the same tool wait.
When duplicate outputs disagree, the projection keeps the output with
model-visible content first so rehydrate history does not lose provider context;
backend acknowledgements are preferred only when both candidates have the same
model-content availability.

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
