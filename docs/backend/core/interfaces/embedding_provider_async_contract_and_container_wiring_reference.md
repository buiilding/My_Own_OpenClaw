---
summary: "Deep reference for `EmbeddingProvider` abstraction: async embed_text/embed_batch and dimension property contract, SentenceTransformer implementation behavior, and DI wiring from container factories."
read_when:
  - When changing `EmbeddingProvider` interface signatures or async semantics.
  - When changing embedder construction in container factories or sentence-transformer caching behavior.
title: "Embedding Provider Async Contract and Container Wiring Reference"
---

# Embedding Provider Async Contract and Container Wiring Reference

## Canonical Modules

- `backend/src/core/interfaces/embedding.py`
- `backend/src/embeddings/embeddings.py`
- `backend/src/core/container/factories.py`
- `tests/backend/test_embeddings_provider.py`

## Interface Contract (`EmbeddingProvider`)

`EmbeddingProvider` defines abstract async methods:

- `embed_text(text: str) -> np.ndarray`
- `embed_batch(texts: List[str]) -> List[np.ndarray]`

And abstract property:

- `dimension -> int`

Design contract:

- methods are async so implementations can offload blocking inference without blocking event loop.

## Container Wiring Contract

`_create_embedder(config, cache_manager)` in `core/container/factories.py`:

- returns `None` when `config.memory_enabled` is false
- otherwise constructs `SentenceTransformerProvider` with:
  - model name from config
  - device selection (`cuda` -> `mps` -> `cpu` fallback)
  - injected `cache_manager`
- provider creation defers model load; async `initialize()` required before embed calls

Failure behavior:

- import/creation failures logged and return `None` instead of crashing startup.

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

## Related Pages

- [Backend Core Interfaces Docs Hub](README.md)
- [Embedding and Semantic Memory Runtime Reference](../../services/embedding_and_semantic_memory_runtime_reference.md)
- [Backend Core Cache Docs Hub](../cache/README.md)
