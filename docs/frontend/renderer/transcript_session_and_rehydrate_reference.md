---
summary: "Renderer transcript runtime reference: session identity state, SDK-backed conversation storage, IPC storage contract, and dashboard conversation resume/rehydrate flow."
read_when:
  - When changing transcript session identity wiring, SDK display projection, or `store-chat-event` payload shape.
  - When debugging missing transcript rows, dashboard resume, or rehydrate mismatches.
  - When changing try-again/edit+resend replay sequencing in `useConversationReplayActions.js`.
title: "Transcript Session and Rehydrate Reference"
---

# Transcript Session and Rehydrate Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.ts`
- `frontend/src/renderer/app/runtime/desktopBackendTransport.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/infrastructure/transcript/toolCallMessageState.js`
- `frontend/src/renderer/infrastructure/transcript/rehydrateMessageState.js`
- `frontend/src/renderer/infrastructure/services/screenshotMessageState.js`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `frontend/src/renderer/features/chat/utils/session/newChatSession.ts`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `frontend/src/main/sidecar/local_backend_bridge.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`

## Session Identity Model

Transcript session identity includes:

- `conversationRef`
- `userId`

`createTranscriptSessionState(...)` behavior:

- lazy bootstrap from `sessionStorage` key `transcript-session-info`
- stored identity must use `conversationRef`; `sessionId` is not accepted as a chat identity alias
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
- inbound `transcript-session-sync` packets are normalized by `extractTranscriptSessionSyncPayload(...)` before state updates:
  - accepts first-class identity keys (`conversationRef|conversation_ref`, `userId|user_id`)
  - trims/normalizes text and converts blank values to `null`
  - supports partial updates (one field may be `undefined`)
- inbound sync updates apply with rebroadcast disabled to avoid renderer/main loopback storms

Responsibility split:

- `transcriptSessionRuntime.ts` owns session-state bootstrap, storage persistence, browser/main-process sync, and session resolution helpers.
- `DesktopTranscriptSessionRuntimeClient` is the renderer facade for active conversation/user identity.
- `DesktopConversationContinuityService` owns replay, rewrite, and rehydrate orchestration through SDK store commands.
- `DesktopConversationLibraryClient` owns list/load/delete/search through the SDK store path.

Dashboard consumers subscribe via `useSyncExternalStore` (`useTranscriptSessionInfo`) for stable snapshot behavior.

Transcript conversation pagination helper:

- `loadConversationTranscriptMemories(...)` centralizes paginated `GET_CHAT_EVENTS` fetch with `afterMessageIndex` cursor progression, used by dashboard open and manual compaction rehydrate flows.

## SDK Store Boundary

The desktop runtime uses `ConversationContinuityService` as the SDK-owned
continuity orchestrator and the SDK `SidecarConversationStore` as the
sidecar-backed conversation-store owner. The desktop conversation store factory
adapts desktop metadata and attachment enrichment into that SDK store.

Storage split:

- `chat_events` stores canonical SDK conversation events for the runtime,
  including `conversationRef`, `turnRef`, `revisionId`, request/bundle/tool-call
  ids, and structured payloads.
- `transcript` remains a visible projection/memory-era storage path and is not
  the active SDK continuity source.
- compacted backend rehydrate snapshots are stored as complete
  `compaction_applied` conversation events.

The factory supplies desktop write-enrichment params to the SDK
`SidecarConversationStore`, which owns the sidecar write/read RPCs. Display and
backend rehydrate snapshots come from the SDK projection path, and backend
resume is triggered by the SDK continuity service rather than by dashboard or
chat feature code.

Direct `store-chat-event` calls and replay append mutation are not renderer
feature-code surfaces; sidecar chat-event RPC names remain inside SDK
store/local-runtime and Electron main bridge internals.

## Call-Site Wiring Across Renderer

### User identity seeding

`AppConfigProvider` sets transcript `userId` from:

- pushed `ipc-status` events
- initial `get-client-user-id` invoke

### New turn and user row

`useChatMessageSender`:

- ensures active conversation ref exists
- sends the user turn through the desktop live-turn runtime and SDK command path

`startNewChatSession(...)`:

- clears chat state
- sets fresh active conversation ref

### Stream and tool rows

`useChatStream`:

- consumes SDK-normalized conversation events
- updates active-turn display through SDK current-turn projections
- keeps tool execution owned by Electron main, SDK runtime, and the sidecar daemon

Renderer transcript rows remain visible projections and do not execute tools.

## Dashboard Resume and Rehydrate Flow

`ChatGptDashboardShell` conversation-open path:

1. list conversations from the SDK conversation library (`recordKind: "chat_event"`)
2. load selected conversation SDK events via the chat-event store adapter (cursor-paginated local RPC)
3. project SDK display messages for the renderer
4. ask the desktop conversation continuity service to rehydrate the backend inference session through `DesktopConversationContinuityService.rehydrateFromStore(...)`
   - rehydrate payload shaping is centralized in SDK projection helpers so dashboard-open rehydrate and edit/retry replay agree on `tool_name`, `tool_call_id`, screenshots, and structured tool payloads
5. set active transcript conversation/session info
6. replace renderer chat store with projected SDK display messages

Search modal uses the same open path after `search-chat-conversations` results.

`ensureConversationInferenceSessionHydrated(...)` uses the continuity service
for the backend rehydrate payload. The local snapshot loader still supplies
workspace binding/display metadata, but the backend continuation payload comes
from the SDK store projection.

Hydration work is scoped to the current backend connection epoch. If the
connection is invalidated while a local snapshot load or explicit rehydrate is
pending, stale continuations must return before mutating workspace bindings or
rehydrating the new backend session.

Dashboard startup and open-chat loading also use the SDK store adapter:

- recent chats are listed through store metadata from `chat_events` rows
  and explicit pagination options
- dashboard chat deletion goes through the SDK store path so visible transcript
  rows, chat-event rows, metadata, title/search rows, attachments, and working
  memories are deleted together
- compacted transcript replacements use `replace_chat_conversation` so the
  durable chat-event log is updated in one transaction

## Troubleshooting

If transcript rows never appear:

1. verify transcript session has both `conversationRef` and `userId`
2. verify `updateTranscriptSession(...)` runs after IPC status/backend events
3. inspect sidecar `store_chat_event` handling and SDK store calls

If resumed conversation loses screenshot/tool linkage:

1. inspect SDK display and rehydrate projection mapping
   (`sdkDisplayChatMessageProjection.ts` and the desktop continuity service)
2. verify screenshot ref propagation
3. verify `correlation_id` + `tool_name` survive list/get round-trip

## Related Pages

- [Frontend Renderer Transcript Docs Hub](transcript/README.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript/contracts/transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Transparency Normalization and Snapshot Pruning Contract Reference](transcript/contracts/transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
