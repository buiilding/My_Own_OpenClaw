---
summary: "Deep reference for tool-bundle formatter behavior: typed-vs-dict extraction, missing-field defaults, explicit-None preservation, and outbound tool-bundle payload stability."
read_when:
  - When changing `ToolBundleEventFormatter` dict default behavior or typed-event extraction logic.
  - When debugging tool-bundle payload shape regressions in frontend bundle execution consumers.
title: "Tool Bundle Formatter Typed/Dict Parity and Default-Payload Contract Reference"
---

# Tool Bundle Formatter Typed/Dict Parity and Default-Payload Contract Reference

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

- dict input:
  - `bundle_id = event.get("bundle_id", "")`
  - `tools = event.get("tools", [])`
- typed event input:
  - `bundle_id = event.bundle_id`
  - `tools = event.tools`

No validation is applied for tool item structure at formatter layer.

## Default and Preservation Semantics

Dict-event defaults:

- missing `bundle_id` -> empty string
- missing `tools` -> empty list

Explicit value preservation:

- if dict payload sets `tools: None`, formatter preserves `None` (no coercion to `[]`)

Contract implication:

- formatter is shape-stable but intentionally permissive for dict compatibility paths.

## Output Payload Contract

Returned payload always includes:

- `type: "tool-bundle"`
- `id: msg_id`
- `payload.bundle_id`
- `payload.tools`

`outgoing.py` expects `tools` list in canonical schema (`ToolBundlePayload.tools`).

Operational note:

- permissive dict path can emit values that rely on upstream validation/construction discipline.

## Test-Backed Matrix

`tests/backend/test_tool_bundle_formatter.py` verifies:

- typed event formatting path
- dict formatting path
- dict defaults for missing fields
- typed event with empty tools list
- explicit `tools=None` preserved for dict payloads

Coverage note:

- no schema-validate test currently asserts formatter output when dict `tools=None`; compatibility behavior is intentionally test-locked in formatter test suite.

## Drift Hotspots

1. Coercing explicit `None` tools to `[]` changes compatibility behavior and can break tests expecting preservation.
2. Removing dict defaults can surface missing-key errors in legacy paths.
3. Adding strict tool item validation here can shift failures from downstream validators into formatter stage.

## Related Pages

- [Backend API Formatter Action Docs Hub](README.md)
- [Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference](tool_call_and_tool_output_formatter_validation_and_metadata_passthrough_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../../../../../tools/execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
