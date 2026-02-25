---
summary: "Backend core cache docs sub-hub for cache-store ttl/lru/negative-cache concurrency semantics and cache-manager namespace keying plus facade export contracts."
read_when:
  - When changing cache internals under `backend/src/core/infrastructure/cache*`.
  - When debugging cache hit/miss behavior, waiter synchronization, key generation, or cache singleton wiring.
title: "Backend Core Cache Docs Hub"
---

# Backend Core Cache Docs Hub

## Deep Pages

- [Cache Store TTL, LRU, Negative-Cache, and Sync/Async Waiter Contract Reference](cache_store_ttl_lru_negative_cache_and_sync_async_waiter_contract_reference.md)
- [Cache Manager Namespace Keying, Cache Entry Dataclass, and Facade Export Contract Reference](cache_manager_namespace_keying_cache_entry_dataclass_and_facade_export_contract_reference.md)

## Related Pages

- [Backend Core Infrastructure Docs Hub](../README.md)
- [Event Bus and Cache Infrastructure Reference](../event_bus_and_cache_infrastructure_reference.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../../tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)

## Code Scope

- `backend/src/core/infrastructure/cache_store.py`
- `backend/src/core/infrastructure/cache_manager.py`
- `backend/src/core/infrastructure/cache_entry.py`
- `backend/src/core/infrastructure/cache.py`
- `tests/backend/test_cache_layer.py`
- `tests/backend/test_cache_entry.py`
