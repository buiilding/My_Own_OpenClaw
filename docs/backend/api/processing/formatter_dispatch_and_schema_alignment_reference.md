---
summary: "Deep reference for backend API formatter registration/dispatch, per-event payload shaping rules, context-envelope attachment, and schema-alignment drift guards."
read_when:
  - When adding/changing agent streaming events or formatter classes.
  - When debugging websocket payload fields that fail renderer type-guards or Pydantic schema validation.
title: "Formatter Dispatch and Schema Alignment Reference"
---

# Formatter Dispatch and Schema Alignment Reference

## Canonical Modules

- `backend/src/api/processing/formatter.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/processing/formatters/*`
- `backend/src/api/contracts/message_types.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/api/transport/envelope.py`

## Registration Source of Truth

`get_formatter_specs()` is the canonical event-to-formatter map:

- tuple shape: `(event_class, event_type_literal, formatter_class, outgoing_type_literal)`
- lazy formatter/event imports prevent cycle through `api.processing.__init__`
- `@lru_cache(maxsize=1)` stabilizes table construction cost

`ResponseFormatter._register_formatters()` builds two O(1) dispatch maps:

- `_typed_formatters`: `type(event) -> formatter`
- `_formatters`: `event["type"] -> formatter` (dict compatibility path)

Fail-fast guards:

- duplicate typed class registration raises `ValueError`
- duplicate event type literal registration raises `ValueError`

## Runtime Dispatch Order

`ResponseFormatter.format(event, msg_id, context)` order:

1. typed dispatch by exact `type(event)`
2. dict fallback only when input is `dict`
3. return `None` when no route exists
4. attach transport context fields only when formatter returned a message

Context fields attached by `attach_context_fields(...)`:

- `session_id`
- `user_id`
- `conversation_ref`
- `turn_ref`

No context field gets attached when value is falsy.

## Formatter Behavior Matrix

### `chunk` -> `streaming-response`

- formatter: `ChunkEventFormatter`
- required input: `content`
- output payload: `{ "text": content }`
- missing `content`: warning + `None` (event skipped)

### `thinking` -> `llm-thought`

- formatter: `ThinkingEventFormatter`
- required input: `content`
- output payload: `{ "status": content }`
- missing `content`: warning + `None`

### `error` -> `error`

- formatter: `ErrorEventFormatter`
- maps `content` to `payload.message`
- maps `details` to `payload.content`
- default message fallback: `"An unexpected error occurred"`

### `streaming-complete` -> `streaming-complete`

- formatter: `StreamingCompleteEventFormatter`
- payload is empty object
- terminal text is handled in query execution fallback logic, not in this formatter

### `tool-call` -> `tool-call`

- formatter: `ToolCallEventFormatter`
- required:
  - `tool_name` truthy
  - `parameters` present and `dict`
- optional passthrough:
  - `request_id`
  - `metadata`
- validation failure: warning + `None`

### `tool-output` -> `tool-output`

- formatter: `ToolOutputEventFormatter`
- required non-`None`:
  - `tool_name`
  - `success`
  - `output`
- optional passthrough:
  - `execution_time`
  - `error`
  - `screenshot`
  - `metadata`
- validation failure: warning + `None`

### `tool-bundle` -> `tool-bundle`

- formatter: `ToolBundleEventFormatter`
- typed path reads `event.bundle_id` + `event.tools`
- dict path defaults to `""` and `[]` when missing

### `tool-schemas` -> `tool-schemas`

- formatter: `ToolSchemasEventFormatter`
- requires `tool_schemas` list
- invalid type raises `ValueError` (explicit fail, not skip)

### `system-prompt` -> `system-prompt`

- formatter: `SystemPromptEventFormatter`
- passthrough payload:
  - `content`
  - `tool_schemas`

### `user-message-full` -> `user-message-full`

- formatter: `UserMessageFullEventFormatter`
- passthrough payload:
  - `content`
  - `metadata`

### `assistant-message-full` -> `assistant-message-full`

- formatter: `AssistantMessageFullEventFormatter`
- required input: `content`
- missing `content`: warning + `None`

### `token-count` -> `token-count`

- formatter: `TokenCountEventFormatter`
- passes all usage/cache fields through to payload
- schema requires numeric fields; producer correctness required upstream

### `memory-store` -> `memory-store`

- formatter: `MemoryStoreEventFormatter`
- rejects missing/invalid `user_id`
- explicitly rejects `user_id == "default_user"` per policy
- invalid user id: warning + `None`

## Contract Alignment Guards

Alignment happens in `api/contracts/registry.py`:

- `validate_registry_alignment()` checks:
  - incoming constants vs incoming contract table
  - outgoing schema constants vs outgoing schema contract table

Important boundary:

- `OUTGOING_SCHEMA_MESSAGE_TYPES` intentionally covers schema-validated stream/transport types
- non-stream operational messages (for example settings/model ACK types) are constants but outside this schema set

## Debug Checklist

If a streamed event never appears in frontend:

1. confirm `get_formatter_specs()` includes the event class and type literal
2. confirm formatter returns a message and not `None` from required-field guard
3. confirm no `ValueError` from strict formatters like `ToolSchemasEventFormatter`
4. confirm outgoing `type` exists in frontend runtime event guards

If context metadata is missing:

1. check `QueryExecutionService._build_stream_context(...)` values
2. check field values are non-empty (falsy values are not attached)
3. verify message passed through `ResponseFormatter` path rather than direct sender path
