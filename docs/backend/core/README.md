---
summary: "Backend core-infrastructure docs sub-hub for EventBus internals, cache primitives, and cross-cutting core runtime behavior."
read_when:
  - When changing `backend/src/core/infrastructure/*` or wiring new cross-cutting backend runtime primitives.
  - When debugging event dispatch ordering, handler-lifecycle leaks, or cache behavior under concurrent load.
title: "Backend Core Infrastructure Docs Hub"
---

# Backend Core Infrastructure Docs Hub

## Deep Pages

- [Event Bus and Cache Infrastructure Reference](event_bus_and_cache_infrastructure_reference.md)
- [Core Observability Docs Hub](observability/README.md)
- [Trust-Boundary Metrics and Enforcement Reference](observability/trust_boundary_metrics_and_enforcement_reference.md)
- [Core Validation Docs Hub](validation/README.md)
- [Input Validation and Frontend Patch Guard Reference](validation/input_validation_and_frontend_patch_guard_reference.md)
- [Core Messages Docs Hub](messages/README.md)
- [Stored Message LLM Serialization, Tool-Call Normalization, and Multimodal Image Contract Reference](messages/stored_message_llm_serialization_tool_call_normalization_and_multimodal_image_contract_reference.md)
- [Content Converter Parsing, First-Image Selection, and Type-Alias Export Contract Reference](messages/content_converter_parsing_first_image_selection_and_type_alias_export_contract_reference.md)
- [Core Cache Docs Hub](cache/README.md)
- [Cache Store TTL, LRU, Negative-Cache, and Sync/Async Waiter Contract Reference](cache/cache_store_ttl_lru_negative_cache_and_sync_async_waiter_contract_reference.md)
- [Cache Manager Namespace Keying, Cache Entry Dataclass, and Facade Export Contract Reference](cache/cache_manager_namespace_keying_cache_entry_dataclass_and_facade_export_contract_reference.md)
- [Core Interfaces Docs Hub](interfaces/README.md)
- [Embedding Provider Async Contract and Container Wiring Reference](interfaces/embedding_provider_async_contract_and_container_wiring_reference.md)
- [Vision Service Protocol Boundary and Session Hierarchy Access Contract Reference](interfaces/vision_service_protocol_boundary_and_session_hierarchy_access_contract_reference.md)
- [Core Logging Docs Hub](logging/README.md)
- [Log Profile Noise Filter and Env-Level Resolution Contract Reference](logging/log_profile_noise_filter_and_env_level_resolution_contract_reference.md)

## Code Scope

- `backend/src/core/infrastructure/*`
- `backend/src/core/events/*`
- `backend/src/core/observability/*`
- `backend/src/core/validation/*`
- `backend/src/core/messages/*`
- `backend/src/core/infrastructure/cache*`
- `backend/src/core/interfaces/*`
- `backend/src/core/logging_setup.py`
- `backend/src/core/types/aliases.py`
- `backend/src/core/config/service.py`
- `backend/src/core/config/subscriptions.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/embeddings/embeddings.py`
