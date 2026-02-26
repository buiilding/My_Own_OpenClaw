---
summary: "Canonical backend websocket protocol matrix: handshake contract, incoming schemas, route bindings, outgoing schema subset, formatter mappings, and transport envelope context fields."
read_when:
  - When adding/removing websocket message types or changing payload fields.
  - When updating handler registration, schema unions, or stream formatter routing.
title: "Backend WebSocket Protocol Surface Matrix Reference"
---

# Backend WebSocket Protocol Surface Matrix Reference

## Coverage Snapshot (2026-02-26)

- Incoming message types: `10` (`INCOMING_MESSAGE_TYPES`)
- Schema-validated outgoing message types: `19` (`OUTGOING_SCHEMA_MESSAGE_TYPES`)
- Incoming routes: `10` (`INCOMING_ROUTES`)
- Formatter specs: `16` (`get_formatter_specs()`)

## Scope and Sources

This page maps the live websocket protocol owned by backend runtime code:

- Handshake + lifecycle: `backend/src/api/routes/websocket/__init__.py`, `backend/src/api/routes/websocket/connection.py`
- Incoming parsing/validation: `backend/src/api/routes/websocket/message_handler.py`
- Message envelope primitives: `backend/src/api/schemas/common.py`
- Incoming/outgoing schema unions: `backend/src/api/schemas/incoming.py`, `backend/src/api/schemas/outgoing.py`, `backend/src/api/schemas/__init__.py`
- Canonical message type constants: `backend/src/api/contracts/message_types.py`
- Incoming route table: `backend/src/core/container/incoming_routing.py`
- Handler registry wiring: `backend/src/core/container/api_container.py`, `backend/src/api/infrastructure/registry.py`
- Event formatter map: `backend/src/api/contracts/formatter_specs.py`, `backend/src/api/processing/formatter.py`
- Transport envelope helpers: `backend/src/api/transport/envelope.py`, `backend/src/api/infrastructure/errors.py`

## Handshake Contract (Pre-Message)

Before any `BaseMessage` payload, backend expects a handshake payload:

| Stage | Required shape | Validator | Failure behavior |
|---|---|---|---|
| Initial websocket frame | `{ "type": "handshake", "user_id": "..." }` | `HandshakeMessage` in `schemas/common.py` | Connection closes with policy violation (`1008`) |

Notes:

- `user_id` is validated with shared `validate_user_id(...)` rules.
- Handshake success returns server-side `user_id` for route loop context.

## Incoming Message Contract Matrix

Runtime flow for each frame after handshake:

1. `parse_and_validate_message(...)` checks max message bytes.
2. JSON root must be an object.
3. Route layer injects `user_id` from connection context before schema validation.
4. `IncomingMessage` discriminated union validates by `type`.
5. `MessageHandlerRegistry.handle(...)` routes to registered handler.

### Envelope Rules (`BaseMessage`)

- Required: `id`, `type`, `payload`, `user_id`
- Optional: `session_id`, `conversation_ref`, `turn_ref`, `timestamp`
- `id` constraints: non-empty, max length `128`, regex `[a-zA-Z0-9_-]+`

### Incoming `type` to Schema to Route Binding

| Incoming `type` | Schema model | Key payload fields | Route `handler_key` |
|---|---|---|---|
| `query` | `QueryMessage` | `text`, `conversation_ref`, optional `content`, `screenshot`, `screenshot_ref`, `system_state_internal` | `query_handler` |
| `stop-query` | `StopQueryMessage` | Empty payload object | `stop_query_handler` |
| `rehydrate-conversation` | `RehydrateConversationMessage` | `conversation_ref`, `messages[]`, `rehydrate_mode="replace"` | `rehydrate_conversation_handler` |
| `load-settings` | `LoadSettingsMessage` | Optional `client_version` | `load_settings_handler` |
| `list-models` | `ListModelsMessage` | Empty payload object | `list_models_handler` |
| `update-settings` | `UpdateSettingsMessage` | Optional frontend-owned config fields (`model_mode`, `model_provider`, `selected_model_id`, `interaction_mode`, `voice_mode_enabled`, `speech_mode_enabled`, `wakeword_stt_enabled`, `agent_full_sudo_enabled`, `include_query_screenshot`, `provider_api_keys`) | `update_settings_handler` |
| `wakeword-detected` | `WakewordDetectedMessage` | Empty payload object | `wakeword_handler` |
| `compact-history` | `CompactHistoryMessage` | Optional `force` (default `true`) | `compact_history_handler` |
| `tool-result` | `ToolResultMessage` | `request_id`, `success`, optional `data`, optional `error` | `tool_result_handler` |
| `tool-bundle-result` | `ToolBundleResultMessage` | `bundle_id`, `status`, `step_results[]`, optional `screenshot`, `screenshot_ref`, `system_state`, `error` | `tool_result_handler` |

## Control-Path Contract Index

| Runtime control path | Incoming trigger | Primary handler key | Primary outbound/control effects | Deep contract |
|---|---|---|---|---|
| Handshake identity bootstrap | websocket initial frame | route bootstrap (`validate_handshake`) | establishes validated `user_id` for all subsequent schema validations + context attachment | [Backend Protocol Identity and Context-Field Propagation Reference](state/backend_protocol_identity_and_context_field_propagation_reference.md) |
| Query loop + stream lifecycle | `query` | `query_handler` | `streaming-response`, `tool-call`, `tool-output`, `streaming-complete`, `error` | [Backend WebSocket Receive Loop and Task-Cancellation Contract Reference](lifecycle/backend_websocket_receive_loop_and_task_cancellation_contract_reference.md) |
| Active-query cancellation | `stop-query` | `stop_query_handler` | cancel active task, emit completion/error path, keep session context stable | [Backend WebSocket Receive Loop and Task-Cancellation Contract Reference](lifecycle/backend_websocket_receive_loop_and_task_cancellation_contract_reference.md) |
| Settings ACK control path | `update-settings` | `update_settings_handler` | emits `settings-updated` or `error` with request correlation id | [Backend Message Envelope and Contract Validation Boundary Reference](validation/backend_message_envelope_and_contract_validation_boundary_reference.md) |
| Wakeword activation path | `wakeword-detected` | `wakeword_handler` | emits wakeword activation/greeting flow (`wakeword-activated`, `wakeword-greeting`, optional `audio-chunk`) | [Backend Protocol Identity and Context-Field Propagation Reference](state/backend_protocol_identity_and_context_field_propagation_reference.md) |
| Tool turn result reintegration | `tool-result`, `tool-bundle-result` | `tool_result_handler` | resolves pending tool requests, injects tool output back into active loop, can advance stream lifecycle | [Backend WebSocket Protocol Test Coverage and Runtime Contract Reference](testing/backend_websocket_protocol_test_coverage_and_runtime_contract_reference.md) |

## Outgoing Message Contract Matrix

## Schema-Validated Outgoing Types

`OUTGOING_SCHEMA_MESSAGE_TYPES` in `message_types.py` is validated against `OUTGOING_SCHEMA_CONTRACTS` in `contracts/registry.py`.

| Outgoing `type` | Schema model | Payload highlights |
|---|---|---|
| `error` | `ErrorResponse` | `message`, optional `content` |
| `streaming-response` | `StreamingResponse` | `text` |
| `streaming-complete` | `StreamingComplete` | No payload requirements |
| `llm-thought` | `LlmThought` | `status` |
| `tool-call` | `ToolCallMessage` | `tool_name`, `parameters` |
| `tool-bundle` | `ToolBundleMessage` | `bundle_id`, `tools[]` |
| `tool-output` | `ToolOutputMessage` | `tool_name`, `success`, `output`, optional `execution_time`, `error`, `screenshot`, `metadata` |
| `audio-chunk` | `AudioChunkMessage` | `audio` (base64), `sample_rate` |
| `wakeword-activated` | `WakewordActivatedMessage` | Open object payload |
| `wakeword-greeting` | `WakewordGreetingMessage` | `text` |
| `system-prompt` | `SystemPromptMessage` | `content`, optional `tool_schemas[]` |
| `tool-schemas` | `ToolSchemasMessage` | `tool_schemas[]` |
| `token-count` | `TokenCountMessage` | token counters + usage source + cache metadata |
| `memory-store` | `MemoryStoreMessage` | normalized memory persistence payload |
| `user-message-full` | `UserMessageFullMessage` | `content`, metadata bundle |
| `assistant-message-full` | `AssistantMessageFullMessage` | `content` |
| `context-compaction-started` | `ContextCompactionStartedMessage` | `reason`, `strategy`, `before_tokens`, `projected_tokens` |
| `context-compaction-completed` | `ContextCompactionCompletedMessage` | `reason`, `strategy`, `before_tokens`, `after_tokens`, `removed_messages`, optional `summary_preview`, optional `skipped_reason` |
| `context-compaction-failed` | `ContextCompactionFailedMessage` | `reason`, `strategy`, `error`, optional `before_tokens` |

### ACK/Control Outgoing Types (Not in Schema-Validated Subset)

These constants are declared in `OutgoingMessageType` and emitted by settings handlers via `send_success_response(...)`, but are intentionally outside `OUTGOING_SCHEMA_MESSAGE_TYPES`:

- `settings-loaded`
- `settings-updated`
- `models-listed`

## Streaming Event to Outgoing Formatter Alignment

`ResponseFormatter` builds its dispatch table from `get_formatter_specs()`.

| Stream event type literal | Formatter class | Outgoing `type` |
|---|---|---|
| `thinking` | `ThinkingEventFormatter` | `llm-thought` |
| `chunk` | `ChunkEventFormatter` | `streaming-response` |
| `error` | `ErrorEventFormatter` | `error` |
| `streaming-complete` | `StreamingCompleteEventFormatter` | `streaming-complete` |
| `tool-call` | `ToolCallEventFormatter` | `tool-call` |
| `tool-output` | `ToolOutputEventFormatter` | `tool-output` |
| `system-prompt` | `SystemPromptEventFormatter` | `system-prompt` |
| `tool-schemas` | `ToolSchemasEventFormatter` | `tool-schemas` |
| `user-message-full` | `UserMessageFullEventFormatter` | `user-message-full` |
| `assistant-message-full` | `AssistantMessageFullEventFormatter` | `assistant-message-full` |
| `token-count` | `TokenCountEventFormatter` | `token-count` |
| `context-compaction-started` | `ContextCompactionStartedEventFormatter` | `context-compaction-started` |
| `context-compaction-completed` | `ContextCompactionCompletedEventFormatter` | `context-compaction-completed` |
| `context-compaction-failed` | `ContextCompactionFailedEventFormatter` | `context-compaction-failed` |
| `memory-store` | `MemoryStoreEventFormatter` | `memory-store` |
| `tool-bundle` | `ToolBundleEventFormatter` | `tool-bundle` |

## Transport Envelope Context Fields

All helper send paths (`send_success_response`, formatter pipeline with context) converge on canonical transport envelope fields:

- `type`
- `id`
- `payload`
- Optional context enrichment from runtime/session:
  - `session_id`
  - `user_id`
  - `conversation_ref`
  - `turn_ref`

`attach_context_fields(...)` only adds each context key when value is truthy.

## Drift Guards and Failure Modes

- `validate_incoming_routes()` fails startup if route table diverges from incoming schema union.
- `validate_registry_alignment()` fails startup/tests if contract registries diverge from constant lists.
- Incoming parser returns structured `error` messages for malformed JSON, invalid root type, oversized payload, or schema validation issues.
- Unexpected handler exceptions are sanitized through `sanitize_error_message(...)` before client delivery.

## Recompute Surface Commands

Use this to recompute protocol cardinalities:

- `python - <<'PY'`
- `from backend.src.api.contracts.message_types import INCOMING_MESSAGE_TYPES, OUTGOING_SCHEMA_MESSAGE_TYPES`
- `from backend.src.core.container.incoming_routing import INCOMING_ROUTES`
- `from backend.src.api.contracts.formatter_specs import get_formatter_specs`
- `print('incoming_types', len(INCOMING_MESSAGE_TYPES))`
- `print('outgoing_schema_types', len(OUTGOING_SCHEMA_MESSAGE_TYPES))`
- `print('incoming_routes', len(INCOMING_ROUTES))`
- `print('formatter_specs', len(get_formatter_specs()))`
- `PY`

## Related Deep Dive

- [Backend Full Functionality Inventory Reference](../backend_full_functionality_inventory_reference.md)
- [Backend Functionality Capability Catalog Reference](../backend_functionality_capability_catalog_reference.md)
- [Backend Capability to File Matrix Reference](../backend_capability_to_file_matrix_reference.md)
- [Backend Protocol Lifecycle Hub](lifecycle/README.md)
- [Backend Protocol State Hub](state/README.md)
- [Backend Protocol Errors Hub](errors/README.md)
- [Backend Protocol Validation Hub](validation/README.md)
- [Backend Protocol Testing Hub](testing/README.md)
