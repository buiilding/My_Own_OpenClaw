---
summary: "Deep reference for cache-manager namespaces and key generation, cache-entry dataclass defaults, and global singleton identity."
read_when:
  - When changing cache namespace ttl defaults, cache key formats, or cache-manager singleton wiring.
  - When changing `CacheEntry` fields or cache-manager singleton wiring used by importers/tests.
title: "Cache Manager Namespace Keying and Cache Entry Singleton Reference"
---

# Cache Manager Namespace Keying and Cache Entry Singleton Reference

## Canonical Modules

- `backend/src/core/infrastructure/cache_manager.py`
- `backend/src/core/infrastructure/cache_entry.py`
- `tests/backend/test_cache_entry.py`

## Cache Entry Dataclass Contract

`CacheEntry` fields:

- `value: Any`
- `expires_at: float`
- `created_at: float` default `time.time()`

## Cache Manager Namespace Contract

`CacheManager.__init__` creates four namespaces:

- `tool_schemas` (ttl `3600s`)
- `embeddings` (ttl `86400s`)
- `llm_clients` (ttl `86400s`)
- `generic` (ttl `3600s`)

`clear_all()` clears all namespaces.

`get_stats()` returns per-namespace stats maps from each cache.

## Key Generation Contract

Key builder methods:

- `get_tool_schema_key(tool_name)` -> `tool_schema:<tool_name>`
- `get_embedding_key(text)` -> `embedding:<sha256(text)>`
- `get_llm_client_key(config_hash)` -> `llm_client:<config_hash>`

Notable behavior:

- embedding key hash is deterministic for same input text and different across differing text.

## Singleton Identity Contract

Module-level singleton:

- `cache_manager = CacheManager()`

Expected contract:

- imports of `cache_manager` resolve to same instance identity within process.

## Import Boundary

Cache callers import concrete owner modules directly:

- `CacheEntry` from `backend.src.core.infrastructure.cache_entry`
- `Cache` from `backend.src.core.infrastructure.cache_store`
- `CacheManager` and `cache_manager` from
  `backend.src.core.infrastructure.cache_manager`

## Test-Backed Matrix

`tests/backend/test_cache_entry.py` verifies:

- cache entry default/custom field behavior
- namespace initialization and ttl defaults
- key generation formats + embedding hash determinism
- clear_all and get_stats behavior
- singleton existence and identity stability

## Drift Hotspots

1. Changing namespace ttl defaults impacts schema/embedding/client cache retention globally.
2. Altering key prefixes/formats without migration can orphan existing cached data.
3. Reintroducing a cache facade can hide ownership of the store, entry, and
   manager modules and should be avoided.

## Related Pages

- [Backend Core Cache Docs Hub](README.md)
- [Cache Store TTL, LRU, and Stats Contract Reference](cache_store_ttl_lru_stats_contract_reference.md)
- [Event Bus and Cache Infrastructure Reference](../event_bus_and_cache_infrastructure_reference.md)
