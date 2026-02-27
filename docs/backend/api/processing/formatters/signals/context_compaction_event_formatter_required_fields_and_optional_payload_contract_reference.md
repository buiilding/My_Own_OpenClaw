---
summary: "Deep reference for context-compaction formatter contracts: required lifecycle fields, optional payload keys, skip semantics, and outgoing schema parity for started/completed/failed events."
read_when:
  - When changing `ContextCompactionStarted/Completed/FailedEventFormatter` payload behavior.
  - When debugging missing `context-compaction-*` websocket events or schema drift between formatter output and outgoing models.
title: "Context Compaction Event Formatter Required-Fields and Optional-Payload Contract Reference"
---

# Context Compaction Event Formatter Required-Fields and Optional-Payload Contract Reference

## Canonical Modules

- `backend/src/api/processing/formatters/context_compaction_started.py`
- `backend/src/api/processing/formatters/context_compaction_completed.py`
- `backend/src/api/processing/formatters/context_compaction_failed.py`
- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/core/events/streaming_events.py`
- `backend/src/api/schemas/outgoing.py`
- `tests/backend/test_outgoing_schema_contract.py`

## Registration Mapping Contract

`formatter_specs` maps compaction lifecycle events to dedicated formatter classes:

- `ContextCompactionStartedEvent` / `context-compaction-started` -> `ContextCompactionStartedEventFormatter`
- `ContextCompactionCompletedEvent` / `context-compaction-completed` -> `ContextCompactionCompletedEventFormatter`
- `ContextCompactionFailedEvent` / `context-compaction-failed` -> `ContextCompactionFailedEventFormatter`

Outgoing message types are one-to-one with the same lifecycle names in `OutgoingMessageType`.

## Required-Field Guard Contract

All three formatters rely on `EventFormatter._get_required_field(...)` for required keys and return `None` (skip) when any required field is missing.

### `context-compaction-started`

Required payload keys:

- `reason`
- `strategy`
- `before_tokens`
- `projected_tokens`

Output payload keys:

- `reason`
- `strategy`
- `before_tokens`
- `projected_tokens`

### `context-compaction-completed`

Required payload keys:

- `reason`
- `strategy`
- `before_tokens`
- `after_tokens`
- `removed_messages`

Optional passthrough keys:

- `summary_preview`
- `skipped_reason`

Output payload keys:

- `reason`
- `strategy`
- `before_tokens`
- `after_tokens`
- `removed_messages`
- `summary_preview` (nullable)
- `skipped_reason` (nullable)

### `context-compaction-failed`

Required payload keys:

- `reason`
- `strategy`
- `error`

Optional passthrough keys:

- `before_tokens`

Output payload keys:

- `reason`
- `strategy`
- `error`
- `before_tokens` (nullable)

## Typed and Dict Event Input Parity

Formatters support both event input forms:

- dataclass events (`StreamingEvent.to_dict()` path)
- legacy dict payloads

Required-field lookup behavior is identical for both forms because each formatter starts with `_get_event_dict(event)`.

## Outgoing Schema Alignment

`tests/backend/test_outgoing_schema_contract.py` model-validates formatter output against:

- `ContextCompactionStartedMessage`
- `ContextCompactionCompletedMessage`
- `ContextCompactionFailedMessage`

Contract implication:

- required fields above must remain present and type-compatible with `outgoing.py` payload models
- optional keys can be absent or `None` without invalidating schema

## Drift Hotspots

1. Renaming `before_tokens`/`after_tokens` keys without schema + frontend updates breaks typed event guards.
2. Converting optional fields (`summary_preview`, `skipped_reason`, `before_tokens`) into required fields changes compaction UI behavior for skip/failure branches.
3. Removing skip-on-missing semantics and raising exceptions can abort stream pipelines instead of dropping malformed compaction events.

## Related Pages

- [Backend API Formatter Signal Docs Hub](README.md)
- [Chunk and Thinking Formatter Required-Content and Skip Contract Reference](chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)
- [Formatter Dispatch and Schema Alignment Reference](../../formatter_dispatch_and_schema_alignment_reference.md)
