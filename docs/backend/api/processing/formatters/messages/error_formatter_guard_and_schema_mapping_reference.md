---
summary: "Deep reference for error formatter contracts: sanitized error payload mapping and schema-safe payload shape expectations."
read_when:
  - When changing `ErrorEventFormatter` payload mapping or guard logic.
  - When debugging mismatched error payload fields in SDK/renderer consumers.
title: "Error Formatter Guard and Schema-Mapping Reference"
---

# Error Formatter Guard and Schema-Mapping Reference

## Canonical Modules

- `backend/src/api/processing/formatters/error.py`
- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_outgoing_schema_contract.py`

## Error Formatter Payload Mapping Contract

`ErrorEventFormatter` maps event fields to schema names:

- `payload.message <- sanitize_stream_error_message(event.content)`
- `payload.metadata <- event.metadata` when metadata is a dict

Outgoing type is fixed to `error`.

Key behavior:

- formatter reads typed event attributes directly
- no skip path; the formatter always returns an error payload dict
- unsafe or empty content is replaced by the shared user-facing fallback message

Schema alignment:

- matches `ErrorPayload` (`message: str`, optional `content`, optional `metadata`)

## Test-Backed Matrix

`tests/backend/test_formatters.py`:

- verifies error message/content mapping
- verifies fallback default error text when content is missing or unsafe

## Drift Hotspots

1. Reverting error key mapping (`message` vs `content`) breaks `ErrorPayload` contract and renderer display paths.
2. Bypassing `sanitize_stream_error_message(...)` can leak internal exception details over the websocket.

## Related Pages

- [Backend API Formatter Message Docs Hub](README.md)
- [Assistant/User/System/Complete Formatter Payload Contract Reference](assistant_user_system_and_complete_formatter_payload_contract_reference.md)
