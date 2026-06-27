---
summary: "Deep reference for shared EventFormatter utilities: typed event inputs, required-field guard helpers, removed dict-event conversion, and formatter-level skip-vs-raise behavior across event classes."
read_when:
  - When adding a new formatter class and choosing validation behavior.
  - When debugging warnings like missing required fields and dropped outbound messages.
  - When resolving stale `_get_event_dict`, dict formatter input, or `StreamingEvent.to_dict()` formatter conversion references; formatter classes consume typed event attributes directly.
title: "Base Formatter Guard Utilities and Skip Semantics Reference"
---

# Base Formatter Guard Utilities and Skip Semantics Reference

## Canonical Modules

- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/formatters/chunk.py`
- `backend/src/api/processing/formatters/thinking.py`
- `backend/src/api/processing/formatters/tool_call.py`
- `backend/src/api/processing/formatters/tool_output.py`
- `backend/src/api/processing/formatters/tool_schemas.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_response_formatter.py`

## EventFormatter Base Utilities

`EventFormatter` provides shared helpers:

- `_get_required_field(value, field_name, event_name, msg_id)`:
  - returns field value when non-`None`
  - logs warning and returns `None` when missing
- `_log_missing_fields(event_name, missing_fields, msg_id)`:
  - standardized warning format for multi-field validation failures

Design intent:

- formatter classes stay thin
- each formatter reads typed event attributes directly
- missing-data behavior is consistent and visible in logs

## Skip Semantics (`None` Return)

Most formatters are fail-soft:

- return `None` when required payload fields are missing/invalid
- `ResponseFormatter` treats `None` as "skip event" and emits nothing

Skip-based formatters include:

- `ChunkEventFormatter` (`content` required)
- `ThinkingEventFormatter` (`content` required)
- `AssistantMessageFullEventFormatter` (`content` required)
- `ToolCallEventFormatter` (`tool_name` + dict `parameters` required)
- `ToolOutputEventFormatter` (`tool_name` and `success` must be non-`None`)

## Raise Semantics (Hard Validation)

`ToolSchemasEventFormatter` is strict:

- requires `tool_schemas` to be a list
- raises `ValueError` on non-list input

Reason:

- tool schema payload is a core canonical contract and should fail loudly if malformed

## Typed Input Behavior

The top-level response formatter dispatches typed `AgentStreamingEvent`
subclasses from the agent runtime. Formatter classes no longer normalize dict
payloads through `_get_event_dict`, and they no longer call
`StreamingEvent.to_dict()` before field extraction.

Low-level formatter tests should construct typed events. Dict-shaped fixture
compatibility belongs at the event producer or test helper boundary, not inside
formatter classes.

`ResponseFormatter` dispatch order:

1. typed dispatch by exact event class

Unknown events return `None`.

## Required-Field Nuances

`ToolCallEventFormatter`:

- empty `{}` parameters object is valid
- `parameters=None` invalid
- non-dict parameters invalid
- empty tool name invalid

`ToolOutputEventFormatter`:

- checks `is None`, not truthy/falsy
- empty string output is valid
- `success=False` is valid

`ToolBundleEventFormatter`:

- skips payloads without a non-empty `bundle_id`
- skips payloads whose `tools` value is not a list
- skips payloads whose tool items are not dicts with non-empty `name` and dict
  `args`

## Logging and Debug Signals

Typical warnings:

- `"missing required field"` from `_get_required_field`
- `"missing required fields"` from `_log_missing_fields`

These warnings are primary signal for silently skipped formatter output.

## Debug Checklist

If an expected websocket event disappears:

1. confirm formatter route exists in `formatter_specs`
2. inspect logs for required-field warnings
3. confirm formatter returns payload instead of `None`
4. confirm the event is a typed `AgentStreamingEvent` subclass with the
   attributes that formatter reads

If strict formatter errors bubble up:

1. inspect `tool_schemas` payload type at event source
2. verify canonical tool schema list contract before formatting
3. consider whether strict validation should remain hard-fail for that path
