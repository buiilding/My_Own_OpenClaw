---
summary: "Deep reference for transcript type aliases: SessionInfo identity shape, transparency payload contract, pending user/assistant/tool queue payload fields, and normalized TranscriptEntry persistence contract."
read_when:
  - When changing transcript queue message types or `TranscriptEntry` field names in `types.ts`.
  - When debugging type mismatches between transcript queue producers, writer payload mapping, and storage schema expectations.
title: "Transcript Entry and Pending Message Type Contract Reference"
---

# Transcript Entry and Pending Message Type Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`

## `SessionInfo` Contract

Fields:

- `conversationRef: string | null`
- `userId: string | null`

This is the minimal identity tuple used to gate flush eligibility.

## `TranscriptTransparencyData` Contract

Optional transparency snapshot payload used on pending and persisted transcript rows:

- `systemPrompt?: string | null`
- `toolSchemas?: unknown[] | null`
- `fullUserMessage?: { content?: string | null; metadata?: Record<string, unknown> | null } | null`
- `fullAssistantMessage?: { content?: string | null } | null`

Type alias is shape-only and intentionally permissive for renderer-captured transparency snapshots.

## Pending Queue Message Contracts

### `PendingUserMessage`

Required:

- `text`

Optional metadata:

- `screenshotRef`
- `timestamp`
- `modelId`
- `modelProvider`
- `transparency`

### `PendingToolMessage`

Required:

- `text`
- `messageType`

Optional metadata:

- `toolName`
- `correlationId`
- `modelId`
- `modelProvider`
- `screenshotRef`
- `transparency`

### `PendingAssistantMessage`

Required:

- `text`

Optional metadata:

- `messageType`
- `modelId`
- `modelProvider`
- `screenshotRef`
- `transparency`

## Persisted Row Contract (`TranscriptEntry`)

`TranscriptEntry` normalizes persisted transcript records with `content` required and all other fields optional:

- identity fields (`conversationRef`, `userId`)
- role/message fields (`role`, `messageType`)
- tool correlation fields (`toolName`, `correlationId`)
- model/screenshot metadata (`modelId`, `modelProvider`, `screenshotRef`)
- optional transparency snapshot (`transparency`)
- `timestamp`

This broad optional surface allows mixed row origins while keeping one unified type.

## Usage Boundary

These aliases are shared contract types only.

They do not implement validation logic themselves; runtime filtering/normalization is handled by writer and queue modules.

## Drift Hotspots

1. Renaming fields in `types.ts` without synchronized writer mapping changes breaks persisted payload shape.
2. Tightening optional fields can force broad queue/writer refactors and invalidate existing data paths.
3. Allowing incompatible messageType values without schema guards can leak malformed rows to sidecar storage.
4. Drifting transparency object shape between producer hooks and writer mapping can silently drop prompt/tool-schema context in persisted rows.

## Related Pages

- [Frontend Renderer Transcript Contracts Docs Hub](README.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Transparency Normalization and Snapshot Pruning Contract Reference](transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md)
- [Transcript Writer Queue Flush and Session Event Reference](../transcript_writer_queue_flush_and_session_event_reference.md)
