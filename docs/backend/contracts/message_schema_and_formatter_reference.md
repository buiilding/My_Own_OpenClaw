---
summary: "Detailed websocket schema reference: base envelope validation, incoming/outgoing message payload fields, and event-to-formatter mapping used by stream transport."
read_when:
  - When adding/changing incoming or outgoing websocket schema fields.
  - When debugging formatter mismatches between runtime events and websocket payload types.
title: "Message Schema and Formatter Reference"
---

# Message Schema and Formatter Reference

## Canonical Sources

- Envelope and handshake: `backend/src/api/schemas/common.py`
- Incoming schemas: `backend/src/api/schemas/incoming.py`
- Outgoing schemas: `backend/src/api/schemas/outgoing.py`
- Type constants: `backend/src/api/contracts/message_types.py`
- Contract registry alignment: `backend/src/api/contracts/registry.py`
- Event formatter map: `backend/src/api/contracts/formatter_specs.py`

## Base Envelope Rules (`BaseMessage`)

Every post-handshake websocket message must satisfy:

- `id`: non-empty, trimmed, max 128 chars, regex `^[a-zA-Z0-9_-]+$`
- `type`: string literal constrained by schema union
- `payload`: object (defaults to `{}`)
- `user_id`: validated by shared `validate_user_id` (cannot be empty/whitespace/`default_user`)
- optional transport context fields: `session_id`, `conversation_ref`, `turn_ref`, `timestamp`

Handshake (`HandshakeMessage`):

- `type`: literal `handshake`
- `user_id`: same validation rules as above

## Incoming Message Schemas

Discriminated union key: `type`

### `query`

Payload (`QueryPayload`):

- `text: str`
- `conversation_ref: str`
- `content: Optional[str]`
- `screenshot: Optional[str]`
- `screenshot_ref: Optional[str]`
- `system_state_internal: Optional[Dict[str, Any]]`

Model config: `extra="forbid"`.

### `stop-query`

Payload: empty object model (`StopQueryPayload`), `extra="forbid"`.

### `rehydrate-conversation`

Payload:

- `conversation_ref: str`
- `messages: List[RehydrateConversationEntry]`
- `rehydrate_mode: Literal["replace"]`

Entry fields:

- required: `role` (`user|assistant|tool`), `content`
- optional: `message_type`, `tool_name`, `correlation_id`, `tool_call_id`, `tool_calls`, `timestamp`, `screenshot_ref`, `screenshot`

### `load-settings`

Payload:

- optional `client_version` (1..128 chars)

### `list-models`

Payload: empty object model.

### `update-settings`

Payload keys (schema-level optional):

- `model_mode`, `model_provider`, `selected_model_id`, `interaction_mode`
- `voice_mode_enabled`, `speech_mode_enabled`, `include_query_screenshot`

Schema forbids extras; handler-level validation further restricts to frontend-owned patch policy.

### `wakeword-detected`

Payload: empty object model.

### `tool-result`

Payload:

- `request_id: str`
- `success: bool`
- `data: Optional[ToolResultData]`
- `error: Optional[str]`

`ToolResultData` shared keys:

- `llm_content: str` (required)
- optional `system_state` (`active_window`, `mouse_position`)
- optional `screenshot`, `screenshot_ref`
- tool-specific keys allowed (`extra="allow"`)

### `tool-bundle-result`

Payload:

- `bundle_id: str`
- `status: Literal["success", "partial_failure", "failure"]`
- optional `screenshot`, `screenshot_ref`, `system_state`
- `step_results: List[ToolBundleStepResult]` (`tool`, `status`, optional `output`, extras allowed)
- optional `error`

## Incoming Type -> Handler Route Table

Canonical `INCOMING_ROUTES` (`core/container/incoming_routing.py`):

- `query` -> `query_handler`
- `stop-query` -> `stop_query_handler`
- `rehydrate-conversation` -> `rehydrate_conversation_handler`
- `tool-result` -> `tool_result_handler`
- `tool-bundle-result` -> `tool_result_handler`
- `wakeword-detected` -> `wakeword_handler`
- `list-models` -> `list_models_handler`
- `load-settings` -> `load_settings_handler`
- `update-settings` -> `update_settings_handler`

`validate_incoming_routes()` checks route table equality against schema literals and fails fast on drift.

## Outgoing Message Schemas

Key types emitted to renderer:

- `error` -> `ErrorPayload { message, content? }`
- `streaming-response` -> `{ text }`
- `streaming-complete` -> envelope-only
- `llm-thought` -> `{ status }`
- `tool-call` -> `{ tool_name, parameters, ...extra }`
- `tool-bundle` -> `{ bundle_id, tools[] }`
- `tool-output` -> `{ tool_name, success, output, execution_time?, error?, screenshot?, metadata? }`
- `audio-chunk` -> `{ audio, sample_rate }`
- `wakeword-activated` -> payload dict
- `wakeword-greeting` -> `{ text }`
- `system-prompt` -> `{ content, tool_schemas? }`
- `tool-schemas` -> `{ tool_schemas[] }`
- `token-count` -> token accounting payload
- `memory-store` -> memory persistence telemetry payload
- `user-message-full` -> `{ content, metadata{ original_query, context_type, injected_context, active_window } }`
- `assistant-message-full` -> `{ content }`

## Runtime Event -> Outgoing Formatter Map

`get_formatter_specs()` maps core stream events to formatter classes and outgoing type names:

- `ThinkingEvent` -> `ThinkingEventFormatter` -> `llm-thought`
- `ChunkEvent` -> `ChunkEventFormatter` -> `streaming-response`
- `ErrorEvent` -> `ErrorEventFormatter` -> `error`
- `StreamingCompleteEvent` -> `StreamingCompleteEventFormatter` -> `streaming-complete`
- `ToolCallEvent` -> `ToolCallEventFormatter` -> `tool-call`
- `ToolOutputEvent` -> `ToolOutputEventFormatter` -> `tool-output`
- `SystemPromptEvent` -> `SystemPromptEventFormatter` -> `system-prompt`
- `ToolSchemasEvent` -> `ToolSchemasEventFormatter` -> `tool-schemas`
- `UserMessageFullEvent` -> `UserMessageFullEventFormatter` -> `user-message-full`
- `AssistantMessageFullEvent` -> `AssistantMessageFullEventFormatter` -> `assistant-message-full`
- `TokenCountEvent` -> `TokenCountEventFormatter` -> `token-count`
- `MemoryStoreEvent` -> `MemoryStoreEventFormatter` -> `memory-store`
- `ToolBundleEvent` -> `ToolBundleEventFormatter` -> `tool-bundle`

## Drift Guards

- `backend/src/api/contracts/registry.py:validate_registry_alignment()` checks constant lists vs schema-contract tables.
- route-table validation checks incoming message literals vs DI route bindings.
- schema models use `extra="forbid"` in most payloads, with explicit `extra="allow"` only where tool-specific extensibility is intended.

## Related Formatter Deep Dives

- `docs/backend/contracts/message_types/README.md`
- `docs/backend/contracts/message_types/message_type_constants_schema_subset_and_handler_ack_reference.md`
- `docs/backend/contracts/events/README.md`
- `docs/backend/contracts/events/streaming_event_to_formatter_and_outgoing_contract_alignment_reference.md`
- `docs/backend/api/processing/formatters/README.md`
- `docs/backend/api/processing/formatters/base_formatter_guard_utilities_and_skip_semantics_reference.md`
- `docs/backend/api/processing/formatters/formatter_validation_and_contract_test_matrix_reference.md`
