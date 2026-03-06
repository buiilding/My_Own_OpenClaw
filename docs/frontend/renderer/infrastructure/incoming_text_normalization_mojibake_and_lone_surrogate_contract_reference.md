---
summary: "Deep reference for renderer incoming text normalization: mojibake repair, lone-surrogate replacement, and optional-trim/null helpers shared by chat stream and transcript session/transparency parsing."
read_when:
  - When changing renderer text sanitization behavior for streamed assistant content or transcript persistence.
  - When debugging mojibake artifacts, invalid surrogate crashes, or unexpected empty-text drops.
title: "Incoming Text Normalization Contract Reference"
---

# Incoming Text Normalization Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/transparencyNormalization.ts`
- `tests/frontend/IncomingTextNormalization.test.ts`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`
- `tests/frontend/TranscriptTransparencyNormalization.test.ts`

## Purpose

The normalization helper centralizes incoming text cleanup for stream and transcript metadata paths:

- backend stream/update payload text before renderer message updates
- transcript session-sync payload parsing and transparency snapshot normalization

This prevents normalization drift between stream rendering and transcript metadata/session identity parsing.

## Core APIs

### `normalizeIncomingText(value: unknown): string`

Behavior:

- non-string input -> `""`
- applies mojibake replacement map for common UTF-8/Windows decoding artifacts
- replaces lone surrogate code units with `U+FFFD`
- preserves valid surrogate pairs (for example emoji)

### `normalizeOptionalIncomingText(value: unknown): string | null`

Behavior:

- calls `normalizeIncomingText`
- trims whitespace
- returns `null` when trimmed text is empty

## Mojibake Replacement Contract

`MOJIBAKE_REPLACEMENTS` includes common mappings such as:

- `â€œ` -> `“`
- `â€\u009d` -> `”`
- `â€™` -> `’`
- `â€”` -> `—`
- `Â` / `Â ` removal

Replacement pass is deterministic and ordered by array declaration.

## Surrogate Handling Rules

`replaceLoneSurrogates(...)` scans UTF-16 code units and applies:

- non-surrogate unit: keep as-is
- high surrogate followed by low surrogate: keep pair as-is
- all other surrogate units (lone high/lone low): replace with `�`

This avoids invalid UTF-16 payload propagation while preserving valid non-BMP characters.

## Integration Points

### Chat stream updates

`chatStreamMessageUpdates.ts` normalizes:

- chunk text (`streaming-response` append/new actions)
- transparency content fields (`system-prompt`, `user-message-full`, `assistant-message-full`)

### Transcript session-sync payload parsing

`sessionSyncPayload.ts` uses `normalizeOptionalIncomingText(...)` for:

- `conversationRef|conversation_ref|sessionId|session_id`
- `userId|user_id`

Whitespace-only values collapse to `null`; omitted keys remain `undefined` for partial-update semantics.

### Transcript transparency normalization

`transparencyNormalization.ts` uses `normalizeOptionalIncomingText(...)` for:

- `systemPrompt`
- `fullUserMessage.content`
- `fullAssistantMessage.content`

This keeps prompt/transparency snapshots trimmed and safe before `store-transcript` persistence.

## Test-Backed Invariants

`tests/frontend/IncomingTextNormalization.test.ts` verifies:

- mojibake repair for known sequences
- lone-surrogate replacement with `�`
- valid emoji pair preservation
- non-string fallback to empty string
- optional trimmed-text null collapse behavior

## Drift Hotspots

1. Changing replacement ordering may alter output for overlapping mojibake patterns.
2. Removing lone-surrogate replacement can reintroduce invalid UTF encoding errors in downstream persistence/transport paths.
3. Diverging stream vs session-sync/transparency normalization paths can cause conversation-id drift or dropped transparency fields.

## Related Docs

- [Tracking, Formatting, and Message-Update Utility Reference](../chat/stream/tracking_formatting_and_message_update_utility_reference.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](../transcript/contracts/transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Writer Queue Flush and Session Event Reference](../transcript/transcript_writer_queue_flush_and_session_event_reference.md)
- [Frontend Renderer Infrastructure Docs Hub](README.md)
