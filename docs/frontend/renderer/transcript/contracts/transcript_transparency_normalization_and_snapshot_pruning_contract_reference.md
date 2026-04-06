---
summary: "Deep reference for transcript transparency snapshot normalization: optional string trimming, tool-schema/metadata cloning, and empty-payload pruning before transcript persistence."
read_when:
  - When changing `frontend/src/renderer/infrastructure/transcript/transparencyNormalization.ts` behavior.
  - When debugging missing `transparency` payloads in persisted transcript rows or unexpected prompt/tool-schema snapshot drops.
title: "Transcript Transparency Normalization and Snapshot Pruning Contract Reference"
---

# Transcript Transparency Normalization and Snapshot Pruning Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/transparencyNormalization.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `tests/frontend/TranscriptTransparencyNormalization.test.ts`

## Ownership Boundary

`normalizeTransparencyData(...)` is the canonical boundary for cleaning optional transcript transparency snapshots before they are queued/persisted by `TranscriptWriter`.

It is shape-preserving for valid fields and fail-closed for empty/invalid payloads.

## Input and Output Contract

Input type:

- `TranscriptTransparencyData | null | undefined`

Output type:

- `TranscriptTransparencyData | null`

Early-return rules:

- non-object / `null` / `undefined` -> `null`
- object that normalizes to no retained fields -> `null`

## Field Normalization Rules

### `systemPrompt`

- normalized with `normalizeOptionalIncomingText(...)`
- retained only when non-empty after trim/normalization

### `toolSchemas`

- retained only when input is a non-empty array of supported tool schemas
- supported function schemas are normalized to the canonical nested shape `{ type: 'function', function: { name, parameters, ... } }`
- computer schemas are shallow-cloned as-is

### `fullUserMessage`

- `content` normalized via `normalizeOptionalIncomingText(...)`
- `metadata` retained only when plain object (not array), then shallow-cloned (`{ ...metadata }`)
- nested object retained when either normalized `content` or valid `metadata` exists
- missing/empty child fields are omitted with `undefined`

### `fullAssistantMessage`

- `content` normalized via `normalizeOptionalIncomingText(...)`
- retained only when normalized content exists

## Writer Integration Contract

`TranscriptWriter` uses `normalizeTransparencyData(...)` before:

- queueing user/assistant/tool retry payloads
- immediate persistence payload construction

Result:

- `transparency` is omitted entirely when normalization returns `null`
- empty/transient transparency snapshots do not pollute transcript storage
- conversation-level tool-schema UI is derived at render time from the latest canonical message transparency; transcript normalization remains message-scoped and does not introduce a separate conversation snapshot field

## Test-Locked Invariants

`tests/frontend/TranscriptTransparencyNormalization.test.ts` locks:

- invalid/empty transparency payload -> `null`
- trimming/normalization for `systemPrompt`, `fullUserMessage.content`, `fullAssistantMessage.content`
- retention of valid `fullUserMessage.metadata` even when `content` normalizes empty

## Drift Hotspots

1. Removing optional-string normalization can persist whitespace-only transparency text.
2. Returning raw toolSchemas/metadata references can reintroduce shared-mutation bugs between UI state and persistence payloads.
3. Treating arrays as valid `fullUserMessage.metadata` can widen payload surface beyond expected plain-object snapshot contract.
4. Keeping empty normalized snapshots instead of returning `null` can bloat transcript metadata rows with no semantic value.

## Related Pages

- [Transcript Entry and Pending Message Type Contract Reference](transcript_entry_and_pending_message_type_contract_reference.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Writer Queue Flush and Session Event Reference](../transcript_writer_queue_flush_and_session_event_reference.md)
- [Incoming Text Normalization Contract Reference](../../infrastructure/incoming_text_normalization_mojibake_and_lone_surrogate_contract_reference.md)
