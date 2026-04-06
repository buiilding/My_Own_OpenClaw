---
summary: "Deep reference for chat stream utility modules: tracking reducer semantics, thinking/tool payload formatting, screenshot/correlation extraction, and message-target resolution rules."
read_when:
  - When changing `chatStreamTracking`, `chatStreamFormatting`, `chatStreamEventUtils`, or `chatStreamMessageUpdates`.
  - When debugging chunk-append duplication, tool-output correlation IDs, or stream terminal-state timestamps.
title: "Tracking, Formatting, and Message-Update Utility Reference"
---

# Tracking, Formatting, and Message-Update Utility Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamFormatting.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `tests/frontend/ChatStreamTracking.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

## Stream Tracking Reducer Contract (`chatStreamTracking.ts`)

`applyTrackingEvent(current, eventType, turnRef, now, options)` is a pure reducer used by `useChatStream`.

Core behavior:

- `resetForTurn=true` seeds a fresh state:
- `phase='awaiting-first-chunk'`
- `startedAt=now`
- counters reset
- `eventCount=1`
- non-reset path increments `eventCount`, stamps `lastEventAt`, sets `lastEventType`
- `streaming-response` increments `chunkCount`, sets `lastChunkSize`, writes first `firstChunkAt`
- `toolCall` and `toolOutput` options increment corresponding counters and default phase when not explicitly provided
- `errorText` option forces terminal behavior:
- sets `lastError`
- phase defaults to `error`
- writes `completedAt=now`
- explicit `phase='complete'` stamps `completedAt` when missing

`turnRef ?? current.activeTurnRef` is used as the resolved active turn source, so late events without turn IDs still stay attached to current turn context.

## Formatting Utilities (`chatStreamFormatting.ts`)

### Thinking status accumulation

- `buildThinkingStatus` appends chunks and caps final string length at 5000 chars (tail-preserving truncation).

### Tool call/bundle transparency payloads

- `formatToolCallPayload` serializes model-facing call payload as pretty JSON.
- `resolveModelFacingToolCall` chooses metadata model payload first; falls back to execution payload fields:
- `id` from `metadata.model_facing_tool_call.id`
- `name` from model-facing payload else `tool_name`
- `arguments` from model-facing args else execution parameters
- `formatToolBundlePayload` maps each tool step to model-facing shape when present; else falls back to tool args.

### Tool output text priority

- `formatToolOutputText` precedence:
1. non-empty `payload.output`
2. `Error: ${payload.error}`
3. `"No output"`

This keeps renderer text aligned with model-facing output when both output and error fields exist.

## Event Utility Contracts (`chatStreamEventUtils.ts`)

- `shouldIgnoreStreamError` suppresses known settings-update transport noise (`"Failed to update settings"`) from user-visible assistant error rows.
- `buildScreenshotAttachment` normalizes `screenshotRef` and derives URL from `buildArtifactUrl(ref)` when URL missing.
- `resolveToolOutputCorrelationId` precedence:
1. `payload.request_id`
2. `payload.metadata.request_id` (legacy bridge fallback)
3. event id
4. `undefined`
- `resolveErrorText` precedence:
1. payload content string
2. payload message string
3. `"An error occurred"`

## Message Update Utilities (`chatStreamMessageUpdates.ts`)

Message targeting:

- `findLastMessageIdBySender` and `findLastAssistantLlmTextMessageId` support optional turn scoping.
- `findStreamingCompleteAssistantMessage` is strict when `turnRef` is provided:
  - only same-turn assistant `llm-text` messages are eligible
  - no cross-turn fallback when scoped lookup misses
  - global last assistant fallback is used only when no `turnRef` is provided

Streaming append/new split:

- `resolveStreamingResponseAction` appends only when last message is incomplete assistant `llm-text` in same turn.
- otherwise returns `"new"` action with normalized chunk text.

Metadata normalization:

- `buildSystemPromptUpdate` and `buildToolSchemasUpdate` normalize supported `tool_schemas` into the canonical nested function-schema shape before storing.
- `buildUserMessageFullUpdate` and `buildAssistantMessageFullUpdate` coerce non-string content to empty string.
- text repair/sanitization for stream chunks and transparency payload text is centralized in `incomingTextNormalization.ts` (mojibake repair + lone-surrogate replacement), shared with `TranscriptWriter`.

## Test-Backed Invariants

`tests/frontend/ChatStreamTracking.test.ts` locks:

- turn reset semantics (`resetForTurn`)
- first chunk timestamp/counter behavior
- tool counters and completion timestamp
- terminal error state writes (`phase='error'`, `lastError`, `completedAt`)

`tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx` locks:

- metadata-request-id fallback for tool-output correlation
- streaming-complete marks last assistant message complete and writes transcript
- stale `streaming-complete` turn does not complete active-turn assistant rows or write transcript entries
- duplicate `streaming-complete` events do not duplicate assistant transcript writes
- transcript-disabled mode skips transcript writes

## Drift Hotspots

1. changing `resolveStreamingResponseAction` append criteria can duplicate or fragment assistant rows.
2. removing 5000-char thought cap can increase memory churn on long `llm-thought` streams.
3. changing correlation-id precedence can break tool call/output pairing in transcript and UI detail panes.
4. removing tool-schema shape validation can leak incompatible schema payloads into renderer message metadata.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Chat Store State and New Session Rotation Reference](../chat_store_state_and_new_session_rotation_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
