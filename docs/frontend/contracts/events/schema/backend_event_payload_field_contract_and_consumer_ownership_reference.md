---
summary: "Deep reference for frontend backend event schemas: typed union field contracts, per-event payload keys, and renderer consumer ownership across chat/tool/config/status/audio paths."
read_when:
  - When adding a new backend event type or editing payload fields in `backendEvents.ts`.
  - When diagnosing renderer behavior drift caused by event field rename/removal.
title: "Backend Event Payload Field Contract and Consumer Ownership Reference"
---

# Backend Event Payload Field Contract and Consumer Ownership Reference

## Canonical Modules

- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/backendAudioEvents.js`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`

## Typed Union Contract

`BackendEventType` currently includes:

- `llm-thought`
- `streaming-response`
- `streaming-complete`
- `context-compaction-started`
- `context-compaction-completed`
- `context-compaction-failed`
- `tool-call`
- `tool-output`
- `tool-bundle`
- `local-user-message`
- `system-prompt`
- `user-message-full`
- `assistant-message-full`
- `memory-store`
- `token-count`
- `tool-schemas`
- `error`

`isBackendEvent(value)` accepts objects with `type` in this static set only.

## Base Envelope Fields

All typed events share optional context keys:

- `id`
- `session_id`
- `user_id`
- `conversation_ref`
- `turn_ref`

These fields drive turn/conversation guards, transcript session updates, and correlation behavior.

## Payload Field Highlights by Event

### `streaming-response`

- `payload.text?: string`
- consumed by chat stream append/new assistant message logic

### `tool-call`

- `payload.tool_name?: string`
- `payload.parameters?: Record<string, unknown>`
- `payload.correlation_id?: string`
- `payload.request_id?: string`
- `payload.metadata?.model_facing_tool_call?: { id?, name?, arguments? }`

Used by:

- chat UI tool-call rendering (`modelFacingToolCall`)
- tool runner execution correlation and fallback request-id routing

### `tool-output`

- `payload.tool_name?: string`
- `payload.success?: boolean`
- `payload.execution_time?: number|null`
- `payload.output?: string`
- `payload.error?: string|null`
- `payload.screenshot?: string|null`
- `payload.screenshot_ref?: string|null`
- `payload.metadata?: Record<string, unknown>`
- `payload.request_id?: string`

Used by:

- tool-output message text rendering
- screenshot attachment resolution
- transcript tool-output correlation fallback

### `tool-bundle`

- `payload.bundle_id?: string`
- `payload.tools?: [{ name?, args?, metadata?.model_facing_tool_call? }]`

Used by:

- tool runner bundle execution + relay
- chat stream tool-bundle summary rendering

### `local-user-message`

- `payload.text?: string`
- `payload.screenshot_ref?: string|null`
- `payload.screenshot_refs?: string[]|null`
- `payload.screenshot_url?: string|null`
- `payload.timestamp?: string`

Used by:

- optimistic user message insertion before backend query send result
- multi-image attachment rendering parity with query payload artifacts

### `token-count`

- payload typed as `TokenCounts` store model
- used by token display and usage tracking UI

### `context-compaction-*`

- `context-compaction-started.payload.reason|strategy|before_tokens|projected_tokens`
- `context-compaction-completed.payload.reason|strategy|before_tokens|after_tokens|removed_messages|summary_preview|skipped_reason`
- `context-compaction-failed.payload.reason|strategy|error|before_tokens`

Used by:

- stream phase/status UI transitions around manual/auto compaction
- chat timeline system-state messaging for compaction lifecycle

### `memory-store`

- `payload.user_query?: string`
- `payload.assistant_response?: string`
- `payload.memory_type?: string`
- `payload.user_id?: string`
- `payload.session_id?: string`

Used by:

- renderer/store paths that persist interaction memory rows
- session/conversation correlation filtering for memory-write fanout

### `error`

- `payload.message?: string`
- `payload.content?: string|null`

Used by:

- chat stream error row synthesis
- status provider save-error detection (`Failed to update settings` substring)

## Non-Typed Backend Event Consumers

Not all `from-backend` events use `isBackendEvent`.

Important untyped paths:

- `audio-chunk`: parsed by `extractAudioChunkPayload(...)`
- `models-listed`: consumed by `routeConfigBackendEvent(...)`
- `settings-updated`: consumed by `AppStatusProvider` listener

This means adding events to backend wire protocol may require both:

- typed union updates, and
- non-typed listener updates when event is outside chat/tool stream surface.

## Consumer Ownership Matrix (Condensed)

- `useChatStream`: typed union main consumer, message/transcript/token updates
- `useToolRunner`: typed subset (`tool-call`, `tool-bundle`) + stale-turn cancellation logic
- `ChatInterface` audio listener: untyped `audio-chunk`
- `appConfigEvents`: untyped `models-listed`
- `AppStatusProvider`: `settings-updated` + settings-specific `error` branch

## Drift Hotspots

1. backend emits new event type but typed union set is not updated.
2. payload key rename in backend without corresponding consumer update.
3. moving an event from typed to untyped path (or reverse) without adjusting listeners.
4. dropping `conversation_ref` / `turn_ref` fields weakens stale-turn and conversation guards.

## Related Pages

- [Frontend Backend Event Schema Docs Hub](README.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](../from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Backend Event Consumer Matrix Reference](../../backend_event_consumer_matrix_reference.md)
- [Schema Generation and Event Guard Reference](../../schema_generation_and_event_guard_reference.md)
