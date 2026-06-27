---
summary: "Backend API memory docs sub-hub for semantic summarize/title service config resolution/parser fallback and embeddings route serialization/health-check contracts."
read_when:
  - When changing files under `backend/src/api/routes/memory/*`, especially `memory/semantic/*`.
  - When debugging summarize/title endpoint parsing fallback behavior or embeddings health-check failures.
title: "Backend API Memory Docs Hub"
---

# Backend API Memory Docs Hub

## Deep Pages

- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Semantic Parser Summary/Fact Extraction and Fallback-Bullet Contract Reference](semantic_parser_summary_fact_extraction_and_fallback_bullet_contract_reference.md)
- [Semantic Title Generation Route, Model-Override, and Parser-Fallback Contract Reference](semantic_title_generation_route_model_override_and_parser_fallback_contract_reference.md)
- [Semantic Route Package Split Reference](semantic_route_package_split_reference.md)
- [Embeddings Route Package Split and Export Contract Reference](embeddings_route_package_split_and_export_contract_reference.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
- [Health Helper Safe-Check, Dependency-Probe, and Payload Contract Reference](health_helper_safe_check_dependency_probe_and_payload_contract_reference.md)

## Related Pages

- [Backend API Docs Hub](../README.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
- [Input Validation and Client Settings Patch Guard Reference](../../core/validation/input_validation_and_client_settings_patch_guard_reference.md)

## Code Scope

- `backend/src/api/routes/memory/semantic/router.py`
- `backend/src/api/routes/memory/semantic/models.py`
- `backend/src/api/routes/memory/semantic/service.py`
- `backend/src/api/routes/memory/semantic/parser.py`
- `backend/src/api/routes/memory/embeddings/router.py`
- `backend/src/api/routes/memory/embeddings/models.py`
- `backend/src/api/routes/memory/embeddings/service.py`
- `backend/src/api/routes/memory/health.py`
- `tests/backend/test_memory_routes.py`
