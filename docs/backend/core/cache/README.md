---
summary: "Backend core cache docs sub-hub for cache-store ttl/lru/stat semantics and cache-manager namespace keying."
read_when:
  - When changing cache internals under `backend/src/core/infrastructure/cache*`.
  - When debugging cache hit/miss behavior, ttl expiry, eviction, key generation, or cache singleton wiring.
title: "Backend Core Cache Docs Hub"
---

# Backend Core Cache Docs Hub

## Deep Pages

- [Cache Store TTL, LRU, and Stats Contract Reference](cache_store_ttl_lru_stats_contract_reference.md)
- [Cache Manager Namespace Keying and Cache Entry Singleton Reference](cache_manager_namespace_keying_cache_entry_singleton_reference.md)

## Related Pages

- [Backend Core Infrastructure Docs Hub](../README.md)
- [Event Bus and Cache Infrastructure Reference](../event_bus_and_cache_infrastructure_reference.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../../tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)

## Code Scope

- `backend/src/core/infrastructure/cache_store.py`
- `backend/src/core/infrastructure/cache_manager.py`
- `backend/src/core/infrastructure/cache_entry.py`
- `tests/backend/test_cache_layer.py`
- `tests/backend/test_cache_entry.py`
