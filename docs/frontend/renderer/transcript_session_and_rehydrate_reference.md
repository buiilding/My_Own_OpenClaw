---
summary: "Renderer transcript runtime reference: session identity state, SDK-backed conversation storage, direct desktopConversationStore command bridge behavior, removed createConversationEvent import/use in the desktop store, removed ConversationReplayState.test.ts state path, removed desktop store write enrichment helpers, IPC storage contract, and dashboard conversation resume/rehydrate flow."
read_when:
  - When changing transcript session identity wiring, SDK display projection, desktopConversationStore command bridge behavior, or local-runtime Python conversation-store payload shape.
  - When changing or searching for `desktopConversationLibraryClient.js`, conversation list/load/delete/search behavior, dashboard resume, or SDK-backed conversation library access.
  - When resolving stale references to removed desktop conversation-store write enrichment helpers, the removed `createConversationEvent` desktopConversationStore import, workspace metadata enrichment, broad screenshot attachment aliases, or renderer persistence reshaping.
  - When resolving stale references to removed `ConversationReplayState.test.ts`; replay state is now SDK conversation events plus current replay action, database integration, and tool-message projection tests.
  - When debugging missing transcript rows, dashboard resume, or rehydrate mismatches.
  - When changing try-again/edit+resend replay sequencing in `useConversationReplayActions.js`.
title: "Transcript Session and Rehydrate Reference"
---

# Transcript Session and Rehydrate Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient.js`
- `frontend/src/renderer/app/runtime/desktopConversationSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js`
- `frontend/src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/infrastructure/transcript/toolCallMessageState.js`
- `frontend/src/renderer/infrastructure/transcript/toolOutputChatMessageState.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts`
- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`

## Session Identity Model

Transcript session identity includes:

- `conversationRef`
- `userId`

`createTranscriptSessionState(...)` behavior:

- lazy bootstrap from `sessionStorage` key `transcript-session-info`
- stored identity must use `conversationRef`; `sessionId` is not accepted as a chat identity alias
- stored payloads containing removed `sessionId` or `session_id` keys are discarded instead of partially reused
- after bootstrap, reads are in-memory

Update semantics:

- `update(conversationRef?, userId?)`
- conversation ref can be explicitly set `null`
- empty/undefined user id does not overwrite existing user id

## Persist and Broadcast Behavior

Session info is persisted/emitted only when changed:

- writes to `sessionStorage`
- dispatches browser event `transcript-session-update`
- sends IPC event `transcript-session-sync` so main process session snapshots track renderer transcript identity
- inbound `transcript-session-sync` packets are normalized by the private
  `extractTranscriptSessionSyncPayload(...)` parser inside
  `transcriptSessionRuntime.ts` before state updates:
  - accepts first-class identity keys (`conversationRef`, `userId`)
  - rejects removed snake_case sync aliases (`conversation_ref`, `user_id`);
    those keys belong to backend query transport envelopes
  - trims/normalizes text and converts blank values to `null`
  - supports partial updates (one field may be `undefined`)
- inbound sync updates apply with rebroadcast disabled to avoid renderer/main loopback storms

Responsibility split:

- `DesktopTranscriptSessionRuntime` owns session-state bootstrap, storage persistence, browser/main-process sync, and session resolution helpers.
- `DesktopTranscriptSessionRuntimeClient` is the renderer facade for active conversation/user identity.
- `DesktopConversationContinuityService` owns replay, rewrite, and rehydrate orchestration through SDK store commands.
- `DesktopConversationReplayRuntime` owns renderer replay intent dispatch,
  active conversation selection, workspace IPC context, and trace logging.
  SDK replay commands own target-row selection, supersession, tool-message context,
  resource preservation, and replacement row construction.
- `DesktopConversationLibraryClient` owns list/load/delete/search through the SDK store path.

Renderer consumers subscribe through
`DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo()`
for stable transcript identity snapshots without making dashboard the owner of
app-level session state.

Renderer chat, minimal pill, and dashboard consumers read their current
conversation session info through `useRendererConversationSessionInfo()`, which
delegates transcript/session plus active-chat fallback projection to
`desktopConversationSessionRuntime.resolveCurrentRendererConversationSessionInfo(...)`.
That app-runtime helper owns the stable empty `{ conversationRef: null, userId:
null }` fallback so feature hooks do not duplicate session snapshot constants.

Transcript conversation pagination helper:

- dashboard open uses `DesktopConversationLibraryClient.loadConversationView(...)`
  to invoke the SDK-shaped `conversation.loadDisplay` command and then renders
  the returned `ConversationView.displayRows`.
- manual compaction and continuity rehydrate use SDK store load helpers such as
  `conversation.loadRehydrate`; renderer feature code should stay on these
  app-runtime and store facades instead of direct conversation IPC fetches.

## SDK Store Boundary

The renderer app runtime uses `ConversationContinuityService` as the SDK-owned
continuity orchestrator and the SDK `LocalRuntimeConversationStore` as the
local-runtime-backed conversation-store owner. The renderer conversation store
factory is now only a renderer command bridge: it forwards canonical SDK events
and load/list/rewrite commands to Electron main without reshaping event
metadata or attachments.

`desktopConversationStore.ts` does not create conversation events. The stale
`createConversationEvent` import was removed from that renderer store path; any
event construction belongs before the store boundary, and the store forwards the
canonical `ConversationEvent` it receives to `conversation.appendEvent`.

Storage split:

- `conversation_events` stores canonical SDK conversation events for the runtime,
  including `conversationRef`, `turnRef`, `revisionId`, request/bundle/tool-call
  ids, and structured payloads.
- `transcript` remains a visible projection/memory-era storage path and is not
  the active SDK continuity source.
- compacted backend rehydrate snapshots are stored as complete
  `compaction_applied` conversation events.

Event write enrichment, local-runtime persistence payload shaping, and attachment
storage belong to the SDK `LocalRuntimeConversationStore` plus local-runtime
write/read RPCs. Display snapshots come from the SDK projection path, model
history supplies backend resume, and backend resume is triggered by the SDK
continuity service rather than by dashboard or chat feature code.

The removed renderer write-enrichment helpers must not be reintroduced. The
desktop store no longer normalizes workspace metadata, tool ids, or broad
screenshot attachment aliases before appending events. It sends canonical SDK
events through `conversation.appendEvent`,
`conversation.replaceCompactedReplay`, `conversation.replaceRows`,
`conversation.load*`, and `conversations.*` commands; enrichment belongs behind
those SDK/local-runtime store commands.

Direct `store-chat-event` calls and replay append mutation are not renderer
feature-code surfaces; local-runtime chat-event RPC names remain inside SDK
store/local-runtime internals.

## Call-Site Wiring Across Renderer

### User identity seeding

`AppConfigProvider` sets transcript `userId` from:

- pushed `ipc-status` events
- initial `get-client-user-id` invoke

Chat session bootstrap consumes the same main-session snapshot through
`DesktopClientSessionRuntimeClient` so chat feature hooks do not import the
desktop IPC channel constants directly.

### New turn and user row

`useChatMessageSender`:

- ensures active conversation ref exists
- sends the user turn through the live-turn app-runtime client and SDK command path

`DesktopNewChatSessionRuntime.startNewChatSession(...)`:

- clears chat state
- sets fresh active conversation ref

### Stream and tool rows

`useChatStream`:

- consumes SDK-normalized conversation events
- updates active-turn display through SDK current-turn projections
- keeps tool execution owned by Electron main, SDK runtime, and the SDK local runtime

Renderer transcript rows remain visible projections and do not execute tools.

## Dashboard Resume and Rehydrate Flow

`DashboardShell` conversation-open path:

1. list conversations from the SDK conversation library (`recordKind: "chat_event"`)
2. load the selected SDK `ConversationView` through `DesktopConversationLibraryClient.loadConversationView(...)`
3. set the view on the chat store with `setChatConversationView(conversationView, conversationRef)`
4. ask the renderer app-runtime continuity service to rehydrate the backend inference session through `DesktopConversationContinuityService.rehydrateFromStore(...)`
   - rehydrate payload shaping is centralized in SDK projection helpers so dashboard-open rehydrate and edit/retry replay agree on `tool_name`, `tool_call_id`, screenshots, and structured tool payloads
5. set active transcript conversation/session info
6. leave normal chat rendering on `ConversationView.displayRows`; only the short pending-send bridge remains renderer-local

Search modal uses the same open path after SDK `conversations.search` results.

`ensureConversationInferenceSessionHydrated(...)` uses the continuity service
for the backend rehydrate payload. The local snapshot loader still supplies
workspace binding/display metadata, but the backend continuation payload comes
from the SDK store projection.

Hydration work is scoped to the current backend connection epoch. If the
connection is invalidated while a local snapshot load or explicit rehydrate is
pending, stale continuations must return before mutating workspace bindings or
rehydrating the new backend session.

Dashboard startup and open-chat loading also use the SDK store adapter:

- recent chats are listed through store metadata from `conversation_events` rows
  and explicit pagination options
- dashboard chat deletion goes through the SDK store path so visible transcript
  rows, chat-event rows, metadata, title/search rows, attachments, and working
  memories are deleted together
- compacted model-facing replacements use model-history checkpoints while the
  durable chat-event log keeps compaction lifecycle/audit events

## Troubleshooting

If transcript rows never appear:

1. verify transcript session has both `conversationRef` and `userId`
2. verify `updateTranscriptSession(...)` runs after IPC status/backend events
3. inspect local-runtime Python `conversation.append_event` handling and SDK store calls

If resumed conversation loses screenshot/tool linkage:

1. inspect SDK display and rehydrate projection mapping
   (`desktopSdkDisplayChatMessageProjectionRuntime.ts` and the renderer
   continuity service)
2. verify screenshot ref propagation
3. verify `correlation_id` + `tool_name` survive list/get round-trip

## Related Pages

- [Frontend Renderer Transcript Docs Hub](transcript/README.md)
- [Screenshot Message State and SDK Projection Reference](transcript/screenshot_message_state_and_sdk_projection_reference.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript/contracts/transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
