---
summary: "Deep reference for renderer incoming text normalization: mojibake repair, lone-surrogate replacement, and optional-trim/null helpers shared by chat stream and transcript session parsing."
read_when:
  - When changing renderer text sanitization behavior for streamed assistant content or transcript session parsing.
  - When debugging mojibake artifacts, invalid surrogate crashes, or unexpected empty-text drops.
title: "Incoming Text Normalization Contract Reference"
---

# Incoming Text Normalization Contract Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `tests/frontend/IncomingTextNormalization.test.ts`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`

## Purpose

The normalization helper centralizes incoming text cleanup for stream and transcript metadata paths:

- backend stream/update payload text before renderer message updates
- transcript session-sync payload parsing

This prevents normalization drift between stream rendering and transcript session identity parsing.

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
- targeted `Â ` / `Â\u00A0` whitespace artifact repair

Literal `Â` is not removed by itself, so valid text such as names beginning
with `Â` is preserved.

Replacement pass is deterministic and ordered by array declaration.

## Surrogate Handling Rules

`replaceLoneSurrogates(...)` scans UTF-16 code units and applies:

- non-surrogate unit: keep as-is
- high surrogate followed by low surrogate: keep pair as-is
- all other surrogate units (lone high/lone low): replace with `�`

This avoids invalid UTF-16 payload propagation while preserving valid non-BMP characters.

## Integration Points

### Chat stream updates

`desktopChatStreamMessageUpdateRuntime.ts` normalizes:

- chunk text (`streaming-response` append/new actions)
- transparency content fields (`system-prompt`, `user-message-full`, `assistant-message-full`)

### Transcript session-sync payload parsing

`transcriptSessionRuntime.ts` uses `normalizeOptionalIncomingText(...)` for
its private transcript session-sync parser:

- `conversationRef`
- `userId`

Whitespace-only values collapse to `null`; omitted keys remain `undefined` for partial-update semantics.

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
3. Diverging stream vs session-sync normalization paths can cause conversation-id drift.

## Related Docs

- [Tracking, Formatting, and Message-Update Utility Reference](../chat/stream/tracking_formatting_and_message_update_utility_reference.md)
- [Transcript Session Sync Payload Normalization Contract Reference](../transcript/contracts/transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Frontend Renderer Transcript Docs Hub](../transcript/README.md)
- [Frontend Renderer Infrastructure Docs Hub](README.md)
