---
summary: "Backend API formatter action docs sub-hub for tool-call/tool-output validation contracts and tool-bundle typed/dict parity plus default-shape behavior."
read_when:
  - When changing tool action formatter modules (`tool_call`, `tool_output`, `tool_bundle`).
  - When debugging dropped tool-call/output payloads, request-id/metadata passthrough, or tool-bundle default payload shape.
title: "Backend API Formatter Action Docs Hub"
---

# Backend API Formatter Action Docs Hub

## Deep Pages

- [Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference](tool_call_and_tool_output_formatter_validation_and_metadata_passthrough_reference.md)
- [Tool Bundle Formatter Typed/Dict Parity and Default-Payload Contract Reference](tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md)

## Related Pages

- [Backend API Processing Formatters Docs Hub](../README.md)
- [Formatter Validation and Contract-Test Matrix Reference](../formatter_validation_and_contract_test_matrix_reference.md)
- [Formatter Signal Docs Hub](../signals/README.md)
- [Formatter Message Docs Hub](../messages/README.md)

## Code Scope

- `backend/src/api/processing/formatters/tool_call.py`
- `backend/src/api/processing/formatters/tool_output.py`
- `backend/src/api/processing/formatters/tool_bundle.py`
- `backend/src/api/schemas/outgoing.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_tool_bundle_formatter.py`
