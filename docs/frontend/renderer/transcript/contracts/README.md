---
summary: "Frontend renderer transcript contract docs sub-hub for shared type aliases used by SDK-backed transcript session, display, and transparency projection."
read_when:
  - When changing transcript type definitions in `frontend/src/renderer/infrastructure/transcript/types.ts`.
  - When debugging compile/runtime drift between SDK display projection, session identity, and transparency fields.
title: "Frontend Renderer Transcript Contracts Docs Hub"
---

# Frontend Renderer Transcript Contracts Docs Hub

## Deep Pages

- [Transcript Type Contract Reference](transcript_entry_type_contract_reference.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Transparency Normalization and Snapshot Pruning Contract Reference](transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md)

## Related Pages

- [Frontend Renderer Transcript Docs Hub](../README.md)

## Code Scope

- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/transparencyNormalization.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`
- `tests/frontend/TranscriptTransparencyNormalization.test.ts`
