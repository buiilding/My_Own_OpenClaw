---
summary: "Backend core observability docs sub-hub for trust-boundary violation metrics, DI wiring, and exception metadata conventions."
read_when:
  - When changing trust-boundary validation behavior in parser/prompt modules.
  - When debugging missing violation metrics, boundary-name tagging, or cross-boundary stats aggregation.
title: "Backend Core Observability Docs Hub"
---

# Backend Core Observability Docs Hub

## Deep Pages

- [Trust-Boundary Metrics and Enforcement Reference](trust_boundary_metrics_and_enforcement_reference.md)

## Code Scope

- `backend/src/core/observability/trust_boundary_metrics.py`
- `backend/src/core/infrastructure/exceptions.py`
- `backend/src/core/infrastructure/error_types/trust_boundary.py`
- `backend/src/core/container/core_container.py`
- `backend/src/core/container/session_runtime.py`
- `backend/src/llm/parser.py`
- `backend/src/llm/prompts/prompt_constructor.py`
- `tests/backend/test_trust_boundary_metrics.py`
- `tests/backend/test_response_parser_limits.py`
