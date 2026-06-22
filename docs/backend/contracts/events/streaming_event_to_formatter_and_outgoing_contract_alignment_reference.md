---
summary: "Deep reference for how streaming event enum literals map to formatter specs, outgoing websocket message types, and registry/test drift guards."
read_when:
  - When adding/changing `StreamingEventType` values or event dataclasses.
  - When a streamed backend event is produced but missing or malformed on renderer side.
title: "Streaming Event to Formatter and Outgoing Contract Alignment Reference"
---

# Streaming Event to Formatter and Outgoing Contract Alignment Reference

## Canonical Modules

- `backend/src/core/types/enums.py`
- `backend/src/core/events/streaming_events.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/message_types.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/api/processing/formatter.py`
- `tests/backend/test_api_contract_registry.py`

## Contract Surfaces

Runtime stream alignment depends on four coordinated layers:

1. `StreamingEventType` literals emitted by dataclasses (`event.type.value`)
2. `get_formatter_specs()` map (`event class + event literal -> formatter class`)
3. `OutgoingMessageType` constants and `OUTGOING_SCHEMA_MESSAGE_TYPES` list
4. outgoing Pydantic schemas in `api/schemas/outgoing.py` (`type: Literal[...]`)

The intended contract is now one vocabulary for streamed backend events and websocket transport message types. Drift on any one surface can silently drop events (`ResponseFormatter.format(...)` returns `None`) or cause schema/runtime mismatch.

## Canonical Event Mapping Matrix

`get_formatter_specs()` currently defines:

- `ThinkingEvent` -> `llm-thought` -> `ThinkingEventFormatter` -> `LlmThought`
- `ChunkEvent` -> `streaming-response` -> `ChunkEventFormatter` -> `StreamingResponse`
- `ErrorEvent` -> `error` -> `ErrorEventFormatter` -> `ErrorResponse`
- `StreamingCompleteEvent` -> `streaming-complete` -> `StreamingCompleteEventFormatter` -> `StreamingComplete`
- `ToolCallEvent` -> `tool-call` -> `ToolCallEventFormatter` -> `ToolCallMessage`
- `ToolOutputEvent` -> `tool-output` -> `ToolOutputEventFormatter` -> `ToolOutputMessage`
- `WebSearchProgressEvent` -> `web-search-progress` -> `WebSearchProgressEventFormatter` -> `WebSearchProgressMessage`
- `SystemPromptEvent` -> `system-prompt` -> `SystemPromptEventFormatter` -> `SystemPromptMessage`
- `ToolSchemasEvent` -> `tool-schemas` -> `ToolSchemasEventFormatter` -> `ToolSchemasMessage`
- `UserMessageFullEvent` -> `user-message-full` -> `UserMessageFullEventFormatter` -> `UserMessageFullMessage`
- `AssistantMessageFullEvent` -> `assistant-message-full` -> `AssistantMessageFullEventFormatter` -> `AssistantMessageFullMessage`
- `TokenCountEvent` -> `token-count` -> `TokenCountEventFormatter` -> `TokenCountMessage`
- `ContextCompactionStartedEvent` -> `context-compaction-started` -> `ContextCompactionStartedEventFormatter` -> `ContextCompactionStartedMessage`
- `ContextCompactionCompletedEvent` -> `context-compaction-completed` -> `ContextCompactionCompletedEventFormatter` -> `ContextCompactionCompletedMessage`
- `ContextCompactionFailedEvent` -> `context-compaction-failed` -> `ContextCompactionFailedEventFormatter` -> `ContextCompactionFailedMessage`
- `ToolBundleEvent` -> `tool-bundle` -> `ToolBundleEventFormatter` -> `ToolBundleMessage`
- `ModelHistoryUpdatedEvent` -> `model-history-updated` -> `ModelHistoryUpdatedEventFormatter` -> `ModelHistoryUpdatedMessage`

## Event Name Handling

The canonical stream vocabulary is kebab-case and matches the websocket transport contract directly.

Extraction helpers trim whitespace and reject blank type strings, but they no
longer translate old plain-word or snake_case aliases. Producers should emit the
canonical enum values directly.

## Internal-Only Event Literals

`StreamingEventType` contains values not in formatter spec/outgoing schema map:

- `FULL_RESPONSE = "full_response"` (internal extraction/helper flows)
- `CONTENT = "content"` (LLM stream internals)

These are intentionally not websocket schema message types.

## Registry and Test Drift Guards

`tests/backend/test_api_contract_registry.py` protects alignment via:

- uniqueness checks for incoming/outgoing constant lists
- schema `Literal[...]` equality against contract tables
- formatter-spec uniqueness and dispatch-map equality checks
- subset check: formatter outgoing types must exist in outgoing schema contract set
- `validate_registry_alignment()` coverage for pass/fail paths

`validate_registry_alignment()` in `registry.py` fails fast when contract tables diverge from canonical message-type constant lists.

## Debug Checklist

When an emitted event does not reach renderer:

1. confirm dataclass sets expected canonical `StreamingEventType` literal in `__post_init__`
2. confirm event class and literal are both present in `get_formatter_specs()`
3. confirm mapped outgoing type exists in `OUTGOING_SCHEMA_MESSAGE_TYPES`
4. confirm outgoing schema model has matching `type: Literal[...]`
5. confirm formatter returns non-`None` (required field guards)
6. if the source is a dict event, confirm it uses the canonical event literal

## Related Pages

- [Backend Streaming Events Contracts Docs Hub](README.md)
- [Streaming Event Dataclass and Enum Semantics Reference](streaming_event_dataclass_and_enum_semantics_reference.md)
- [Message Schema and Formatter Reference](../message_schema_and_formatter_reference.md)
- [Formatter Dispatch and Schema Alignment Reference](../../api/processing/formatter_dispatch_and_schema_alignment_reference.md)
