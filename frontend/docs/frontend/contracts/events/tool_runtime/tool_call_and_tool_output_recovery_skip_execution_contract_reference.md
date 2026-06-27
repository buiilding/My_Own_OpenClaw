---
summary: "Deep reference for frontend display handling of backend tool protocol events with recovery metadata: event typing, UI/transcript effects, SDK-owned execution, and correlation-id fallback order."
read_when:
  - When changing `useChatStream` tool display paths or SDK runtime tool execution paths.
  - When debugging synthetic backend tool events that should render in chat but not execute local tools.
title: "Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference"
---

# Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference

## Canonical Modules

- `packages/windie-sdk-js/src/events/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- private backend implementation
- private backend implementation
- private backend implementation

## Event Contract Surface (Backend Wire)

`ToolCallEvent.payload` fields used by renderer:

- `tool_name`
- `parameters`
- `correlation_id` (optional)
- `request_id` (optional)
- `metadata` (optional)

`ToolOutputEvent.payload` fields used by renderer:

- `tool_name`, `success`, `output`, `error`, `execution_time`
- optional screenshot fields
- `metadata`
- optional `request_id`

Ingress type guard is `isBackendEvent(...)` with literal event-type set containing `tool-call`, `tool-output`, and `tool-bundle`.

## Split Ownership: Renderer Display vs SDK Execution

### `useChatStream`

Consumes tool events for presentation/transcript side effects:

- appends assistant tool-call/tool-output rows
- updates stream tracking phase counters
- records transcript tool messages

It does not execute tools.

### SDK Runtime Tool Coordinator

Consumes tool events for execution/control plane:

- executes local tools for actionable `tool-call` or `tool-bundle`
- sends `tool-result` / `tool-bundle-result` to backend
- applies stale-turn and skip-execution gates before execution

This split allows synthetic or non-executable tool protocol events to be
visible in chat while remaining non-executable in the SDK local runtime.

## Skip-Execution Metadata Contract

The SDK tool coordinator treats a tool event as display-only when backend wire
metadata indicates skipped local execution:

- metadata is object-like
- `metadata.skip_local_execution === true`

When true:

- no local tool execution occurs
- the SDK claim reason is `backend-skipped-local-execution`
- no cancellation payload is sent (event is intentionally acknowledged as non-executable)
- SDK projections expose `executionSkipped`
- renderer surfaces still render the event message from SDK projections

This is critical for backend recovery path that emits synthetic tool protocol events.

## Backend Recovery Path Compatibility

Backend malformed-tool-call recovery emits synthetic events with metadata:

- `skip_local_execution = true`
- `llm_tool_call_validation_failed = true`
- `request_id = <synthetic_or_extracted_id>`
- optional preview fields:
  - `llm_tool_call_raw_tool_call_preview`
  - `llm_tool_call_raw_arguments_preview`
  - `llm_tool_call_parse_error`

Transport guarantee:

- `ToolCallEventFormatter` forwards `request_id` + `metadata`
- `ToolOutputEventFormatter` forwards `metadata`

SDK projection outcome:

- current-turn tool events and live presentation entries expose
  `executionSkipped`, `toolCallValidationFailed`, `rawToolCallPreview`,
  `rawArgumentsPreview`, `parseError`, `toolDisplayMetadata`, and normalized
  bundled `toolCalls`
- renderer chat shows tool-call/tool-output narrative from those SDK-shaped
  fields
- tool-call cards prefer `rawToolCallPreview` when present; otherwise they
  render preserved `modelFacingToolCall` for pre-dispatch validation failures
  instead of a synthesized normalized fallback
- SDK tool coordinator skips local execution for synthetic calls and reports
  `backend-skipped-local-execution`
- stream can continue to next model turn

## Stale-Turn Cancellation Path

SDK turn-scoped tool execution rejects events when:

- no active turn exists for provided turn ref
- turn ref mismatches active turn
- stream phase is terminal (`idle`, `complete`, `error`)

On stale events:

- stale `tool-call` -> send `tool-result` failure `{ error: 'frontend_stale_turn_cancelled' }`
- stale `tool-bundle` -> send `tool-bundle-result` failure with same error marker

This behavior differs from skip-execution metadata: stale events actively notify backend cancellation.

## Correlation ID Semantics

### Tool-call execution correlation

SDK tool coordination resolves correlation ids in this order:

1. `payload.correlation_id`
2. `payload.request_id`
3. `event.id`
4. generated UUID

### Tool-output display/transcript correlation

The SDK `resolveToolOutputCorrelationId(payload, eventId)` helper is imported
through the SDK package; renderer chat-stream utilities do not wrap it. Helper
precedence:

1. `payload.requestId` / `payload.request_id`
2. `payload.toolCallId` / `payload.tool_call_id`
3. `payload.metadata.toolCallId` / `payload.metadata.tool_call_id`
4. `eventId`

This keeps correlation on canonical output payload fields while still allowing
tool-call linkage metadata to pair output rows with model-facing tool calls.

## Tracking and Late-Result Suppression

SDK runtime state tracks correlation id -> turn ref mappings.

Suppression rules:

- execution callbacks ignored when correlation id not tracked
- tracked map pruned on terminal phases and turn switches
- outbound payloads with untracked correlations are dropped

This reduces cross-turn leakage from late async completions.

## Chat/Transcript Side Effects for Tool Events

`useChatStream` tool-call handler:

- adds assistant message `type='tool-call'`
- records transcript as `messageType='tool-call'`
- uses `request_id`/`correlation_id` as transcript correlation id when present

`useChatStream` tool-output handler:

- adds assistant message `type='tool-output'`
- stores `toolMetadata`, `toolName`, `executionTime`, `success`, `correlationId`
- transcript record uses resolved correlation id and screenshot refs

So synthetic recovery events still produce consistent UI/transcript breadcrumbs.

## Failure Debug Checklist

If synthetic tool events execute unexpectedly:

1. verify backend `metadata.skip_local_execution` survives formatter/output contract
2. verify SDK backend event normalization receives metadata object (not array/non-object)
3. verify no local mutation strips metadata before handler

If tool-output correlation is missing:

1. inspect `payload.request_id`
2. inspect `payload.tool_call_id`
3. inspect `payload.metadata.tool_call_id`
4. inspect event envelope `id`

If stale-turn cancellations are firing incorrectly:

1. inspect `streamTracking.activeTurnRef`
2. inspect phase transitions around completion/error
3. inspect event `turn_ref` values from backend

## Related Pages

- [Frontend Events Tool Runtime Docs Hub](README.md)
- [Frontend Contracts Events Docs Hub](../README.md)
- Backend Agent Recovery Docs Hub (private backend docs)
- Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference (private backend docs)
