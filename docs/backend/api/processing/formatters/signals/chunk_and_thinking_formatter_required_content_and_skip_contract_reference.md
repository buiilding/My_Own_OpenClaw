---
summary: "Deep reference for chunk/thinking formatter signal contracts: required `content` extraction, skip-on-missing behavior, and payload key mapping to streaming-response and llm-thought events."
read_when:
  - When changing `ChunkEventFormatter` or `ThinkingEventFormatter` payload behavior.
  - When debugging dropped streaming chunks/thought text in frontend stream consumers.
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

- `ChunkEvent` / `chunk` -> `ChunkEventFormatter` -> outgoing `streaming-response`
- `ThinkingEvent` / `thinking` -> `ThinkingEventFormatter` -> outgoing `llm-thought`

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

## Typed vs Dict Event Support

Both formatters call `_get_event_dict(event)` first.

Supported input forms:

- typed dataclass events (`StreamingEvent` subclasses via `to_dict()`)
- legacy dict events

This preserves compatibility while retaining required-field guard behavior in both paths.

## Test-Backed Matrix

`tests/backend/test_formatters.py` verifies:

- successful dict formatting for chunk/thinking events
- skip behavior when `content` is `None`
- chunk formatter typed-event path via `ChunkEvent`

Coverage note:

- explicit typed-event test exists for chunk; thinking typed-event behavior remains indirectly implied via shared base-path semantics.

## Drift Hotspots

1. Renaming payload keys (`text`/`status`) without synchronized frontend contract updates breaks stream rendering.
2. Removing required-field guard can emit invalid empty chunks/thought events and cause noisy UI updates.
3. Converting skip semantics from `None` to raised exceptions changes stream-pipeline failure behavior.

## Related Pages

- [Backend API Formatter Signal Docs Hub](README.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)
- [Base Formatter Guard Utilities and Skip Semantics Reference](../base_formatter_guard_utilities_and_skip_semantics_reference.md)
