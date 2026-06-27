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
- `compaction_facts` (optional bounded dict for history compaction)

Important behavior:

- artifacts are shallow-copied with `dict(tool_result.artifacts or {})` before inspection
- caller receives the copied dict, not original reference

## Transformation Sequence

`transform(tool_name, tool_result)` performs:

1. copy artifacts
2. extract screenshot payload via `_extract_screenshot_data(...)`
3. compute history text from canonical raw tool output, applying the
   model-facing tool-output token limit by default
4. derive bounded structured `compaction_facts`
5. return normalized `ProcessedToolResult`

Atomic bundle processing may call `transform(..., truncate_model_output=False)`
after it has already bounded each bundle step independently. That path preserves
one bundle history row without applying a second aggregate truncation pass to
the combined narrative.

No branch in this method mutates session/history state.

## `compaction_facts` Extraction Contract

Primary source order:

1. explicit `tool_result.compaction_facts`
2. synthesized bounded payload from `tool_result.metadata`, `tool_result.data`, and `artifacts`

Normalization rules:

- always adds `tool_name`
- always adds `success`
- adds `error` when present
- recursively bounds nested dict/list depth and item count
- skips bulky binary/image/html keys such as `screenshot`, `image_data`, `bytes`, `raw_html`
- truncates long string leaves before persistence

Design intent:

- preserve identifiers and machine-readable failure state for compaction
- avoid leaking screenshots/base64/huge raw payloads into history metadata
- keep transformer pure: no session lookup, no policy branching, no event emission

## Screenshot Extraction Precedence

`_extract_screenshot_data(...)` order:

1. `artifacts["screenshot"]` when present
2. `tool_result.data["screenshot"]` when data is dict and screenshot is a non-empty string
3. `None` otherwise

The transformer normalizes provider-visible screenshot images through the shared
image-payload helper before history commit. PNG, JPEG, WebP, and GIF payloads
are detected from bytes; detected bytes win over stale or missing
`screenshot_content_type`, so a JPEG screenshot cannot be committed as
`image/png`. Existing `data:image/...` URLs keep their base64 payload but have
their MIME repaired when the byte signature disagrees. Bare base64 with no
identifiable image signature is not guessed as PNG and is dropped from
model-visible image history.

Type guard:

- if `data["screenshot"]` exists but is not valid string payload, it is ignored and warning-logged

Implication:

- malformed or unidentified screenshot types do not block history text commit,
  but image attachment is dropped

## `ToolResult.format_for_history` Contract

Text precedence:

1. `output` (trusted pass-through)
2. `error` -> `Error: ...`
3. `data` fallback:
- dict uses `output`, then `message`, then nested `output`, else stringified dict
- non-dict stringified
4. final fallback: `Tool {tool_name} executed`

Design intent:

- backend does not validate or rewrite preformatted SDK/local-runtime
  `output`
- synthetic and payload-only tool results still produce deterministic history text

## `ToolResult.from_payload` Normalization Rules

For mapping-shaped tool-result payloads:

- `success` defaults to `True` unless `error` has a meaningful non-empty value
- standard keys are extracted directly
- non-standard keys become `data` when `data` missing
- screenshot-only data avoids leaking base64 into text and falls back to generic success string
- `output` mirrors generated/preserved `output` when missing

## Test-Backed Invariants

`tests/backend/test_tool_result_formatting.py` covers:

- `output` pass-through in `format_for_history`
- error/data/default fallback ordering
- `from_payload` success/error defaulting
- screenshot-only generic message behavior
- nested output/message/llm-content extraction
- dict and non-dict stringification behavior
- explicit flag/value preservation when provided

## Drift Hotspots

1. adding session/history/event access in transformer breaks strict pure-function boundary.
2. changing screenshot precedence can silently detach image payloads expected by history writes.
3. rewriting `format_for_history` precedence can alter LLM context text for every tool turn.
4. removing screenshot-only text guard in `from_payload` can leak base64 payload into prompt history.
5. widening `compaction_facts` bounds without test/doc updates can quietly explode compaction prompt size.

## Related Pages

- [Backend Tools Processing Docs Hub](README.md)
- [Tool Result Processor Bundle Formatting and Cleanup Reference](tool_result_processor_bundle_formatting_and_cleanup_reference.md)
- [Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference](synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md)
- [History Committer and Result-Processor Boundary Reference](../../agent/history/history_committer_and_result_processor_boundary_reference.md)
