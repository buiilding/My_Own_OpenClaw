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

- `frontend/src/renderer/features/chat/utils/session/transcriptMessagePayload.js`
- `frontend/src/renderer/infrastructure/transcript/rehydratePayload.js`
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

## Shared Rehydrate Payload Helpers

`transcriptMessagePayload.js` now delegates payload-field normalization to
`infrastructure/transcript/rehydratePayload.js` so edit/retry and dashboard-open
rehydrate flows use one canonical contract for:

- transparency normalization (`systemPrompt`, `toolSchemas`, full user/assistant payloads)
- full-content restoration rules (`fullUserMessage` / `fullAssistantMessage`)
- tool-call payload parsing (`id`, `name`, `arguments`, `thought_signature`)

## Rehydrate Payload Shape

`toRehydratePayload(message)` returns:

- `role`
- `content`
- `message_type`
- `tool_name` (tool outputs and tool-call rows)
- `correlation_id` (tool outputs and tool-call rows)
- `tool_call_id` (tool outputs and tool-call rows when resolvable)
- `timestamp`
- `screenshot_ref`
- `screenshot`

Normalization details:

- text defaults to empty string
- screenshot attachments are normalized through `screenshotMessageState.js`
- artifact refs are inferred from stored artifact URLs when possible
- inline screenshots are preserved when no artifact ref exists
- non-tool roles force `tool_name`/`correlation_id` to `null`

## Call-Site Usage

`ChatInterface` edit/retry paths use these helpers when rebuilding transcript rows and backend rehydrate payloads:

- transcript rewrite loop uses `resolveTranscriptRole` + `resolveTranscriptMessageType`
- replay screenshot rewrite uses `resolveStoredTranscriptScreenshotValue(...)` so stored transcript rows keep either the artifact ref or the inline screenshot payload
- final payload shaping uses the shared `rehydrateMessageState.js` helper so live replay and stored-memory replay emit the same tool metadata contract
- backend rehydrate request uses `preservedMessages.map(toRehydratePayload)`
- backend resend query uses normalized screenshot fields so retry/edit paths do not drop inline screenshots that were never materialized as artifact refs

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
