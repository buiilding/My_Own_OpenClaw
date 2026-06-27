---
summary: "Workflow for changing hosted backend websocket event contracts across backend streaming events, formatter specs, outgoing schemas, SDK projection, typed Electron fan-out, renderer stream handlers, and tests."
read_when:
  - When adding, renaming, formatting, removing, or consuming a backend websocket event.
  - When changing event payload fields, formatter behavior, outgoing schemas, SDK backend-event guards, `windie:conversation-event` routing, chat stream handlers, SDK/local-runtime tool events, token usage events, prompt transparency events, or audio side-channel payloads.
  - When debugging an event that is produced by the backend but missing on the wire, visible in DevTools but ignored by the UI, stale-filtered, malformed, or rendered in the wrong conversation.
title: "WebSocket Event Contract Change Workflow"
---

# WebSocket Event Contract Change Workflow

Use this workflow before changing any event that crosses the backend websocket boundary. The desktop/backend stack uses a shared event vocabulary between backend formatter output, the Agent SDK backend transport, SDK backend-event normalization/projection, typed Electron fan-out channels, and renderer consumers. A change that touches only one side usually becomes a silent bug: the backend emits an event that formatter skips, schema validation rejects, the SDK typed guard ignores, the SDK normalizer fails to project, the typed fan-out channel does not publish, or the chat stream handler drops as stale.

The core rule is: update the producer, formatter, outgoing schema, SDK transport/projection, typed fan-out channel, renderer consumer, and tests as one contract.

## Fast Owner Map

| Change or symptom | First owner | Code roots | Start docs | Focused tests |
| --- | --- | --- | --- | --- |
| add or rename a backend streamed event | backend event contract | `backend/src/core/events/streaming_events.py`, `backend/src/core/types/enums.py`, `backend/src/api/contracts/formatter_specs.py` | [Streaming and Events](../concepts/streaming_and_events.md), Streaming Event to Formatter and Outgoing Contract Alignment Reference (private backend docs) | `tests/backend/test_events.py`, `tests/backend/test_formatter_specs_contract.py`, `tests/backend/test_api_contract_registry.py` |
| change outgoing payload shape | backend formatter and outgoing schema | `backend/src/api/processing/formatters/*`, `backend/src/api/schemas/outgoing.py`, `backend/src/api/contracts/message_types.py` | Formatter Dispatch and Schema Alignment Reference (private backend docs), Formatter Validation and Contract-Test Matrix Reference (private backend docs) | `tests/backend/test_formatters.py`, `tests/backend/test_response_formatter.py`, `tests/backend/test_outgoing_schema_contract.py` |
| event is produced but websocket sends nothing | backend formatter required-field guard or spec registration | formatter spec, formatter class, event dataclass | Base Formatter Guard Utilities and Skip Semantics Reference (private backend docs) | formatter tests for skipped vs emitted cases |
| event reaches the Electron agent host but renderer ignores it | renderer typed event guard, SDK normalizer/projection, typed fan-out channel, or dedicated parser | `packages/windie-sdk-js/src/events/backendEvents.ts`, `packages/windie-sdk-js/src/transport/backendEventNormalizer.ts`, `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`, audio parser when relevant | [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](../frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md) | `tests/frontend/DesktopChatStreamIngressRuntime.test.ts`, `tests/frontend/AgentSdkConversationRuntime.test.ts`, event-specific frontend tests |
| chat text, thinking, terminal, or error state behaves wrong | renderer chat stream handlers | `frontend/src/renderer/features/chat/hooks/useChatStream.ts`, `frontend/src/renderer/features/chat/hooks/chatStream/*`, `frontend/src/renderer/app/runtime/desktopChatStream*.ts` | [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md), [Frontend Chat Stream and Tool Execution Reference](../frontend/renderer/chat_stream_and_tool_execution_reference.md) | `tests/frontend/ChatStream*.test.ts`, `tests/frontend/StreamPhaseState.test.js` |
| tool-call, tool-output, or tool-bundle event changes | backend tool formatter plus SDK conversation/tool runtime and renderer display consumers | backend tool formatters, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, renderer tool message utilities | [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md), [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) | backend tool formatter/result tests plus SDK conversation-runtime and renderer display tests |
| prompt transparency event changes | backend prompt/event presenter plus SDK display/rehydrate projection consumers | `backend/src/agent/llm/event_presenter.py`, prompt events/formatters, SDK conversation projections, backend rehydrate transparency resolution | Prompt Context Change Workflow (private backend docs) | prompt/event tests plus SDK projection and backend rehydrate transparency tests |
| token-count, usage, cache, or thinking status changes | backend token usage event plus renderer token/thinking handlers | token-count formatter, stream processor, renderer thinking/token utilities | [Usage and Token Accounting](../concepts/usage_and_token_accounting.md), Token Count Event and Usage Diagnostics Reference (private backend docs) | backend token/usage tests plus frontend token/thinking tests |
| `audio-chunk` or TTS stream changes | backend TTS/audio path and renderer app-runtime audio parser | `backend/src/api/processing/tts`, `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts` | [Voice Audio Change Workflow](voice_audio_change_workflow.md), Backend TTS Manager (private backend docs) | backend TTS tests plus `tests/frontend/AudioChunkEvents.test.js` |
| settings/model ACK event changes | non-query websocket handlers and app config listeners | backend settings/model handlers, renderer app config event listeners | [Settings and Model ACK Event Routing Reference](../frontend/contracts/events/settings_and_model_ack_event_routing_reference.md), [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md) | backend handler tests plus app config/status frontend tests |

## Boundary Rules

- Backend event dataclasses and `StreamingEventType` own canonical streamed event names for agent/query events.
- `formatter_specs.py` owns the event class plus canonical event type plus formatter class mapping.
- `message_types.py` and `schemas/outgoing.py` own outgoing websocket type constants and payload validation.
- Formatter classes own payload shaping and required-field skip behavior.
- Electron main hosts the Agent SDK runtime, forwards SDK conversation events
  on `windie:conversation-event`, publishes SDK projection snapshots on
  `windie:rows`, `windie:status`, and `windie:current-turn`, and may also update
  overlay phase based on event type.
- SDK `packages/windie-sdk-js/src/events/backendEvents.ts` owns typed backend
  websocket event acceptance. Events outside that set are ignored by typed SDK
  consumers.
- SDK `packages/windie-sdk-js/src/transport/backendEventNormalizer.ts` owns the
  backend-event to conversation-event projection consumed by renderer chat.
- `audio-chunk` is a side-channel with a dedicated parser/channel and should not
  be routed through normal chat conversation-event handlers unless chat
  consumers are intentionally expanded.
- `models-listed`, `settings-updated`, and `settings-loaded` are control ACK events handled by config/status listeners, not normal chat-stream typed events.
- Query-affecting events should preserve `id`, `turn_ref`, `conversation_ref`, `session_id`, and `user_id` when available.
- Do not introduce new legacy aliases. New code should emit canonical kebab-case names.

## Add a New Backend Chat Event

1. Define or update the backend event dataclass in `backend/src/core/events/streaming_events.py`.
2. Add the canonical literal to `StreamingEventType` only if this is a backend streaming event.
3. Add formatter registration in `backend/src/api/contracts/formatter_specs.py`.
4. Add a formatter class under `backend/src/api/processing/formatters`.
5. Add outgoing type constant and schema model in `backend/src/api/contracts/message_types.py` and `backend/src/api/schemas/outgoing.py`.
6. Add schema/registry/formatter tests.
7. Add the renderer TypeScript event type in `packages/windie-sdk-js/src/events/backendEvents.ts`.
8. Add SDK backend-event normalization and renderer consumer logic under chat stream utilities.
9. Add SDK event guard, SDK normalization, and renderer consumer tests.
10. Update [WebSocket Event Reference](../reference/websocket_event_reference.md), [Streaming and Events](../concepts/streaming_and_events.md), and any family-specific docs.

## Change an Existing Event Payload

1. Find the backend formatter that shapes the outbound payload.
2. Update the outgoing Pydantic schema first so invalid payload assumptions fail in backend tests.
3. Update formatter tests for required fields, optional fields, skip behavior, and dict-vs-typed event parity.
4. Update renderer TypeScript payload type and parsing/guard utilities.
5. Update all renderer consumers that read the changed field.
6. Preserve aliases only when old persisted transcript/replay rows or older backend dict events still need compatibility.
7. Update docs that list the payload fields and validation targets.

## Change Event Routing or Filtering

1. Preserve correlation fields at the backend formatter layer.
2. Confirm the Electron agent host publishes the event through the expected SDK projection or typed side-channel and does not swallow it as a special case.
3. Update SDK `isBackendEvent(...)` only for typed backend websocket events.
4. Update SDK normalization and consumer coverage for every typed chat event.
5. Update active conversation and turn guards when event ownership depends on `conversation_ref` or `turn_ref`.
6. Add tests for matching conversation, stale conversation, matching turn, stale turn, and missing context fields where relevant.

## Change a Terminal Event

Terminal events are high risk because they release UI busy states, stop overlay loops, flush transcript rows, and end TTS/stream lifecycle.

1. Identify whether the terminal condition is success, cancellation, user stop, provider error, parser error, or transport error.
2. Keep exactly one terminal event per user turn unless the docs/tests explicitly cover duplicates.
3. Preserve final response text on `streaming-complete` when the renderer needs backfill.
4. Preserve error message and sanitized content on `error`.
5. Update overlay phase mapping in Electron main if event phase semantics change.
6. Validate stream state machine, terminal handoff guard, transcript writer, and query lifecycle tests.

## Change Tool Events

Tool events are both UI state and SDK runtime execution requests.

1. Update backend tool event dataclass/formatter/schema.
2. Preserve `tool_name`, executable parameters, request id/correlation id, and metadata.
3. Preserve `skip_local_execution` semantics for recovery/synthetic paths.
4. Update SDK runtime normalization/router behavior and renderer tool message rendering.
5. Update transcript persistence for tool-call/tool-output rows.
6. Update backend tool-result ingress/history tests if result payloads change.

## Debug Checklist

### Backend Produces Event but WebSocket Sends Nothing

- Confirm the event has the expected canonical `type`.
- Confirm `(event class, event type)` exists in `get_formatter_specs()`.
- Confirm the formatter returns a payload instead of `None`.
- Confirm required formatter fields are present.
- Confirm outgoing schema has the same `type: Literal[...]`.
- Confirm contract registry tests know the new type.

### DevTools Shows Event but UI Ignores It

- Confirm the event is a typed chat event or a side-channel/control event.
- For typed chat events, confirm `BACKEND_EVENT_TYPES` includes the type.
- Confirm the SDK normalizer maps it to a conversation event before renderer
  dispatch.
- Confirm active conversation/turn filters are not dropping it.
- Confirm payload field names match the renderer consumer.
- For audio, confirm `extractDesktopAudioChunkPayload(...)` accepts the shape.

### Event Updates Wrong Conversation

- Confirm backend formatter attaches `conversation_ref` and `turn_ref`.
- Confirm the Electron agent host does not overwrite conversation context with stale fallback.
- Confirm renderer transcript session sync has the active conversation ref.
- Confirm chat stream conversation and turn guards are applied before state updates.

### Event Works Live but Fails Replay or Transcript

- Confirm transcript writer persists the fields needed later.
- Confirm replay and rehydrate payload builders understand the event-derived row.
- Confirm backend rehydrate normalizes any tool/history payloads before strict provider replay.

## Validation Matrix

| Changed surface | Minimum checks |
| --- | --- |
| backend event dataclass/type/spec | `./scripts/python-in-env backend pytest tests/backend/test_events.py tests/backend/test_formatter_specs_contract.py tests/backend/test_api_contract_registry.py` |
| formatter/outgoing schema | `./scripts/python-in-env backend pytest tests/backend/test_formatters.py tests/backend/test_response_formatter.py tests/backend/test_outgoing_schema_contract.py` |
| query stream pipeline | `./scripts/python-in-env backend pytest tests/backend/test_stream_pipeline.py tests/backend/test_query_execution_pipeline_events.py tests/backend/test_query_execution_stream_state.py` |
| renderer typed guard/SDK dispatch | `cd frontend && npm run test -- DesktopChatStreamIngressRuntime DesktopChatStreamEventRuntime AgentSdkConversationRuntime` |
| renderer stream state/terminal behavior | focused `ChatStream*`, `StreamPhaseState`, and terminal handoff tests |
| tool event changes | backend tool formatter/result tests plus SDK/local-runtime and renderer display tests (`AgentSdkConversationRuntime`, `LocalRuntimeExecuteToolRuntime`, `ToolOutputMessageState`) |
| audio event changes | backend TTS tests plus `cd frontend && npm run test -- AudioChunkEvents` |
| docs-only event workflow | `<windie> docs list`, `git diff --check`, focused Markdown link check |

## Review Checklist

- Event name is canonical kebab-case and appears in every required backend and frontend registry.
- Formatter output and outgoing schema agree on required and optional fields.
- Renderer typed union, runtime guard, SDK normalization, and consumer tests all know the event if it is a typed chat event.
- Side-channel or ACK events are documented as side-channel/ACK events instead of accidentally joining chat stream handling.
- Correlation fields are preserved for events that affect chat, transcript, tools, or terminal state.
- Terminal event behavior is explicit for success, cancellation, stop, and error paths.
- Tool events preserve executable payload, metadata, request ids, and transcript/history linkage.
- Docs and tests identify producer, transport, consumer, and replay/rehydrate impacts.

## Related Docs

- [Channels Hub](README.md)
- [Streaming and Events](../concepts/streaming_and_events.md)
- [WebSocket Event Reference](../reference/websocket_event_reference.md)
- Backend Streaming Events Contracts Hub (private backend docs)
- Streaming Event to Formatter and Outgoing Contract Alignment Reference (private backend docs)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](../frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md)
- Query Lifecycle Change Workflow (private backend docs)
