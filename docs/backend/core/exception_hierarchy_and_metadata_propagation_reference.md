---
summary: "Backend core exception reference for `error_types/*` hierarchy, compatibility export facade semantics, metadata merge helpers, and trust-boundary scoped error payload conventions."
read_when:
  - When adding/changing exception classes under `backend/src/core/infrastructure/error_types/*`.
  - When debugging missing `error_code`/metadata fields in logs, parser errors, or tool/LLM/session failure propagation.
title: "Exception Hierarchy and Metadata Propagation Reference"
---

# Exception Hierarchy and Metadata Propagation Reference

## Canonical Modules

- `backend/src/core/infrastructure/error_types/__init__.py`
- `backend/src/core/infrastructure/error_types/base.py`
- `backend/src/core/infrastructure/error_types/configuration.py`
- `backend/src/core/infrastructure/error_types/llm.py`
- `backend/src/core/infrastructure/error_types/tooling.py`
- `backend/src/core/infrastructure/error_types/memory.py`
- `backend/src/core/infrastructure/error_types/session.py`
- `backend/src/core/infrastructure/error_types/trust_boundary.py`
- `backend/src/core/infrastructure/exceptions.py`
- `tests/backend/test_exceptions.py`

## Export Surface and Compatibility Contract

Canonical exception definitions now live under `core.infrastructure.error_types`.

`core.infrastructure.exceptions` remains a compatibility facade:

- re-exports the public list from `error_types.__all__`
- preserves historical import paths used across parser/LLM/agent code
- still exports internal helper symbols used by legacy tests and compatibility checks (`_TrustBoundaryError`, `_LLMOptionalFieldError`, metadata helper functions)

Operational contract:

- new callers should prefer `core.infrastructure.exceptions` for stable imports
- internal class implementations stay split by concern in `error_types/*`

## Hierarchy Map

Base:

- `BaseAppError`

Domain branches:

- `ConfigurationError`
- `LLMError`
  - `LLMAPIError`
  - `LLMRateLimitError`
- `ToolExecutionError`
  - `ToolValidationError`
  - `ToolNotFoundError`
- `MemoryError`
  - `MemoryStoreError`
  - `EmbeddingError`
- `SessionError`
- `_TrustBoundaryError`
  - `InputSizeLimitError`
  - `ParseTimeoutError`
  - `ParseValidationError`

`tests/backend/test_exceptions.py` locks this inheritance structure.

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

### Configuration

- `ConfigurationError` always sets `error_code="CONFIG_ERROR"`
- optional `config_key` is mirrored to `metadata.config_key`

### LLM

- `LLMError` scope key is `model`
- defaults:
  - `LLMError`: `LLM_ERROR`
  - `LLMAPIError`: `LLM_API_ERROR` (+ optional `status_code`)
  - `LLMRateLimitError`: `LLM_RATE_LIMIT` (+ optional `retry_after`)

### Tooling

- `ToolExecutionError`: `TOOL_EXECUTION_ERROR` (+ optional `tool_name`)
- `ToolValidationError`: `TOOL_VALIDATION_ERROR`, optional `validation_errors` list metadata
- `ToolNotFoundError`: `TOOL_NOT_FOUND`, message includes missing tool name

### Memory

- `MemoryError` scope key is `user_id`
- `MemoryStoreError`: `MEMORY_STORE_ERROR`, optional `operation`
- `EmbeddingError`: `EMBEDDING_ERROR`

### Session

- `SessionError`: `SESSION_ERROR`
- optional metadata includes `session_id` and `user_id`

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
- tool orchestration lookup/validation failures (`ToolExecutionError`, `ToolNotFoundError`, `ToolValidationError`)

## Test-Backed Invariants

`tests/backend/test_exceptions.py` validates:

- message/code/metadata defaults for each domain class
- optional scope/field metadata propagation (`model`, `status_code`, `tool_name`, `validation_errors`, `boundary_name`, etc.)
- inheritance relations from domain subclasses back to `BaseAppError`

## Drift Hotspots

1. Changing helper merge truthiness rules can silently alter emitted metadata payloads across all exception families.
2. Renaming error codes breaks parser/provider/tool tests and any error-code-based handling in upstream callers.
3. Removing compatibility exports from `core.infrastructure.exceptions` can break existing import paths in runtime and tests.

## Related Pages

- [Backend Core Infrastructure Docs Hub](README.md)
- [Core Observability Docs Hub](observability/README.md)
- [Trust-Boundary Metrics and Enforcement Reference](observability/trust_boundary_metrics_and_enforcement_reference.md)
