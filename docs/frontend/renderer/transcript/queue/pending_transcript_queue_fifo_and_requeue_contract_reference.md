---
summary: "Deep reference for transcript pending queue implementations: enqueue/drain mechanics, FIFO ordering guarantees, and category-level requeue behavior in flush pipelines."
read_when:
  - When modifying pending transcript queue implementations or queue-drain usage in `TranscriptWriter`.
  - When diagnosing dropped transcript rows after store failures or out-of-order flush behavior across user/assistant/tool categories.
title: "Pending Transcript Queue FIFO and Requeue Contract Reference"
---

# Pending Transcript Queue FIFO and Requeue Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingToolQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/transcriptPendingFlush.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/TranscriptPendingQueue.test.ts`
- `tests/frontend/TranscriptPendingFlush.test.ts`
- `tests/frontend/TranscriptWriter.userAssistant.test.ts`
- `tests/frontend/TranscriptWriter.tool.test.ts`

## Queue Structure Pattern

All three queue modules share same shape:

- internal array store
- `size()` returns current array length
- `enqueue(message)` appends at tail (`push`)
- `drain()` returns all current items and empties backing array (`splice(0, length)`)

Queue type families:

- user queue (`PendingUserMessage`)
- assistant queue (`PendingAssistantMessage`)
- tool queue (`PendingToolMessage`)

## FIFO Contract

Because enqueue uses `push` and drain returns array from start index 0:

- insertion order is preserved
- drained messages appear FIFO

Test anchor:

- `TranscriptPendingQueue.test.ts` verifies insertion-order drain for user queue.

## Drain Isolation Contract

`drain()` empties queue before caller mutates returned array.

Implication:

- mutating drained array does not repopulate internal queue state

Test anchor:

- `drained array mutation does not re-populate queue` case in `TranscriptPendingQueue.test.ts`.

## TranscriptWriter Flush Interaction

`pendingTranscriptMessages.flushPendingMessages(sessionInfo)` drains category arrays in fixed order:

1. user
2. assistant
3. tool

Each category flush uses `flushPendingEntries(...)` from `pending/transcriptPendingFlush.ts`:

- writes one entry at a time
- on first write failure:
  - requeues current + remaining messages for that category (`messages.slice(index)`)
  - aborts later categories for that flush pass

Requeue helper:

- `requeuePending(messages, enqueue)` re-enqueues in original order, preserving FIFO across retries

## Category-Ordering Implications

Because later categories are skipped after earlier-category failure:

- user queue failures can delay assistant/tool queue drains
- assistant queue failures can delay tool queue drains

This is intentional to preserve deterministic transcript ordering by message role progression.

## Coverage Boundary

Direct queue unit coverage exists for:

- user queue implementation behavior (`TranscriptPendingQueue.test.ts`)

Assistant/tool queue behavior is covered indirectly through writer integration tests that exercise queue/retry flow.

`TranscriptPendingFlush.test.ts` adds direct helper coverage for `requeuePending(...)` ordering and `flushPendingEntries(...)` success/failure-tail behavior.

Potential gap:

- no standalone unit tests currently assert assistant/tool queue `drain()` mutation isolation explicitly.

## Drift Hotspots

1. replacing `splice`-based drain with reference reuse can break queue-empty guarantees.
2. adding per-queue async behavior can change ordering assumptions in writer flush logic.
3. changing category flush order alters transcript row chronology.
4. requeueing from index `0` on mid-batch failure can duplicate already-successful writes.
5. partial requeue strategy changes can silently drop failed tail entries.

## Change Checklist

When touching pending queue or flush logic:

1. preserve FIFO order for enqueue/drain
2. preserve empty-queue drain as `[]`
3. preserve requeue of unflushed suffix only on failure
4. preserve fixed category order unless transcript chronology model is intentionally changed
5. run transcript queue + writer retry tests
