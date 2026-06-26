---
summary: "Deep reference for chat stream utility modules: tracking reducer semantics, app-runtime thinking text accumulation, screenshot/correlation extraction, and message-target resolution rules."
read_when:
  - When changing `desktopChatStreamTrackingRuntime`, `desktopChatStreamThinkingRuntime`, `desktopChatStreamEventPayloadRuntime`, `desktopChatStreamMessageUpdateRuntime`, or stream message-update selectors.
  - When debugging chunk-append duplication, tool-output correlation IDs, or stream terminal-state timestamps.
title: "Tracking, Formatting, and Message-Update Utility Reference"
---

# Tracking, Formatting, and Message-Update Utility Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `tests/frontend/DesktopChatStreamTrackingRuntime.test.ts`
- `tests/frontend/DesktopChatStreamThinkingRuntime.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

## Stream Tracking Reducer Contract (`DesktopChatStreamTrackingRuntime`)

`DesktopChatStreamTrackingRuntime.applyTrackingEvent(current, eventType, turnRef, now, options)` is a pure reducer used by `useChatStream`.

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

## Thinking Formatting (`DesktopChatStreamThinkingRuntime`)

- `DesktopChatStreamThinkingRuntime.buildThinkingStatus(...)` appends chunks
  and caps final string length at 5000 chars (tail-preserving truncation).
- Generic thinking placeholders and compaction lifecycle labels are exposed
  through semantic facade methods/predicates so chat hooks do not import raw
  status constants or standalone helper exports from the app-runtime adapter.
- Tool-call, bundle-call, and tool-output display text is projected through the
  tool message-state builders used by chat-stream handlers and SDK display-row
  projection, not through separate chat-stream formatting exports.

## Event Payload Contracts (`DesktopChatStreamEventPayloadRuntime`)

- `DesktopChatStreamEventPayloadRuntime.shouldIgnoreStreamError(...)` suppresses known settings-update transport noise through `DesktopSettingsUpdateErrorRuntime` from user-visible assistant error rows.
- `DesktopChatStreamEventPayloadRuntime` does not build screenshot attachment descriptors; SDK display rows and live-turn entries own visual attachment state, and renderer image resolution starts from those `attachments[]` descriptors.
- Tool-call and tool-output correlation id normalization is owned by the SDK
  helper surface imported through the SDK package, not by
  `DesktopChatStreamEventPayloadRuntime`.
- `DesktopChatStreamEventPayloadRuntime.resolveErrorText(...)` precedence:
1. payload content string
2. payload message string
3. `"An error occurred"`

## Message Update Contracts (`DesktopChatStreamMessageUpdateRuntime`)

Message targeting:

- `DesktopChatStreamMessageUpdateRuntime.findLastMessageIdBySender(...)` and
  `DesktopChatStreamMessageUpdateRuntime.findLastAssistantLlmTextMessageId(...)`
  support optional turn scoping.
- `useStreamMessageUpdaters` resolves message ids from live workspace state at
  update time so metadata updates do not rely on stale render snapshots.
- Assistant streaming text append/new behavior is owned by SDK current-turn
  projection and `useConversationRuntimeProjectionStream`, not by standalone
  chat-stream message-update helpers.

Metadata normalization:

- `DesktopChatStreamMessageUpdateRuntime.buildSystemPromptUpdate(...)` and
  `DesktopChatStreamMessageUpdateRuntime.buildToolSchemasUpdate(...)` normalize supported `tool_schemas` into the canonical nested function-schema shape before storing.
- `DesktopChatStreamMessageUpdateRuntime.buildUserMessageFullUpdate(...)` and
  `DesktopChatStreamMessageUpdateRuntime.buildAssistantMessageFullUpdate(...)`
  coerce non-string content to empty string.
- text repair/sanitization for stream chunks and transparency payload text is centralized in `incomingTextNormalization.ts` (mojibake repair + lone-surrogate replacement), shared with the desktop transcript projection/session runtimes.

## Test-Backed Invariants

`tests/frontend/DesktopChatStreamTrackingRuntime.test.ts` locks:

- turn reset semantics (`resetForTurn`)
- first chunk timestamp/counter behavior
- tool counters and completion timestamp
- terminal error state writes (`phase='error'`, `lastError`, `completedAt`)

`tests/frontend/DesktopChatStreamEventPayloadRuntime.test.ts` locks:

- screenshot attachment normalization, stream-error suppression, and error-text
  fallback behavior
`tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx` locks:

- streaming-complete marks last assistant message complete and writes transcript
- stale `streaming-complete` turn does not complete active-turn assistant rows or write transcript entries
- duplicate `streaming-complete` events do not duplicate assistant transcript writes
- transcript-disabled mode skips transcript writes

## Drift Hotspots

1. changing SDK current-turn assistant-text projection can duplicate or fragment assistant rows.
2. removing 5000-char thought cap can increase memory churn on long `llm-thought` streams.
3. changing correlation-id precedence can break tool call/output pairing in transcript and UI detail panes.
4. removing tool-schema shape validation can leak incompatible schema payloads into renderer message metadata.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Chat Store State and New Session Rotation Reference](../chat_store_state_and_new_session_rotation_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
