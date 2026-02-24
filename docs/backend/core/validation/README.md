---
summary: "Backend core validation docs sub-hub for shared input sanitization, frontend config patch gating, and API-layer error/validator integration."
read_when:
  - When changing shared validation helpers used by API handlers/routes.
  - When debugging rejected settings/query/user-id payloads or error-message exposure policy.
title: "Backend Core Validation Docs Hub"
---

# Backend Core Validation Docs Hub

## Deep Pages

- [Input Validation and Frontend Patch Guard Reference](input_validation_and_frontend_patch_guard_reference.md)

## Code Scope

- `backend/src/core/validation/validators.py`
- `backend/src/api/schemas/common.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/handlers/settings.py`
- `backend/src/api/infrastructure/errors.py`
- `tests/backend/test_validation_utils.py`
- `tests/backend/test_api_errors.py`
