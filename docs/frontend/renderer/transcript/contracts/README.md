---
summary: "Frontend renderer transcript contract docs sub-hub for shared type aliases used by TranscriptWriter pending queues and persisted transcript entry payloads."
read_when:
  - When changing transcript type definitions in `frontend/src/renderer/infrastructure/transcript/types.ts`.
  - When debugging compile/runtime drift between queue payload builders and transcript entry persistence fields.
title: "Frontend Renderer Transcript Contracts Docs Hub"
---

# Frontend Renderer Transcript Contracts Docs Hub

## Deep Pages

- [Transcript Entry and Pending Message Type Contract Reference](transcript_entry_and_pending_message_type_contract_reference.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Transparency Normalization and Snapshot Pruning Contract Reference](transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md)

## Related Pages

- [Frontend Renderer Transcript Docs Hub](../README.md)
- [Transcript Writer Queue Flush and Session Event Reference](../transcript_writer_queue_flush_and_session_event_reference.md)

## Code Scope

- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/transparencyNormalization.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingToolQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/transcriptPendingFlush.ts`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`
- `tests/frontend/TranscriptTransparencyNormalization.test.ts`
