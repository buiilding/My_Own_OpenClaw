---
summary: "Deep reference for transcript payload helpers: role/type derivation for chat rows and normalized rehydrate payload shape used by edit/retry flows."
read_when:
  - When changing `transcriptMessagePayload.js` role/type mapping or rehydrate payload fields.
  - When debugging edit/retry flows that rebuild transcript rows and backend rehydrate payloads.
  - When changing `useConversationReplayActions.js` replay pruning behavior for try-again or edit+resend.
title: "Transcript Message Payload Role, Type, and Rehydrate Shape Reference"
---

# Transcript Message Payload Role, Type, and Rehydrate Shape Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/transcriptMessagePayload.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `tests/frontend/TranscriptMessagePayload.test.js`

## Helper Surface

Exports:

- `normalizeProvider(provider)`
- `resolveTranscriptRole(message)`
- `resolveTranscriptMessageType(message)`
- `toRehydratePayload(message)`

Tool message types treated as tool rows:

- `tool-call`
- `tool-output`

## Role Mapping Contract

`resolveTranscriptRole(message)`:

- user sender -> `user`
- tool-call/tool-output message types -> `tool`
- all other rows -> `assistant`

This keeps transcript role model stable across stream and UI-generated rows.

## Message Type Contract

`resolveTranscriptMessageType(message)`:

- user sender -> `user`
- otherwise -> `message.type || 'llm-text'`

This defaults assistant rows without explicit type to canonical `llm-text`.

## Rehydrate Payload Shape

`toRehydratePayload(message)` returns:

- `role`
- `content`
- `message_type`
- `tool_name` (tool role only)
- `correlation_id` (tool role only)
- `timestamp`
- `screenshot_ref`
- `screenshot` (always `null`)

Normalization details:

- text defaults to empty string
- screenshot refs only preserved when string
- non-tool roles force `tool_name`/`correlation_id` to `null`

## Call-Site Usage

`ChatInterface` edit/retry paths use these helpers when rebuilding transcript rows and backend rehydrate payloads:

- transcript rewrite loop uses `resolveTranscriptRole` + `resolveTranscriptMessageType`
- backend rehydrate request uses `preservedMessages.map(toRehydratePayload)`

This ensures restored history aligns with message-role/type semantics used elsewhere.

## Replay Pruning Invariant (Try-Again and Edit+Resend)

`useConversationReplayActions.js` must preserve transcript context with this strict rule:

- Keep all non-tool rows (`user`, `assistant`, `llm-text`, `error`, etc.).
- Keep tool history when rows are a valid pair:
  - one `tool-call` + matching `tool-output`.
- Prune only orphan tool rows:
  - `tool-call` without matching `tool-output`.
  - `tool-output` without matching `tool-call`.

Matching priority for tool pairs:

- explicit correlation/request/bundle id match first
- deterministic ordered fallback for id-less rows

Do not change replay to drop all tool rows; that removes useful context and is outside contract.

## Drift Hotspots

1. Changing tool-role detection without updating tool message-type set can drop tool metadata in rehydrate payloads.
2. Diverging role/type mapping between transcript writes and rehydrate payloads causes resume inconsistencies.
3. Removing screenshot ref normalization can leak non-string payload values to backend.
4. Replay pruning that removes valid tool pairs (instead of only orphan rows) changes model context and is a regression.

## Related Pages

- [Renderer Chat Payload Docs Hub](README.md)
- [Transcript Session and Rehydrate Reference](../../../transcript_session_and_rehydrate_reference.md)
- [Tool Call/Output and Transparency Section Rendering Reference](tool_call_output_and_transparency_section_rendering_reference.md)
