---
summary: "Deep reference for tool-bundle formatter behavior: typed-vs-dict extraction, canonical payload validation, and outbound tool-bundle payload stability."
read_when:
  - When changing `ToolBundleEventFormatter` validation behavior or typed-event extraction logic.
  - When debugging tool-bundle payload shape regressions in frontend bundle execution consumers.
title: "Tool Bundle Formatter Typed/Dict Parity and Payload Validation Contract Reference"
---

# Tool Bundle Formatter Typed/Dict Parity and Payload Validation Contract Reference

## Canonical Modules

- `backend/src/api/processing/formatters/tool_bundle.py`
- `backend/src/core/events/streaming_events.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/schemas/outgoing.py`
- `tests/backend/test_tool_bundle_formatter.py`

## Registration Mapping Contract

`formatter_specs` maps `ToolBundleEvent` / `tool_bundle` to `ToolBundleEventFormatter` with outgoing type `tool-bundle`.

## Typed vs Dict Extraction Contract

Formatter branches by input shape:

- dict input is read through the same event-dict helper used by typed events
- typed event input uses `StreamingEvent.to_dict()`

Both paths must provide the canonical payload shape:

- `bundle_id`: non-empty string
- `tools`: list
- every tool item: dict with non-empty `name` and dict `args`

Malformed payloads are skipped with the formatter missing-field warning instead
of being emitted to the websocket transport.

## Default and Preservation Semantics

Dict-event compatibility defaults were removed:

- missing `bundle_id` is invalid
- missing `tools` is invalid
- explicit `tools: None` is invalid
- non-list `tools` is invalid
- non-dict tool items are invalid

Contract implication:

- formatter output stays aligned with `ToolBundlePayload.tools` in
  `backend/src/api/schemas/outgoing.py`.

## Output Payload Contract

Returned payload always includes:

- `type: "tool-bundle"`
- `id: msg_id`
- `payload.bundle_id`
- `payload.tools`

`outgoing.py` expects `tools` list in canonical schema (`ToolBundlePayload.tools`).

## Test-Backed Matrix

`tests/backend/test_tool_bundle_formatter.py` verifies:

- typed event formatting path
- dict formatting path
- typed event with empty tools list
- formatter output validates against `ToolBundleMessage`
- missing fields are skipped
- explicit `tools=None` is skipped
- non-list `tools` is skipped
- invalid tool items are skipped

Coverage note:

- frontend chat-stream tests still fail closed on malformed transport payloads
  so renderer display stays stable if a non-backend producer sends bad data.

## Drift Hotspots

1. Reintroducing dict defaults can emit schema-invalid websocket payloads.
2. Coercing explicit `None` tools to `[]` hides malformed backend producers.
3. Removing frontend fail-closed display handling can make non-backend malformed
   transport payloads crash chat display.

## Related Pages

- [Backend API Formatter Action Docs Hub](README.md)
- [Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference](tool_call_and_tool_output_formatter_validation_and_metadata_passthrough_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../../../../tools/execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
