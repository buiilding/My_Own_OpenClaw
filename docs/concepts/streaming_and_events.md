---
summary: "Conceptual guide to backend websocket streaming events, SDK tool coordination, renderer consumers, audio side-channel, and stale-turn filtering."
read_when:
  - When changing websocket event names, payloads, formatter behavior, SDK tool coordination, renderer stream handling, or audio chunks.
  - When debugging an event that appears on the wire but is ignored, duplicated, stale, or rendered in the wrong conversation.
title: "Streaming and Events"
---

# Streaming and Events

Backend streaming events are the live contract between the hosted backend, SDK
runtime, and renderer surfaces. Backend events are normalized by the SDK
runtime; Electron main is a thin Electron agent host that forwards SDK rows, status,
normalized conversation events, and current-turn projections on `windie:*`
channels. Renderer listeners render those SDK outputs instead of interpreting
backend-wire websocket packets.

## Main Event Families

| Family | Examples | Primary consumer |
| --- | --- | --- |
| assistant stream | `llm-thought`, `streaming-response`, `streaming-complete`, `error` | chat stream hooks and message store |
| tool turns | `tool-call`, `tool-bundle`, `tool-output` | SDK tool coordinator, chat stream, transcript writer |
| transparency | `system-prompt`, `user-message-full`, `assistant-message-full`, `tool-schemas` | message transparency sections |
| context management | `context-compaction-started`, `context-compaction-completed`, `context-compaction-failed` | chat stream and compaction UI state |
| model-history | `model-history-updated` | SDK hidden checkpoint persistence |
| usage/status | `token-count` | token display and usage diagnostics |
| config/model status | `models-listed`, `settings-updated` | app config/status providers |
| audio side-channel | `audio-chunk` | dedicated audio parser/player, not the typed chat event union |

Stop is control traffic, not an assistant stream event. The renderer/SDK
terminalizes the current turn locally when Stop is requested; the backend
`stop-query` handler only acknowledges cancellation with `stop-query-ack` and
must not emit a synthetic `streaming-complete`.

## Event Path

1. Backend agent/services emit typed internal events.
2. Backend formatter layer maps events to outgoing websocket payloads.
3. Outgoing schema validation checks payload shape.
4. The Agent SDK runtime receives backend websocket messages, normalizes them into conversation events, updates display rows/current-turn state, and coordinates any local tool execution.
5. Electron main forwards SDK events to renderer windows on `windie:conversation-event`, `windie:rows`, `windie:current-turn`, and `windie:status`.
6. Renderer consumers accept or ignore SDK events by conversation/turn identity and update UI, transcript queues, overlay phase, and token/usage display.

## Correlation Fields

Most query events should carry:

- `id`
- `turn_ref`
- `conversation_ref`
- `session_id`
- `user_id`

Renderer filtering depends on these fields. Missing or renamed correlation fields can make events appear valid while still being dropped as stale, wrong-conversation, or unowned.

## Tool Event Rule

Backend tool-call events are both display events and execution requests. The SDK runtime must:

1. normalize the backend event into a conversation event,
2. execute claimed local tools through the SDK local-runtime client and sidecar,
3. append normalized tool output events,
4. emit SDK display rows/current-turn updates for the renderer,
5. send `tool-result` or `tool-bundle-result` back to the backend.

The renderer renders display-only tool state and transcript projections. Do not reintroduce renderer-side backend tool-result delivery.

## Change Rules

- Use [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md) before adding, renaming, formatting, or consuming a backend websocket event.
- Add backend event types to backend event constants, formatter dispatch, outgoing schema, renderer guards, and consumer matrices together.
- Keep `audio-chunk` on its dedicated parser path unless the renderer typed event union is intentionally expanded.
- Preserve `turn_ref` and `conversation_ref` on events that affect active chat state.
- Do not change event names just in frontend or backend. The transport vocabulary is a shared contract.
- When a provider emits native events, normalize them into backend websocket
  event names before SDK projection and renderer consumption.

## Debug Routing

| Symptom | Start here |
| --- | --- |
| event is visible in DevTools but ignored | SDK `backendEvents.ts` guard, SDK projection path, typed fan-out channel, and consumer matrix |
| event never reaches renderer | backend formatter/schema path, Agent SDK backend transport, or typed Electron fan-out channel |
| text streams into the wrong chat | `conversation_ref` filtering and transcript session sync |
| tool call renders but does not execute | SDK tool coordinator, Electron main SDK local-runtime client, and local-runtime bridge |
| audio text exists but no sound plays | `audio-chunk` side-channel parser and playback queue |
| token count absent | backend token event emission and renderer token-count consumer |

## Deep Docs

- [Channels Hub](../channels/README.md)
- [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md)
- [Backend Streaming Events Contracts Hub](../backend/contracts/events/README.md)
- [Backend Formatter Dispatch and Schema Alignment](../backend/api/processing/formatter_dispatch_and_schema_alignment_reference.md)
- [Frontend Backend Event Consumer Matrix](../frontend/contracts/backend_event_consumer_matrix_reference.md)
- [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md)
- [Frontend Chat Stream and Tool Execution Reference](../frontend/renderer/chat_stream_and_tool_execution_reference.md)
- [Token Count Event and Usage Diagnostics Reference](../backend/runtime/token_count_event_and_usage_diagnostics_reference.md)

## Evidence Notes

- Preserve raw event order when diagnosing stream bugs; sorted or grouped logs
  can hide the transition that caused stale UI state.
- Verify both the event formatter and the renderer consumer when a field is
  present in backend code but absent from the visible UI.
