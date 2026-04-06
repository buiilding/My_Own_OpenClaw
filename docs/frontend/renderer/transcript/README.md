---
summary: "Frontend renderer transcript docs sub-hub for TranscriptWriter queue/flush behavior, session identity state updates, and session-event persistence contracts."
read_when:
  - When changing `frontend/src/renderer/infrastructure/transcript/*` modules or transcript write/retry behavior.
  - When debugging queued transcript rows, session identity drift, or `transcript-session-update` event delivery.
title: "Frontend Renderer Transcript Docs Hub"
---

# Frontend Renderer Transcript Docs Hub

## Deep Pages

- [Transcript Writer Queue Flush and Session Event Reference](transcript_writer_queue_flush_and_session_event_reference.md)
- [Transcript Queue Docs Hub](queue/README.md)
- [Pending Transcript Queue FIFO and Requeue Contract Reference](queue/pending_transcript_queue_fifo_and_requeue_contract_reference.md)
- [Transcript Contracts Docs Hub](contracts/README.md)
- [Transcript Entry and Pending Message Type Contract Reference](contracts/transcript_entry_and_pending_message_type_contract_reference.md)

## Code Scope

- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptEntryPersistence.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptRecordWrite.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingToolQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/transcriptPendingFlush.ts`
- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `tests/frontend/TranscriptPendingQueue.test.ts`
- `tests/frontend/TranscriptPendingFlush.test.ts`
- `tests/frontend/TranscriptPendingMessages.test.ts`
- `tests/frontend/TranscriptWriter.session.test.ts`
- `tests/frontend/TranscriptWriter.userAssistant.test.ts`
- `tests/frontend/TranscriptWriter.tool.test.ts`
- `tests/frontend/TranscriptSessionState.test.ts`
- `tests/frontend/TranscriptStorage.test.ts`
