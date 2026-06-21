---
summary: "Deep reference for transcript-session-sync payload parsing: conversationRef identity keys, whitespace/null normalization, and partial-update semantics consumed by the desktop transcript session runtime."
read_when:
  - When changing `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts` or transcript-session sync message formats.
  - When debugging renderer/main transcript session drift caused by payload keys, whitespace-only identifiers, or partial update packets.
title: "Transcript Session Sync Payload Normalization Contract Reference"
---

# Transcript Session Sync Payload Normalization Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`
- `tests/frontend/TranscriptSessionState.test.ts`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`

## Ownership Boundary

`extractTranscriptSessionSyncPayload(payload)` is the normalization boundary for inbound `transcript-session-sync` packets consumed by the desktop transcript session runtime.

It does not persist state; it only parses and normalizes external payload shape into:

- `conversationRef?: string | null`
- `userId?: string | null`

The session runtime then applies the normalized fields through `applyTranscriptSessionUpdate(..., { syncToMainProcess: false })` to avoid rebroadcast loops.

## Accepted Identity Keys

Conversation identity keys (first-present resolution order):

1. `conversationRef`
2. `conversation_ref`

User identity keys:

- `userId`
- `user_id`

If neither conversation nor user key is present, function returns `null` (ignore packet).

Removed session identity keys are rejected:

- `sessionId`
- `session_id`

These keys belong to hosted backend runtime session context, not durable transcript
conversation identity.

## Payload-Type Gate

Function returns `null` for non-object payloads:

- `null`
- primitive types (`string`, `number`, etc.)
- arrays

Only plain object-like values continue to key parsing.

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

The transcript session runtime merges these via session-state update rules, preserving unspecified fields.

## Test-Locked Invariants

`tests/frontend/TranscriptSessionSyncPayload.test.ts` locks:

- rejection of non-object payloads
- camelCase extraction and trim behavior
- snake_case conversation/user key support
- fail-fast rejection of `sessionId`/`session_id` because `conversationRef` owns chat identity
- partial update output shape with `undefined` missing field

`tests/frontend/TranscriptSessionState.test.ts` and the app runtime tests lock integration behavior:

- inbound `transcript-session-sync` updates writer session state
- inbound sync updates do not trigger outbound rebroadcast sends

`tests/frontend/IpcMainBridge.lifecycle.test.cjs` locks main-process bridge packet forwarding semantics for `transcript-session-sync`.

## Drift Hotspots

1. Reintroducing `sessionId` as a chat identity alias can rebind durable conversation state to hosted backend runtime session ids.
2. Removing trim/null normalization can preserve whitespace ids and break session identity comparisons.
3. Returning empty object instead of `null` for non-session payloads can trigger unintended writer updates.
4. Rebroadcasting inbound sync packets can create renderer/main echo loops.

## Related Pages

- [Transcript Type Contract Reference](transcript_entry_type_contract_reference.md)
- [Frontend Renderer Transcript Docs Hub](../README.md)
- [Transcript Session and Rehydrate Reference](../../transcript_session_and_rehydrate_reference.md)
