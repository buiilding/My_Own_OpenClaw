---
summary: "Deep reference for cache-manager namespaces and key generation, cache-entry dataclass defaults, global singleton identity, and `cache.py` facade export boundaries."
read_when:
  - When changing cache namespace ttl defaults, cache key formats, or cache-manager singleton wiring.
  - When changing `CacheEntry` fields or `cache.py` public export surface used by importers/tests.
title: "Cache Manager Namespace Keying, Cache Entry Dataclass, and Facade Export Contract Reference"
---

# Cache Manager Namespace Keying, Cache Entry Dataclass, and Facade Export Contract Reference

## Canonical Modules

- `backend/src/core/infrastructure/cache_manager.py`
- `backend/src/core/infrastructure/cache_entry.py`
- `backend/src/core/infrastructure/cache.py`
- `tests/backend/test_cache_entry.py`

## Cache Entry Dataclass Contract

`CacheEntry` fields:

- `value: Any`
- `expires_at: float`
- `created_at: float` default `time.time()`
- `is_error: bool` default `False`

Meaning:

- `is_error=True` marks cached exception entries used by negative-cache path.

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

## `cache.py` Facade Export Contract

`core/infrastructure/cache.py` re-exports:

- `CacheEntry`
- `Cache` (from `cache_store`)
- `CacheManager`
- `cache_manager`

Purpose:

- stable convenience import surface for cache primitives.

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
3. Changing facade exports in `cache.py` can break existing import paths in runtime/tests.

## Related Pages

- [Backend Core Cache Docs Hub](README.md)
- [Cache Store TTL, LRU, Negative-Cache, and Sync/Async Waiter Contract Reference](cache_store_ttl_lru_negative_cache_and_sync_async_waiter_contract_reference.md)
- [Event Bus and Cache Infrastructure Reference](../event_bus_and_cache_infrastructure_reference.md)
