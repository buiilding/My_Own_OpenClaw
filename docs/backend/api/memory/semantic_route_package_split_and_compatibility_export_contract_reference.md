---
summary: "Deep reference for backend memory semantic package split: router/models/parser/service ownership boundaries, package export contract, and compatibility aliases used by route tests."
read_when:
  - When changing module boundaries under `backend/src/api/routes/memory/semantic/*`.
  - When debugging import/monkeypatch drift after replacing flat `memory.semantic` modules with package-level exports.
title: "Semantic Route Package Split and Compatibility Export Contract Reference"
---

# Semantic Route Package Split and Compatibility Export Contract Reference

## Canonical Modules

- `backend/src/api/routes/memory/__init__.py`
- `backend/src/api/routes/memory/semantic/__init__.py`
- `backend/src/api/routes/memory/semantic/router.py`
- `backend/src/api/routes/memory/semantic/models.py`
- `backend/src/api/routes/memory/semantic/parser.py`
- `backend/src/api/routes/memory/semantic/service.py`
- `backend/src/api/routes/__init__.py`
- `tests/backend/test_memory_routes.py`
- `tests/backend/test_semantic_parser_service.py`

## Package Ownership Boundary

Semantic route internals are split by responsibility:

- `router.py`: FastAPI route handlers (`/summarize`, `/title`, `/health`) and explicit service dependency composition.
- `models.py`: Pydantic request/response contracts and shared user-id validators.
- `parser.py`: model-output parsing helpers for summary/fact extraction.
- `service.py`: config resolution, LLM call flow, prompt building, title parsing, and sanitized error handling.

`semantic/__init__.py` is a compatibility export surface, not a second runtime owner.

## Router Registration Contract

Memory route package wiring stays stable:

1. `backend/src/api/routes/memory/__init__.py` exports `embeddings` and `semantic`.
2. `backend/src/api/routes/__init__.py` imports `from .memory import embeddings, semantic`.
3. `API_ROUTERS` appends `semantic.router`.

Result: switching to package internals does not change public API prefixes (`/api/semantic/*`).

## Compatibility Export Surface

`semantic/__init__.py` re-exports:

- route handlers:
  - `summarize_conversations`
  - `generate_conversation_title`
  - `health_check`
- compatibility parser helpers:
  - `_parse_summarization_response`
  - `_extract_fallback_facts`
- route object:
  - `router`
- service exports:
  - `SemanticSummarizationService`
  - `FALLBACK_TITLE`

This allows existing imports like `from ...memory import semantic as semantic_routes` to keep working while tests and callers gradually move to direct package-module imports.

## Handler Injection and Monkeypatch Contract

Route handlers in `router.py` call `_build_semantic_service()`, which constructs `SemanticSummarizationService` with explicit callables:

- `get_llm_client`
- `load_api_key_for_provider`
- `parse_summarization_response`
- `extract_fallback_facts`

This preserves test seam behavior:

- route tests can monkeypatch module-level providers/helpers
- parser/service tests can instantiate service with synthetic callables directly

No global singleton service instance is retained across requests.

## Test-Locked Invariants

`tests/backend/test_memory_routes.py` locks:

- `semantic_routes` import shape from package export surface
- parser helper alias behavior (`_parse_summarization_response`, `_extract_fallback_facts`)
- summarize/title route behavior with session config precedence and override handling
- semantic health behavior with unhealthy fallback on unexpected container errors

`tests/backend/test_semantic_parser_service.py` locks:

- direct module imports from `memory/semantic/parser.py` and `memory/semantic/service.py`
- numbered bullet parsing support and fallback fact filtering
- title parse normalization and fallback-title behavior

## Drift Hotspots

1. Removing helper alias exports from `semantic/__init__.py` can break route tests that import package-level parser helpers.
2. Moving handler/service imports without updating constructor callables can disable test monkeypatch seams silently.
3. Registering routes from a non-canonical symbol (not `semantic.router`) can bypass package-level compatibility assumptions.
4. Reintroducing flat legacy files alongside package modules can hide import errors and create split behavior at runtime.

## Related Pages

- [Backend API Memory Docs Hub](README.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Semantic Parser Summary/Fact Extraction and Fallback-Bullet Contract Reference](semantic_parser_summary_fact_extraction_and_fallback_bullet_contract_reference.md)
- [Semantic Title Generation Route, Model-Override, and Parser-Fallback Contract Reference](semantic_title_generation_route_model_override_and_parser_fallback_contract_reference.md)
