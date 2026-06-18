---
summary: "Deep reference for chunk/thinking formatter signal contracts: required `content` extraction, skip-on-missing behavior, and payload key mapping to streaming-response and llm-thought events."
read_when:
  - When changing `ChunkEventFormatter` or `ThinkingEventFormatter` payload behavior.
  - When debugging dropped streaming chunks/thought text in renderer stream consumers.
title: "Chunk and Thinking Formatter Required-Content and Skip Contract Reference"
---

# Chunk and Thinking Formatter Required-Content and Skip Contract Reference

## Canonical Modules

- `backend/src/api/processing/formatters/chunk.py`
- `backend/src/api/processing/formatters/thinking.py`
- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_formatters.py`

## Registration Mapping Contract

`formatter_specs` maps:

- `ChunkEvent` / `streaming-response` -> `ChunkEventFormatter` -> outgoing `streaming-response`
- `ThinkingEvent` / `llm-thought` -> `ThinkingEventFormatter` -> outgoing `llm-thought`

Both are treated as stream-signal events consumed incrementally by renderer stream handlers.

## Required-Content Guard Contract

Both formatters use `EventFormatter._get_required_field(...)` for `content`.

Behavior:

- missing or `None` `content` -> warning log with `msg_id` and formatter returns `None`
- present `content` -> formatter emits mapped payload

This is fail-closed at formatting layer for incomplete stream signal events.

## Payload Mapping Contract

`ChunkEventFormatter` output shape:

- `type: "streaming-response"`
- `payload.text = content`

`ThinkingEventFormatter` output shape:

- `type: "llm-thought"`
- `payload.status = content`

Field-name divergence (`text` vs `status`) is intentional and aligned to outgoing schema expectations.

## Typed Event Support

Both formatters receive typed event objects and read `event.content` directly.
They no longer normalize dict payloads through `_get_event_dict(...)` or
`StreamingEvent.to_dict()` before validation.

This keeps required-field guard behavior aligned with the typed streaming-event runtime.

## Test-Backed Matrix

`tests/backend/test_formatters.py` verifies:

- successful typed-event formatting for chunk/thinking events
- skip behavior when `content` is `None`
- chunk formatter typed-event path via `ChunkEvent`

Coverage note:

- chunk and thinking use the same typed attribute extraction pattern; coverage
  should stay focused on that path rather than reintroducing dict fixtures.

## Drift Hotspots

1. Renaming payload keys (`text`/`status`) without synchronized SDK/renderer contract updates breaks stream rendering.
2. Removing required-field guard can emit invalid empty chunks/thought events and cause noisy UI updates.
3. Converting skip semantics from `None` to raised exceptions changes stream-pipeline failure behavior.

## Related Pages

- [Backend API Formatter Signal Docs Hub](README.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)
- [Base Formatter Guard Utilities and Skip Semantics Reference](../base_formatter_guard_utilities_and_skip_semantics_reference.md)
