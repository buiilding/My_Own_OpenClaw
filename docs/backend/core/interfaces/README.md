---
summary: "Backend core interface docs sub-hub for embedding provider abstract contract, vision service protocol boundary, and concrete wiring call-sites in factories/preparation helpers."
read_when:
  - When changing contracts under `backend/src/core/interfaces/*`.
  - When changing embedder/vision dependency wiring between container factories and tool preparation runtime.
title: "Backend Core Interfaces Docs Hub"
---

# Backend Core Interfaces Docs Hub

## Deep Pages

- [Embedding Provider Async Contract and Container Wiring Reference](embedding_provider_async_contract_and_container_wiring_reference.md)
- [Vision Service Protocol Boundary and Session Hierarchy Access Contract Reference](vision_service_protocol_boundary_and_session_hierarchy_access_contract_reference.md)

## Related Pages

- [Backend Core Infrastructure Docs Hub](../README.md)
- [Embedding and Semantic Memory Runtime Reference](../../services/embedding_and_semantic_memory_runtime_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](../../services/screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../tools/tool_preparation_and_coordinate_resolution_reference.md)

## Code Scope

- `backend/src/core/interfaces/embedding.py`
- `backend/src/core/interfaces/vision.py`
- `backend/src/core/container/factories.py`
- `backend/src/embeddings/embeddings.py`
- `backend/src/agent/tools/preparation/helpers/vision_service_provider.py`
- `tests/backend/test_embeddings_provider.py`
- `tests/backend/test_vision_service.py`
