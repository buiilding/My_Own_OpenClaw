---
summary: "Deep reference for transcript type aliases: SessionInfo identity shape."
read_when:
  - When changing session identity fields in `types.ts`.
  - When debugging type mismatches between transcript session state and storage schema expectations.
title: "Transcript Type Contract Reference"
---

# Transcript Type Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime.ts`

## `SessionInfo` Contract

Fields:

- `conversationRef: string | null`
- `userId: string | null`

This is the minimal identity tuple used by transcript session and SDK-backed store calls.

## Persisted Row Contract

Persisted transcript rows are shaped by SDK conversation-store and display
projection modules instead of a renderer-local `TranscriptEntry` export.

## Usage Boundary

These aliases are shared contract types only.

They do not implement validation logic themselves; runtime filtering/normalization is handled by SDK-backed store and projection modules.

## Drift Hotspots

1. Renaming identity fields in `types.ts` without synchronized session storage and sync-payload mapping breaks active conversation selection.
2. Reintroducing renderer-local persisted row aliases can split ownership from SDK conversation-store and display projection modules.

## Related Pages

- [Frontend Renderer Transcript Contracts Docs Hub](README.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
