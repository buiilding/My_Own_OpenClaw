---
summary: "Deep reference for renderer TranscriptWriter internals: session-state loading/override rules, queue drain ordering and requeue semantics, immediate write fallback behavior, and test-backed session event/persistence contracts."
read_when:
  - When changing TranscriptWriter queue flush order, retry/requeue behavior, or transcript session identity update APIs.
  - When debugging missing transcript writes, repeated flush retries, or stale dashboard listeners on transcript session updates.
title: "Transcript Writer Queue Flush and Session Event Reference"
---

# Transcript Writer Queue Flush and Session Event Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptEntryPersistence.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptRecordWrite.ts`
- `frontend/src/renderer/infrastructure/transcript/transparencyNormalization.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/transcriptPendingFlush.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingToolQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `tests/frontend/TranscriptWriter.session.test.ts`
- `tests/frontend/TranscriptWriter.userAssistant.test.ts`
- `tests/frontend/TranscriptWriter.tool.test.ts`
- `tests/frontend/TranscriptSessionState.test.ts`
- `tests/frontend/TranscriptStorage.test.ts`
- `tests/frontend/TranscriptPendingFlush.test.ts`
- `tests/frontend/TranscriptTransparencyNormalization.test.ts`

## Session Identity State Machine

Transcript identity fields:

- `conversationRef`
- `userId`

`createTranscriptSessionState(readStoredSessionInfo)` behavior:

- lazy-loads storage only on first `get/resolve/update`
- caches loaded values in memory for later calls
- `resolve(override)` merges override onto current state
- `update(conversationRef?, userId?)` rules:
  - `conversationRef === undefined` keeps current conversation
  - `conversationRef === null` explicitly clears active conversation
  - truthy `userId` overwrites current user
  - empty/falsey `userId` does not clear existing user

Layering:

- `transcriptSessionRuntime.ts` wraps `createTranscriptSessionState(...)`, storage persistence, window event emission, and main-process sync subscription/send behavior
- `TranscriptWriter.ts` consumes that runtime instead of inlining session bootstrap and sync logic

## Storage + Event Contract

Persistence boundary (`sessionInfoStorage.ts`):

- key: `transcript-session-info` in `sessionStorage`
- read path supports legacy payload fallback (`sessionId` -> `conversationRef`)
- read/write errors are swallowed and return safe null-state fallback

Session event boundary:

- writer emits `window` custom event `transcript-session-update`
- emission happens only when `(conversationRef,userId)` actually changed
- dashboard hook `useTranscriptSessionInfo` consumes event with `useSyncExternalStore` and referentially-stable snapshots
- local session changes are mirrored to main process over `SEND_CHANNELS.TRANSCRIPT_SESSION_SYNC`
- inbound `ON_CHANNELS.TRANSCRIPT_SESSION_SYNC` updates are applied with rebroadcast disabled to avoid loopback storms
- inbound sync payload parser accepts alias keys (`conversationRef|conversation_ref|sessionId|session_id`, `userId|user_id`) and trims/normalizes values before applying state updates

## Queue Families and FIFO Semantics

Three independent in-memory queues under `pending/`:

- user queue
- assistant queue
- tool queue

Each queue API:

- `enqueue(message)`
- `drain()` returns snapshot in insertion order
- `size()`

Drain behavior:

- queue storage is emptied by `splice(...)`
- mutating returned drained array does not repopulate queue

## Flush Pipeline (`flushPendingMessages`)

`pendingTranscriptMessages.ts` owns queue orchestration and exports:

- `hasPendingEntries()`
- `queueUserMessageForRetry(...)`
- `queueAssistantMessageForRetry(...)`
- `queueToolMessageForRetry(...)`
- `flushPendingMessages(sessionInfo)`

Flush preconditions:

- both `conversationRef` and `userId` are present
- at least one queue has pending entries

Flush order is strict and sequential:

1. user queue
2. assistant queue
3. tool queue

Shared flush helper boundary:

- `pending/transcriptPendingFlush.ts` owns `requeuePending(...)` for FIFO requeue.
- `pending/transcriptPendingFlush.ts` owns `flushPendingEntries(...)` for category-aware write loops and tail requeue.

Failure semantics:

- each category flushes entry-by-entry
- on first failure in a category:
  - remaining entries in that category are requeued
  - later categories are skipped for that flush pass
- caller must trigger another session update path for next flush attempt

## Immediate Write vs Queue-First Paths

`recordUserMessage`, `recordAssistantMessage`, `recordToolMessage` all share pattern:

1. ignore empty text payloads
2. resolve effective session info from explicit options + current state
3. if identity incomplete: enqueue and return
4. else invoke immediate `store-transcript` IPC write
5. if immediate write fails: enqueue for retry and warn

Shared immediate-write helper:

- `recordImmediateTranscriptEntry(...)` in `transcriptRecordWrite.ts` centralizes the empty-text guard, session-resolution gate, and `storeImmediateTranscriptEntryWithRetry(...)` invocation so user/assistant/tool recorders keep one retry boundary contract.
- `storeTranscriptEntry(...)` in `transcriptEntryPersistence.ts` centralizes IPC payload shaping, conversation workspace binding lookup, replay bootstrap initialization, and replay append writes so `TranscriptWriter.ts` no longer mixes session/runtime logic with storage/replay mechanics.

Payload defaults:

- assistant default `messageType` is `llm-text`
- tool rows include optional `toolName`/`correlationId`
- tool rows preserve optional `structuredPayload` metadata through both immediate writes and queued flush retries so replay can rebuild tool-call/tool-output cards from stored transcript rows
- screenshot ref is passed under IPC field `screenshot`
- assistant/user/tool rows can include optional `transparency` metadata; writer normalizes and prunes empty snapshots through `normalizeTransparencyData(...)` before queue/persistence mapping.
- successful writes dispatch `window` custom event `transcript-entry-stored` with persisted identity + row metadata

Tool-output transcript persistence is intentionally shared outside `TranscriptWriter`:

- chat-stream `tool-output` handlers and frontend tool-runner result persistence now both route transcript output rows through `features/chat/utils/toolOutputTranscriptPersistence.ts`
- that shared helper feeds `recordToolMessage(...)` with one canonical `structuredPayload` contract for output details, screenshot refs, and model metadata

## Session Update Entry Points

`updateTranscriptSession(conversationRef?, userId?)`:

- updates identity state
- persists + emits only when changed
- triggers flush attempt

`setActiveConversationRef(conversationRef)`:

- updates only conversation identity dimension
- preserves existing user when not supplied
- triggers flush attempt

`getTranscriptSessionInfo()` / `getActiveConversationRef()` expose read-only state snapshots.

## Test-Backed Invariants

`TranscriptWriter.session.test.ts` validates:

- storage bootstrap loads persisted session once
- changed updates persist and emit `transcript-session-update`
- redundant updates do not re-persist or re-emit
- clearing conversation (`setActiveConversationRef(null)`) queues future writes until conversation restored
- local transcript session updates send `transcript-session-sync` payloads to main process
- inbound `transcript-session-sync` packets update local state without echo-send

`TranscriptWriter.userAssistant.test.ts` validates:

- queued user/assistant writes flush when identity becomes available
- immediate write failures are requeued and retried on later session updates
- queued flush failures requeue remaining entries and preserve FIFO order
- empty text writes are ignored
- successful assistant writes emit `transcript-entry-stored`

`TranscriptWriter.tool.test.ts` validates:

- tool metadata fields persist through store payload
- tool immediate/queued failure behavior mirrors user/assistant retry semantics

`TranscriptSessionState.test.ts` validates:

- lazy one-time storage read
- merge/override behavior for `resolve`
- explicit conversation clear and truthy-only user overwrite behavior

`TranscriptStorage.test.ts` validates:

- legacy `sessionId` read fallback
- malformed payload fallback to null-state
- storage errors are non-fatal
- custom session-update event emission payload

`TranscriptPendingFlush.test.ts` validates:

- ordered `requeuePending(...)` behavior
- success path for `flushPendingEntries(...)`
- failure-tail requeue behavior for `flushPendingEntries(...)`

`TranscriptTransparencyNormalization.test.ts` validates:

- empty/invalid transparency payload collapse to `null`
- normalized trimming behavior for snapshot text fields
- retention of valid user-message metadata snapshots

## Drift Hotspots

1. Changing update semantics for empty `userId` can accidentally clear identity and stall flushes.
2. Reordering queue flush categories changes transcript row ordering guarantees.
3. Emitting session events without identity-change guard can cause dashboard rerender churn.
4. Removing legacy `sessionId` fallback can break persisted sessions from older app builds.
5. Reintroducing separate tool-output transcript builders in chat-stream and tool-runner paths will drift `structuredPayload` contents and replay behavior.

## Related Pages

- [Frontend Renderer Transcript Docs Hub](README.md)
- [Transcript Queue Docs Hub](queue/README.md)
- [Pending Transcript Queue FIFO and Requeue Contract Reference](queue/pending_transcript_queue_fifo_and_requeue_contract_reference.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](contracts/transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Transparency Normalization and Snapshot Pruning Contract Reference](contracts/transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)
- [Memory IPC and RPC Mapping Reference](../../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../../sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
