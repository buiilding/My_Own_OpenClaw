---
summary: "Deep reference for `EmbeddingProvider` abstraction: async embed_text/embed_batch and provider/model identity contract, SentenceTransformer implementation behavior, and DI wiring through the embedding router."
read_when:
  - When changing `EmbeddingProvider` interface signatures or async semantics.
  - When changing embedder construction, embedding-router wiring, or sentence-transformer caching behavior.
title: "Embedding Provider Async Contract and Container Wiring Reference"
---

# Embedding Provider Async Contract and Container Wiring Reference

## Canonical Modules

- `backend/src/core/interfaces/embedding.py`
- `backend/src/core/inference/embedding_router.py`
- `backend/src/embeddings/embeddings.py`
- `backend/src/core/container/factories.py`
- `backend/src/core/container/application.py`
- `tests/backend/test_embeddings_provider.py`
- `tests/backend/test_inference_routers.py`

## Interface Contract (`EmbeddingProvider`)

`EmbeddingProvider` defines abstract async methods:

- `embed_text(text: str) -> np.ndarray`
- `embed_batch(texts: List[str]) -> List[np.ndarray]`

And abstract property:

- `dimension -> int`

And default identity properties:

- `provider_id -> str`
- `model_id -> str`

Design contract:

- methods are async so implementations can offload blocking inference without blocking event loop.

## Router Wiring Contract

`_create_embedder(config, cache_manager)` in `core/container/factories.py`:

- returns `None` when `config.memory_enabled` is false
- otherwise constructs `SentenceTransformerProvider` with:
  - model name from config
  - device selection (`cuda` -> `mps` -> `cpu` fallback)
  - injected `cache_manager`
- provider creation defers model load; async `initialize()` required before embed calls

Failure behavior:

- import/creation failures logged and return `None` instead of crashing startup.

`ApplicationContainer` then wraps the configured embedding provider in `EmbeddingRouter`:

- the router becomes the container-facing embedding capability boundary
- route handlers and future orchestration layers can depend on the router instead of the concrete sentence-transformer class
- provider swaps can update the router without changing higher-level call sites

## SentenceTransformerProvider Contract

Initialization/runtime guarantees:

- initialization serialized with `asyncio.Lock` to prevent concurrent double model load
- blocking model load and encode calls run in executor outside tests
- `_ensure_initialized()` raises runtime error when methods called before initialize

Caching behavior:

- `embed_text` and `embed_batch` use `cache_manager.embeddings` when configured
- embedding keys generated via `cache_manager.get_embedding_key(text)`
- batch path merges cached hits and new encodes, then reorders to input order

Dimension behavior:

- `dimension` raises until initialized
- after initialize, returns provider model sentence embedding dimension

## Test-Backed Matrix

`tests/backend/test_embeddings_provider.py` verifies:

- initialize path + dimension availability
- pre-initialize dimension access failure
- embed_text cache hit avoids duplicate encode calls
- embed_batch combines cached/new values and preserves input order

## Drift Hotspots

1. Making interface methods sync can leak blocking inference onto event loop.
2. Removing init lock risks concurrent double model allocation/OOM.
3. Changing batch reorder logic can return embeddings mismatched to input text order.
4. Returning container-facing concrete providers instead of the router reintroduces singleton coupling into route/orchestration code.

## Related Pages

- [Backend Core Interfaces Docs Hub](README.md)
- [Embedding and Semantic Memory Runtime Reference](../../services/embedding_and_semantic_memory_runtime_reference.md)
- [Backend Core Cache Docs Hub](../cache/README.md)
