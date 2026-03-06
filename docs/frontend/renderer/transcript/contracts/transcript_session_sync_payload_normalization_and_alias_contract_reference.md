---
summary: "Deep reference for transcript-session-sync payload parsing: alias-key support, whitespace/null normalization, and partial-update semantics consumed by TranscriptWriter."
read_when:
  - When changing `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts` or transcript-session sync message formats.
  - When debugging renderer/main transcript session drift caused by payload key aliasing, whitespace-only identifiers, or partial update packets.
title: "Transcript Session Sync Payload Normalization and Alias Contract Reference"
---

# Transcript Session Sync Payload Normalization and Alias Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`
- `tests/frontend/TranscriptWriter.session.test.ts`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`

## Ownership Boundary

`extractTranscriptSessionSyncPayload(payload)` is the normalization boundary for inbound `transcript-session-sync` packets consumed by `TranscriptWriter`.

It does not persist state; it only parses and normalizes external payload shape into:

- `conversationRef?: string | null`
- `userId?: string | null`

`TranscriptWriter` then applies the normalized fields through `applyTranscriptSessionUpdate(..., { syncToMainProcess: false })` to avoid rebroadcast loops.

## Accepted Key Aliases

Conversation identity keys (first-present resolution order):

1. `conversationRef`
2. `conversation_ref`
3. `sessionId`
4. `session_id`

User identity keys:

- `userId`
- `user_id`

If neither conversation nor user key is present, function returns `null` (ignore packet).

## Payload-Type Gate

Function returns `null` for non-object payloads:

- `null`
- primitive types (`string`, `number`, etc.)
- arrays

Only plain object-like values continue to alias/key parsing.

## Field Normalization Contract

Normalization uses `normalizeOptionalIncomingText(...)` (via `incomingTextNormalization.ts`):

- repairs common mojibake sequences
- replaces lone surrogates with replacement char
- trims whitespace
- converts empty-after-trim strings to `null`

Explicit `null` remains `null` for session fields.

Resulting field behavior:

- provided non-empty string -> trimmed string
- provided whitespace-only string -> `null`
- provided explicit `null` -> `null`
- omitted key -> `undefined`

This distinction allows partial updates without clobbering untouched dimensions.

## Partial Update Semantics

Function can return one-dimensional updates:

- conversation-only packet -> `{ conversationRef: <value>, userId: undefined }`
- user-only packet -> `{ conversationRef: undefined, userId: <value> }`

`TranscriptWriter` merges these via session-state update rules, preserving unspecified fields.

## Test-Locked Invariants

`tests/frontend/TranscriptSessionSyncPayload.test.ts` locks:

- rejection of non-object payloads
- camelCase extraction and trim behavior
- snake_case + legacy session alias support
- partial update output shape with `undefined` missing field

`tests/frontend/TranscriptWriter.session.test.ts` locks integration behavior:

- inbound `transcript-session-sync` updates writer session state
- inbound sync updates do not trigger outbound rebroadcast sends

`tests/frontend/IpcMainBridge.lifecycle.test.cjs` locks main-process bridge packet forwarding semantics for `transcript-session-sync`.

## Drift Hotspots

1. Changing alias precedence can rebind conversation identity unexpectedly when multiple keys are present.
2. Removing trim/null normalization can preserve whitespace ids and break session identity comparisons.
3. Returning empty object instead of `null` for non-session payloads can trigger unintended writer updates.
4. Rebroadcasting inbound sync packets can create renderer/main echo loops.

## Related Pages

- [Transcript Entry and Pending Message Type Contract Reference](transcript_entry_and_pending_message_type_contract_reference.md)
- [Transcript Writer Queue Flush and Session Event Reference](../transcript_writer_queue_flush_and_session_event_reference.md)
- [Transcript Session and Rehydrate Reference](../../transcript_session_and_rehydrate_reference.md)
