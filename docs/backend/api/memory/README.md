---
summary: "Backend API memory docs sub-hub for semantic summarize/title service config resolution/parser fallback and embeddings route serialization/health-check contracts."
read_when:
  - When changing files under `backend/src/api/routes/memory/*`.
  - When debugging summarize/title endpoint parsing fallback behavior or embeddings health-check failures.
title: "Backend API Memory Docs Hub"
---

# Backend API Memory Docs Hub

## Deep Pages

- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)

## Related Pages

- [Backend API Docs Hub](../README.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
- [Input Validation and Frontend Patch Guard Reference](../../core/validation/input_validation_and_frontend_patch_guard_reference.md)

## Code Scope

- `backend/src/api/routes/memory/semantic.py`
- `backend/src/api/routes/memory/semantic_service.py`
- `backend/src/api/routes/memory/semantic_parser.py`
- `backend/src/api/routes/memory/embeddings.py`
- `backend/src/api/routes/memory/health.py`
- `tests/backend/test_memory_routes.py`
