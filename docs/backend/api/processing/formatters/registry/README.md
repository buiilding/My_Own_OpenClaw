---
summary: "Backend API formatter registry docs sub-hub for canonical formatter-spec ownership, ResponseFormatter dual-dispatch map construction, and context-envelope attachment behavior."
read_when:
  - When changing `backend/src/api/contracts/formatter_specs.py` or `backend/src/api/processing/formatter.py`.
  - When debugging formatter registration drift, duplicate-spec failures, or missing context fields in outbound stream events.
title: "Backend API Formatter Registry Docs Hub"
---

# Backend API Formatter Registry Docs Hub

## Deep Pages

- [Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference](response_formatter_registry_lifecycle_lazy_specs_and_context_attachment_reference.md)

## Related Pages

- [API Processing Formatters Docs Hub](../README.md)
- [Formatter Dispatch and Schema Alignment Reference](../../formatter_dispatch_and_schema_alignment_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](../formatter_validation_and_contract_test_matrix_reference.md)

## Code Scope

- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/transport/envelope.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_api_contract_registry.py`
