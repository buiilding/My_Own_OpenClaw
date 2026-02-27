---
summary: "Deep reference for error and memory-store formatter contracts: sanitized error payload mapping, memory-store user-id enforcement, and schema-safe payload shape expectations."
read_when:
  - When changing `ErrorEventFormatter` or `MemoryStoreEventFormatter` payload mapping/guard logic.
  - When debugging missing memory-store messages or mismatched error payload fields in frontend consumers.
title: "Error and Memory-Store Formatter Guard and Schema-Mapping Reference"
---

# Error and Memory-Store Formatter Guard and Schema-Mapping Reference

## Canonical Modules

- `backend/src/api/processing/formatters/error.py`
- `backend/src/api/processing/formatters/memory_store.py`
- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_outgoing_schema_contract.py`

## Error Formatter Payload Mapping Contract

`ErrorEventFormatter` maps event fields to schema names:

- `payload.message <- event.content` (fallback: `"An unexpected error occurred"`)
- `payload.content <- event.details` (optional detail channel)

Outgoing type is fixed to `error`.

Key compatibility behavior:

- formatter accepts typed or dict events via `_get_event_dict(...)`
- no skip path; always returns an error payload dict

Schema alignment:

- matches `ErrorPayload` (`message: str`, optional `content`).

## Memory-Store Formatter Guard Contract

`MemoryStoreEventFormatter` has a hard gate on `user_id`:

- skip (`None`) when `user_id` is missing
- skip (`None`) when `user_id == "default_user"`
- skip (`None`) when `user_query` or `assistant_response` is empty/whitespace
- logs warning including `msg_id` on skip

When guard passes, payload maps:

- `user_query`
- `assistant_response`
- `memory_type`
- `user_id`
- `session_id`

Outgoing type is fixed to `memory-store`.

Policy implication:

- prevents frontend-side memory storage events from being emitted with policy-invalid default identity.

## Schema Alignment Contract

`MemoryStorePayload` requires `user_id` and allows optional content/session fields.

Guard behavior in formatter is stricter than dataclass defaults (`MemoryStoreEvent.user_id` defaults to `"default_user"`) and enforces runtime policy at format time.

## Test-Backed Matrix

`tests/backend/test_formatters.py`:

- verifies error message/content mapping
- verifies fallback default error text when content missing

`tests/backend/test_outgoing_schema_contract.py`:

- verifies formatted memory-store payload model-validates against `MemoryStoreMessage`

Coverage note:

- contract tests include explicit rejection assertions for:
  - `user_id` missing
  - `user_id="default_user"`
  - blank `user_query`/`assistant_response`

## Drift Hotspots

1. Reverting error key mapping (`message` vs `content`) breaks `ErrorPayload` contract and frontend display paths.
2. Relaxing `default_user` skip logic can emit policy-invalid memory events and leak cross-session storage behavior.
3. Removing non-empty query/response guards can emit low-signal or malformed memory-store events to frontend persistence.
4. Removing warning logs on memory skip paths reduces debuggability for dropped memory-store messages.

## Related Pages

- [Backend API Formatter Message Docs Hub](README.md)
- [Assistant/User/System/Complete Formatter Payload Contract Reference](assistant_user_system_and_complete_formatter_payload_contract_reference.md)
- [Memory Route Validation and Fallback Reference](../../../memory_route_validation_and_fallback_reference.md)
