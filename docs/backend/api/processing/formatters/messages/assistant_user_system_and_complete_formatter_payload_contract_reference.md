---
summary: "Deep reference for assistant/user/system/streaming-complete formatter behavior: required-field enforcement, payload mapping, and schema-alignment assumptions for message-style transparency events."
read_when:
  - When changing `AssistantMessageFullEventFormatter`, `UserMessageFullEventFormatter`, `SystemPromptEventFormatter`, or `StreamingCompleteEventFormatter`.
  - When debugging missing or malformed transparency payloads in renderer chat event consumers.
title: "Assistant/User/System/Complete Formatter Payload Contract Reference"
---

# Assistant/User/System/Complete Formatter Payload Contract Reference

## Canonical Modules

- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/processing/formatters/assistant_message.py`
- `backend/src/api/processing/formatters/user_message.py`
- `backend/src/api/processing/formatters/system_prompt.py`
- `backend/src/api/processing/formatters/complete.py`
- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_formatters.py`

## Registration and Message-Type Mapping

`get_formatter_specs()` binds event class + `StreamingEventType` to formatter class and outgoing type:

- `AssistantMessageFullEvent` -> `AssistantMessageFullEventFormatter` -> `assistant-message-full`
- `UserMessageFullEvent` -> `UserMessageFullEventFormatter` -> `user-message-full`
- `SystemPromptEvent` -> `SystemPromptEventFormatter` -> `system-prompt`
- `StreamingCompleteEvent` -> `StreamingCompleteEventFormatter` -> `streaming-complete`

This mapping is the canonical dispatch contract used by `ResponseFormatter`.

## Assistant Full Message Contract

`AssistantMessageFullEventFormatter` enforces required `content` through `_get_required_field(...)`.

Behavior:

- missing/`None` `content` -> warning log + formatter returns `None` (event skipped)
- valid `content` -> payload `{ "content": <text> }`

Schema expectation:

- aligns to `AssistantMessageFullPayload.content: str`.

## User Full Message Contract

`UserMessageFullEventFormatter` forwards fields without local required-field checks:

- `payload.content = event_dict.get("content")`
- `payload.metadata = event_dict.get("metadata")`

Schema expectation:

- outgoing schema requires both fields (`content: str`, `metadata` object with strict keys).

Practical contract:

- typed `UserMessageFullEvent` instances should satisfy required fields upstream.
- dict-event compatibility path can emit shape that only remains safe if upstream preserves typed-equivalent payload shape.

## System Prompt Contract

`SystemPromptEventFormatter` maps:

- `payload.content = event_dict.get("content")`
- `payload.tool_schemas = event_dict.get("tool_schemas")`

Tool-schema payload may be absent (`None`), matching schema optionality.

Schema expectation:

- `SystemPromptPayload.content` required
- `tool_schemas` optional list of canonical function-tool schema objects

## Streaming Complete Contract

`StreamingCompleteEventFormatter` always emits:

- `type: "streaming-complete"`
- `payload: {}`

It ignores event content (including `final_response`) by design; completion signal is status-only.

## Skip vs Pass-Through Matrix

- assistant formatter: strict required field, may skip
- user formatter: pass-through
- system formatter: pass-through
- complete formatter: static payload

Operational implication:

- assistant full-message path has explicit fail-closed behavior
- user/system rely more on upstream event constructors and schema-contract tests

## Test-Backed Matrix

`tests/backend/test_formatters.py` asserts:

- assistant formatter success + skip-on-`None`
- complete formatter static payload behavior for normal/empty input

No formatter-unit tests in this file currently target user/system full-message formatters directly.

## Drift Hotspots

1. Removing assistant required-field guard can surface invalid `assistant-message-full` payloads to frontend consumers.
2. Dict-event paths for user/system formatters can drift from strict `outgoing.py` payload shapes if upstream validation weakens.
3. Changing completion payload from `{}` to non-empty shape can break consumers that treat completion as a marker event.

## Related Pages

- [Backend API Formatter Message Docs Hub](README.md)
- [Error and Memory-Store Formatter Guard and Schema-Mapping Reference](error_and_memory_store_formatter_guard_and_schema_mapping_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](../formatter_validation_and_contract_test_matrix_reference.md)
