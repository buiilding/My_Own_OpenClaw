---
summary: "Backend API processing formatters docs sub-hub for base formatter guard utilities, per-formatter validation semantics, and test-backed schema/registry alignment contracts."
read_when:
  - When changing files under `backend/src/api/processing/formatters/*`.
  - When debugging why events are skipped, transformed, or fail schema validation on outbound websocket payloads.
title: "Backend API Processing Formatters Docs Hub"
---

# Backend API Processing Formatters Docs Hub

## Deep Pages

- [Base Formatter Guard Utilities and Skip Semantics Reference](base_formatter_guard_utilities_and_skip_semantics_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](formatter_validation_and_contract_test_matrix_reference.md)
- [Formatter Registry Docs Hub](registry/README.md)
- [Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference](registry/response_formatter_registry_lifecycle_lazy_specs_and_context_attachment_reference.md)

## Code Scope

- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/processing/formatters/*.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/transport/envelope.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_outgoing_schema_contract.py`
- `tests/backend/test_api_contract_registry.py`
- `tests/backend/test_tool_bundle_formatter.py`
