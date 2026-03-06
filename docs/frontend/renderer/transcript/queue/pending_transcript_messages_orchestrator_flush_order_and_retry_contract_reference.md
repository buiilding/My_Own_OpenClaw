---
summary: "Deep reference for transcript pending-message orchestration: cross-queue flush gating, user->assistant->tool ordering, and category-tail requeue behavior."
read_when:
  - When changing `frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages.ts` orchestration logic.
  - When debugging pending transcript queues that appear stuck, partially flushed, or role-ordered incorrectly.
title: "Pending Transcript Messages Orchestrator Flush Order and Retry Contract Reference"
---

# Pending Transcript Messages Orchestrator Flush Order and Retry Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingToolQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/transcriptPendingFlush.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/TranscriptPendingMessages.test.ts`
- `tests/frontend/TranscriptPendingFlush.test.ts`
- `tests/frontend/TranscriptWriter.userAssistant.test.ts`
- `tests/frontend/TranscriptWriter.tool.test.ts`

## Ownership Boundary

`createPendingTranscriptMessages(...)` is the queue-orchestration owner for transcript retry behavior.

It composes three per-role queue modules and exposes one coordinator API used by `TranscriptWriter`:

- `hasPendingEntries()`
- `queueUserMessageForRetry(...)`
- `queueAssistantMessageForRetry(...)`
- `queueToolMessageForRetry(...)`
- `flushPendingMessages(sessionInfo)`

`TranscriptWriter` owns session identity and store IPC; orchestrator owns queue state and drain sequencing.

## Flush Gate Contract

`flushPendingMessages(sessionInfo)` returns early when any gate fails:

- missing `sessionInfo.conversationRef`
- missing `sessionInfo.userId`
- all three queues empty

This prevents writes with incomplete identity and avoids noop flush churn.

## Role-Ordered Drain Contract

Flush order is strict:

1. user queue
2. assistant queue
3. tool queue

Each category is drained before write attempts, then processed with `flushPendingEntries(...)`.

Ordering guarantee exists even when messages were enqueued in a different order across categories.

## Failure and Requeue Semantics

Per category:

- writes proceed entry-by-entry
- on first failure, orchestrator requeues the unflushed suffix only
- later categories are skipped in that pass

Requeue path uses `requeuePending(messages.slice(index), queue.enqueue)`.

This preserves:

- no duplicate writes for already persisted prefix entries
- FIFO order for remaining entries on next flush

## Transcript Entry Projection Contract

Queued messages are converted into `TranscriptEntry` objects at flush time.

User mapping:

- `role='user'`
- `messageType='user'`
- optional `timestamp`, `modelId`, `modelProvider`, `screenshotRef`, `transparency`

Assistant mapping:

- `role='assistant'`
- `messageType` defaults to `llm-text` when omitted
- optional `modelId`, `modelProvider`, `screenshotRef`, `transparency`

Tool mapping:

- `role='tool'`
- required queued `messageType`
- optional `toolName`, `correlationId`, `modelId`, `modelProvider`, `screenshotRef`, `transparency`
- empty-string `toolName` and `correlationId` normalize to `undefined`

Identity (`conversationRef`, `userId`) is not stored in queue entries; it is applied by store path in `TranscriptWriter` when calling `storeTranscriptEntry(...)`.

## Queue Visibility Contract

`hasPendingEntries()` returns `true` if any underlying queue size is non-zero.

After successful flush of all categories, all queues are empty and `hasPendingEntries()` returns `false`.

## Test-Locked Invariants

`tests/frontend/TranscriptPendingMessages.test.ts` locks:

- user->assistant->tool flush order regardless of enqueue ordering
- assistant-category failure requeues tail and blocks tool flush in that pass
- subsequent flush resumes and completes remaining assistant + tool entries

`tests/frontend/TranscriptPendingFlush.test.ts` locks helper-level suffix requeue behavior.

Writer integration tests (`TranscriptWriter.userAssistant.test.ts`, `TranscriptWriter.tool.test.ts`) lock orchestrator behavior through public writer flows.

## Drift Hotspots

1. Reordering category flush sequence changes transcript chronology assumptions in dashboard/chat replay.
2. Requeueing full category instead of tail duplicates previously persisted rows.
3. Removing early identity gates can write transcript rows without stable conversation/user association.
4. Moving messageType defaults out of orchestrator can create assistant/tool shape drift across immediate-write and retry paths.

## Related Pages

- [Transcript Queue Docs Hub](README.md)
- [Pending Transcript Queue FIFO and Requeue Contract Reference](pending_transcript_queue_fifo_and_requeue_contract_reference.md)
- [Transcript Writer Queue Flush and Session Event Reference](../transcript_writer_queue_flush_and_session_event_reference.md)
- [Transcript Session and Rehydrate Reference](../../transcript_session_and_rehydrate_reference.md)
