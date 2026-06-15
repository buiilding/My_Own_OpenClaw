---
summary: "Deep reference for transcript type aliases: SessionInfo identity shape and transparency payload contracts."
read_when:
  - When changing session identity or transcript transparency fields in `types.ts`.
  - When debugging type mismatches between SDK display projection, transparency mapping, and storage schema expectations.
title: "Transcript Type Contract Reference"
---

# Transcript Type Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`

## `SessionInfo` Contract

Fields:

- `conversationRef: string | null`
- `userId: string | null`

This is the minimal identity tuple used by transcript session and SDK-backed store calls.

## `TranscriptTransparencyData` Contract

Optional transparency snapshot payload used on persisted transcript rows:

- `systemPrompt?: string | null`
- `toolSchemas?: unknown[] | null`
- `fullUserMessage?: { content?: string | null; metadata?: Record<string, unknown> | null } | null`
- `fullAssistantMessage?: { content?: string | null } | null`

Type alias is shape-only and intentionally permissive for renderer-captured transparency snapshots.

## Persisted Row Contract

Persisted transcript rows are shaped by SDK conversation-store and display
projection modules instead of a renderer-local `TranscriptEntry` export.

## Usage Boundary

These aliases are shared contract types only.

They do not implement validation logic themselves; runtime filtering/normalization is handled by SDK-backed store and projection modules.

## Drift Hotspots

1. Renaming identity fields in `types.ts` without synchronized session storage and sync-payload mapping breaks active conversation selection.
2. Tightening transparency fields can force broad store/projection refactors and invalidate existing data paths.
3. Drifting transparency object shape between producer hooks and projection mapping can silently drop prompt/tool-schema context in persisted rows.

## Related Pages

- [Frontend Renderer Transcript Contracts Docs Hub](README.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Transparency Normalization and Snapshot Pruning Contract Reference](transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md)
