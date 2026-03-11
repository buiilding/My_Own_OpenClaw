---
summary: "Deep reference for frontend handling of backend tool protocol events with recovery metadata: event typing, UI/transcript effects, skip-frontend-execution gate, stale-turn cancellation responses, and correlation-id fallback order."
read_when:
  - When changing `useChatStream` or `useToolRunner` tool event paths.
  - When debugging synthetic backend tool events that should render in chat but not execute local tools.
title: "Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference"
---

# Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference

## Canonical Modules

- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/api/processing/formatters/tool_call.py`
- `backend/src/api/processing/formatters/tool_output.py`

## Event Contract Surface (Renderer Types)

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

## Dual-Consumer Design: `useChatStream` vs `useToolRunner`

### `useChatStream`

Consumes tool events for presentation/transcript side effects:

- appends assistant tool-call/tool-output rows
- updates stream tracking phase counters
- records transcript tool messages

It does not execute tools.

### `useToolRunner`

Consumes tool events for execution/control plane:

- executes local tools for actionable `tool-call` or `tool-bundle`
- sends `tool-result` / `tool-bundle-result` to backend
- applies stale-turn and skip-execution gates before execution

This split allows synthetic or non-executable tool protocol events to be visible in chat while remaining non-executable in local sidecar.

## Skip-Execution Metadata Contract

`useToolRunner.shouldSkipToolExecution(metadata)` returns true when:

- metadata is object-like
- `metadata.skip_frontend_execution === true`

When true:

- no local tool execution occurs
- no cancellation payload is sent (event is intentionally acknowledged as non-executable)
- `useChatStream` still renders the event message

This is critical for backend recovery path that emits synthetic tool protocol events.

## Backend Recovery Path Compatibility

Backend malformed-tool-call recovery emits synthetic events with metadata:

- `skip_frontend_execution = true`
- `llm_tool_call_validation_failed = true`
- `request_id = <synthetic_or_extracted_id>`
- optional preview fields:
  - `llm_tool_call_raw_tool_call_preview`
  - `llm_tool_call_raw_arguments_preview`
  - `llm_tool_call_parse_error`

Transport guarantee:

- `ToolCallEventFormatter` forwards `request_id` + `metadata`
- `ToolOutputEventFormatter` forwards `metadata`

Frontend outcome:

- chat shows tool-call/tool-output narrative
- `useChatStream` stores a dedicated tool-call display string on the chat message, so tool-call cards no longer depend on generic `message.text` for invalid-call transparency rendering
- tool-call cards prefer `llm_tool_call_raw_tool_call_preview` when present; otherwise they render preserved `metadata.model_facing_tool_call` for pre-dispatch validation failures instead of a synthesized normalized fallback
- tool runner skips local execution for synthetic call
- stream can continue to next model turn

## Stale-Turn Cancellation Path

`shouldIgnoreToolEventForTurn(turnRef)` in `useToolRunner` rejects events when:

- no active turn exists for provided turn ref
- turn ref mismatches active turn
- stream phase is terminal (`idle`, `complete`, `error`)

On stale events:

- stale `tool-call` -> send `tool-result` failure `{ error: 'frontend_stale_turn_cancelled' }`
- stale `tool-bundle` -> send `tool-bundle-result` failure with same error marker

This behavior differs from skip-execution metadata: stale events actively notify backend cancellation.

## Correlation ID Semantics

### Tool-call execution correlation (`useToolRunner`)

`resolveToolCallCorrelationId(payload, event.id)` order:

1. `payload.correlation_id`
2. `payload.request_id`
3. `event.id`
4. generated UUID

### Tool-output display/transcript correlation (`useChatStream`)

`resolveToolOutputCorrelationId(payload, eventId)` order:

1. `payload.request_id`
2. `payload.metadata.request_id`
3. `eventId`

This allows correlation even when formatter omits explicit `request_id` in output payload but metadata carries it.

## Tracking and Late-Result Suppression

`useToolRunner` tracks correlation id -> turn ref map.

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

1. verify `metadata.skip_frontend_execution` survives formatter/output contract
2. verify `useToolRunner` receives metadata object (not array/non-object)
3. verify no local mutation strips metadata before handler

If tool-output correlation is missing:

1. inspect `payload.request_id`
2. inspect `payload.metadata.request_id`
3. inspect event envelope `id`

If stale-turn cancellations are firing incorrectly:

1. inspect `streamTracking.activeTurnRef`
2. inspect phase transitions around completion/error
3. inspect event `turn_ref` values from backend

## Related Pages

- [Frontend Events Tool Runtime Docs Hub](README.md)
- [Frontend Contracts Events Docs Hub](../README.md)
- [Backend Agent Recovery Docs Hub](../../../../backend/agent/recovery/README.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](../../../../backend/agent/recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
