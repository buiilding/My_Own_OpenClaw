---
summary: "Deep backend compatibility reference for stable schema import re-exports, typed-vs-dict streaming event support, payload field fallbacks, and incoming union extraction tolerance."
read_when:
  - When refactoring backend API schema modules or import paths used across websocket handlers/tests.
  - When changing query streaming event extraction, formatter dispatch, or incoming message-type extraction behavior.
title: "Backend Protocol Backward Compatibility and Normalization Reference"
---

# Backend Protocol Backward Compatibility and Normalization Reference

## Coverage Snapshot (2026-02-27)

- Compatibility-focused test files: `4`
- Total test functions across listed files: `55`

## Scope and Sources

Primary runtime sources:

- `backend/src/api/schema.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/core/container/incoming_routing.py`

Primary test sources:

- `tests/backend/test_response_formatter.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_incoming_routing.py`
- `tests/backend/test_query_event_extraction.py`

## Compatibility Contract Matrix

| Compatibility Surface | Runtime Owner | Guarantee | Key Tests |
|---|---|---|---|
| stable schema import path | `api/schema.py` | old imports from `backend.src.api.schema` continue to work via re-export shim | import-dependent suites (broad coverage) |
| typed + dict event formatter path | `ResponseFormatter.format(...)` | accepts both typed events and legacy dict events | `test_response_formatter_formats_dict_event_via_backward_compat_path` |
| dict payload fallback extraction | `QueryExecutionService` extraction helpers | supports top-level and payload-embedded fields (`content`, `final_response`) | `test_query_execution_extract_*` cases in `test_api_handlers.py` |
| direct helper-module extraction parity | `query_event_extraction.py` | module-level extraction helpers keep dict/typed/enum event compatibility and completion precedence stable | `tests/backend/test_query_event_extraction.py` |
| incoming union shape tolerance | `get_incoming_message_types()` | works with `Annotated[Union[...]]` and plain `Union[...]` | `test_get_incoming_message_types_supports_non_annotated_union` |

## Stable Schema Re-Export Contract

`backend/src/api/schema.py` is an explicit compatibility layer:

- re-exports names from `backend.src.api.schemas`
- preserves old import sites while code migrates to modular schema paths
- keeps `__all__` aligned with canonical schema package export list

Impact:

- handlers/tests importing `backend.src.api.schema` remain source-compatible
- schema package internal reorganization does not force immediate cross-repo import rewrites

## Formatter Compatibility: Typed and Legacy Dict Events

`ResponseFormatter` dispatch order:

1. typed event class lookup (`_typed_formatters`)
2. dict event fallback lookup by `event["type"]` (`_formatters`)

Compatibility value:

- newer strongly-typed event objects and legacy dict producers can coexist
- callers do not need simultaneous migration

Locked by `tests/backend/test_response_formatter.py`:

- typed formatting + context attach
- dict fallback formatting for legacy shape
- unknown type safely returns `None`
- duplicate registration guardrails prevent ambiguous fallback routing

## Query Stream Payload Normalization/Fallback Rules

`QueryExecutionService` extraction helpers preserve multiple historical event shapes.

### Event type normalization

- `_extract_event_type(...)` accepts:
  - dict `{"type": "..."}`
  - object `event.type` string
  - enum-like `event.type.value`
  - trims string values and treats whitespace-only type strings as invalid (`None`)

### Chunk text normalization

- `_extract_chunk_text(...)` for dict events:
  - prefers top-level `content` when non-empty after trim
  - falls back to `payload.text`

### Assistant full-text fallback

- `_extract_assistant_full_text(...)` accepts:
  - top-level `content`
  - `payload.content`

### Streaming-complete text fallback

- `_extract_streaming_complete_text(...)` accepts:
  - top-level `final_response`
  - `payload.final_response`

### Completion resolution hierarchy

`_resolve_completion_text(...)` order:

1. explicit streaming-complete text
2. accumulated streamed chunks
3. assistant full-text payload
4. fixed empty-final-response fallback message

If accumulated chunks join to whitespace-only content, resolver falls through to assistant-full text instead of returning blank output.

Locked by tests in `tests/backend/test_api_handlers.py`:

- `test_query_execution_extract_non_empty_chunk_text_respects_precomputed_event_type`
- `test_query_execution_extract_assistant_full_text_uses_payload_fallback`
- `test_query_execution_extract_streaming_complete_text_uses_payload_or_top_level`

Additional direct helper coverage in `tests/backend/test_query_event_extraction.py`:

- typed string `.type` handling (`assistant_message_full`) and missing `.type.value` fallback to `None`
- whitespace-only event type normalization to `None` for dict and typed-event paths
- top-level whitespace fallback to payload (`extract_dict_string_field`)
- `streaming-response` + payload `text` compatibility in chunk extraction
- typed-event `final_response` extraction for `streaming-complete`
- completion resolution precedence without `QueryExecutionService` wrapper indirection
- assistant-full fallback when `saw_text_chunk=True` but chunk aggregate is whitespace-only

## Incoming Route Type Extraction Tolerance

`get_incoming_message_types()` tolerates both union wrappers:

- `Annotated[Union[...], ...]`
- `Union[...]`

but enforces one invariant:

- every message model `type` field must be `Literal[...]`

This lets schema annotation style evolve without breaking route-table validation.

Locked by `tests/backend/test_incoming_routing.py`.

## Drift Checks

When changing compatibility code, keep aligned:

- `api/schema.py` re-export behavior and `__all__` passthrough
- formatter dict fallback path for legacy stream emitters
- query extraction helper fallback order (`top-level` vs `payload`)
- incoming route extraction support for non-annotated unions

## Compatibility Control-Path Index

| Compatibility control path | Runtime owner | Compatibility guarantee |
|---|---|---|
| schema import shim re-export path | `backend/src/api/schema.py` | legacy import sites stay stable while canonical schemas live under `backend/src/api/schemas/*` |
| typed-event to dict-event formatter fallback | `backend/src/api/processing/formatter.py` | mixed event producers remain supported through dual dispatch path |
| dict payload extraction fallback hierarchy | `backend/src/api/services/query_execution.py` | top-level and nested payload fields (`content`, `final_response`) remain backward-compatible |
| incoming union wrapper tolerance | `backend/src/core/container/incoming_routing.py` | route type extraction works for `Annotated[Union]` and plain `Union` declarations |

## Related Pages

- [Backend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Backend Protocol State Hub](../state/README.md)
- [Backend Protocol Errors Hub](../errors/README.md)
- [Backend Protocol Validation Hub](../validation/README.md)
- [Backend Protocol Testing Hub](../testing/README.md)
