---
summary: "Deep reference for pure result transformation contracts: screenshot extraction precedence, history-text formatting rules, and ToolResult dict-normalization fallback semantics."
read_when:
  - When changing `ResultTransformer.transform`, screenshot extraction behavior, or `ToolResult.format_for_history` fallback rules.
  - When debugging missing screenshot image data in history rows, incorrect tool-output text shape, or legacy dict result normalization regressions.
title: "Result Transformer and Tool Result Formatting Contract Reference"
---

# Result Transformer and Tool Result Formatting Contract Reference

## Canonical Modules

- `backend/src/agent/tools/processing/transformer.py`
- `backend/src/core/interfaces/tool.py`
- `tests/backend/test_tool_result_formatting.py`

## Ownership Boundary: Pure Transformation Only

`ResultTransformer` is explicitly side-effect free.

Must not do:

- session access
- history mutation
- I/O operations
- event emission
- global state mutation

`transform(...)` returns a `ProcessedToolResult` consumed later by `HistoryCommitter`.

## `ProcessedToolResult` Payload Contract

Produced fields:

- `tool_name`
- `formatted_message`
- `screenshot_data` (optional base64 string)
- `success`
- `error`
- `artifacts` (copied dict)

Important behavior:

- artifacts are shallow-copied with `dict(tool_result.artifacts or {})` before inspection
- caller receives the copied dict, not original reference

## Transformation Sequence

`transform(tool_name, tool_result)` performs:

1. copy artifacts
2. extract screenshot payload via `_extract_screenshot_data(...)`
3. compute history text via `tool_result.format_for_history(tool_name=...)`
4. return normalized `ProcessedToolResult`

No branch in this method mutates session/history state.

## Screenshot Extraction Precedence

`_extract_screenshot_data(...)` order:

1. `artifacts["screenshot"]` when present
2. `tool_result.data["screenshot"]` when data is dict and screenshot is a non-empty string
3. `None` otherwise

Type guard:

- if `data["screenshot"]` exists but is not valid string payload, it is ignored and warning-logged

Implication:

- malformed screenshot types do not block history text commit, but image attachment is dropped

## `ToolResult.format_for_history` Contract

Text precedence:

1. `llm_content` (trusted pass-through)
2. `error` -> `Error: ...`
3. `data` fallback:
- dict uses `output`, then `message`, then nested `llm_content`, else stringified dict
- non-dict stringified
4. final fallback: `Tool {tool_name} executed`

Design intent:

- backend does not validate or rewrite preformatted frontend `llm_content`
- synthetic and legacy payloads still produce deterministic history text

## `ToolResult.from_dict` Normalization Rules

For dict-based legacy results:

- `success` defaults to `True` unless `error` exists
- standard keys are extracted directly
- non-standard keys become `data` when `data` missing
- screenshot-only data avoids leaking base64 into text and falls back to generic success string
- `return_display` mirrors generated/preserved `llm_content` when missing

## Test-Backed Invariants

`tests/backend/test_tool_result_formatting.py` covers:

- `llm_content` pass-through in `format_for_history`
- error/data/default fallback ordering
- `from_dict` success/error defaulting
- screenshot-only generic message behavior
- nested output/message/llm-content extraction
- dict and non-dict stringification behavior
- explicit flag/value preservation when provided

## Drift Hotspots

1. adding session/history/event access in transformer breaks strict pure-function boundary.
2. changing screenshot precedence can silently detach image payloads expected by history writes.
3. rewriting `format_for_history` precedence can alter LLM context text for every tool turn.
4. removing screenshot-only text guard in `from_dict` can leak base64 payload into prompt history.

## Related Pages

- [Backend Tools Processing Docs Hub](README.md)
- [Tool Result Processor Bundle Formatting and Cleanup Reference](tool_result_processor_bundle_formatting_and_cleanup_reference.md)
- [Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference](synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md)
- [History Committer and Result-Processor Boundary Reference](../../agent/history/history_committer_and_result_processor_boundary_reference.md)
