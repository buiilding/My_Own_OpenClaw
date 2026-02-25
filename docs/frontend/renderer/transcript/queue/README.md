---
summary: "Frontend renderer transcript queue docs sub-hub for per-role pending queue structures, FIFO drain semantics, and retry requeue behavior."
read_when:
  - When changing `pendingUserQueue`, `pendingAssistantQueue`, or `pendingToolQueue`.
  - When debugging transcript flush ordering, queue requeue behavior, or unexpected pending queue growth.
title: "Frontend Renderer Transcript Queue Docs Hub"
---

# Frontend Renderer Transcript Queue Docs Hub

## Deep Pages

- [Pending Transcript Queue FIFO and Requeue Contract Reference](pending_transcript_queue_fifo_and_requeue_contract_reference.md)

## Related Pages

- [Frontend Renderer Transcript Docs Hub](../README.md)
- [Transcript Writer Queue Flush and Session Event Reference](../transcript_writer_queue_flush_and_session_event_reference.md)
- [Transcript Session and Rehydrate Reference](../../transcript_session_and_rehydrate_reference.md)

## Code Scope

- `frontend/src/renderer/infrastructure/transcript/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pendingToolQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/TranscriptPendingQueue.test.ts`
- `tests/frontend/TranscriptWriter.userAssistant.test.ts`
- `tests/frontend/TranscriptWriter.tool.test.ts`
