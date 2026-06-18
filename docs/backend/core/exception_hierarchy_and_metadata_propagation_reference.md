---
summary: "Backend core exception reference for the live `error_types/*` hierarchy, metadata merge helpers, and trust-boundary scoped error payload conventions."
read_when:
  - When adding/changing exception classes under `backend/src/core/infrastructure/error_types/*`.
  - When debugging missing `error_code`/metadata fields in logs, parser errors, or tool/LLM/session failure propagation.
title: "Exception Hierarchy and Metadata Propagation Reference"
---

# Exception Hierarchy and Metadata Propagation Reference

## Canonical Modules

- `backend/src/core/infrastructure/error_types/base.py`
- `backend/src/core/infrastructure/error_types/llm.py`
- `backend/src/core/infrastructure/error_types/trust_boundary.py`
- `tests/backend/test_exceptions.py`

## Export Surface

Canonical exception definitions live under the concrete modules in
`core.infrastructure.error_types`.

Use these first-class import paths:

- base exception class: `backend.src.core.infrastructure.error_types.base`
- live domain-specific implementations:
  `backend.src.core.infrastructure.error_types.llm` and
  `backend.src.core.infrastructure.error_types.trust_boundary`

The old `core.infrastructure.exceptions` compatibility facade and the
`core.infrastructure.error_types` package re-export surface have been removed.
Runtime code and tests should import concrete owner modules directly.

## Hierarchy Map

Base:

- `BaseAppError`

Domain branches:

- `LLMError`
  - `LLMAPIError`
  - `LLMRateLimitError`
- `_TrustBoundaryError`
  - `InputSizeLimitError`
  - `ParseTimeoutError`
  - `ParseValidationError`

The unused configuration, tooling, memory, and session error modules have been
removed; runtime callers should use concrete local exceptions or existing
domain result objects instead of restoring test-only wrappers.
`tests/backend/test_exceptions.py` locks the live inheritance structure.

## Base Error Contract (`BaseAppError`)

All domain errors carry:

- `message`
- optional `error_code`
- optional structured `metadata` dict (defaults to `{}`)
- optional `cause`

String/representation behavior:

- `str(error)` prefixes with `[ERROR_CODE]` when set
- `repr(error)` includes code/metadata/cause only when present

## Metadata Helper Semantics (`base.py`)

Shared helpers preserve truthy-only merge behavior:

- `_merge_metadata_if(metadata, include, **extra)`
- `_metadata_with_optional_field(metadata, field_name, field_value)`
- `_merge_trust_boundary_metadata(metadata, boundary_name, **fields)`

Scoped initializer helpers:

- `_init_scoped_context_error(...)` wires scope attributes + mirrored metadata key
- `_init_optional_scoped_context_error(...)` extends scoped error with one optional metadata field

These helpers are the consistency boundary for error metadata shape across domains.

## Domain-Specific Error Contracts

### LLM

- `LLMError` scope key is `model`
- defaults:
  - `LLMError`: `LLM_ERROR`
  - `LLMAPIError`: `LLM_API_ERROR` (+ optional `status_code`)
  - `LLMRateLimitError`: `LLM_RATE_LIMIT` (+ optional `retry_after`)

### Trust Boundary

- `_TrustBoundaryError` scope key is `boundary_name`
- `InputSizeLimitError`: `INPUT_SIZE_LIMIT_ERROR`, optional `actual_size` + `max_size`
- `ParseTimeoutError`: `PARSE_TIMEOUT_ERROR`, optional `timeout_seconds`
- `ParseValidationError`: `PARSE_VALIDATION_ERROR`, optional `validation_errors`

Trust-boundary metadata merge is centralized through `_merge_trust_boundary_metadata(...)`.

## Runtime Usage Hotspots

Common call paths using this surface:

- parser extraction/validation and response limits (`ParseTimeoutError`, `ParseValidationError`, `InputSizeLimitError`)
- provider and client normalization failures (`LLMAPIError`)

## Test-Backed Invariants

`tests/backend/test_exceptions.py` validates:

- message/code/metadata defaults for each live domain class
- optional scope/field metadata propagation (`model`, `status_code`, `validation_errors`, `boundary_name`, etc.)
- inheritance relations from domain subclasses back to `BaseAppError`

## Drift Hotspots

1. Changing helper merge truthiness rules can silently alter emitted metadata payloads across all exception families.
2. Renaming error codes breaks parser/provider/tool tests and any error-code-based handling in upstream callers.
3. Reintroducing a facade for `core.infrastructure.exceptions` can hide direct ownership of the exception hierarchy and should be avoided.

## Related Pages

- [Backend Core Infrastructure Docs Hub](README.md)
- [Core Observability Docs Hub](observability/README.md)
- [Trust-Boundary Metrics and Enforcement Reference](observability/trust_boundary_metrics_and_enforcement_reference.md)
