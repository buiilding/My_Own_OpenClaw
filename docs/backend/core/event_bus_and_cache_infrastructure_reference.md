---
summary: "Backend core infrastructure reference for EventBus handler resolution/publish flow, config-change event fan-out, and in-memory cache semantics (TTL/LRU/negative caching/concurrency guards)."
read_when:
  - When editing event bus internals, event class hierarchy behavior, or configuration change notification flow.
  - When changing cache usage, key generation, TTL policy, or diagnosing cache stampede/error-caching behavior.
title: "Event Bus and Cache Infrastructure Reference"
---

# Event Bus and Cache Infrastructure Reference

## Canonical Modules

- `backend/src/core/infrastructure/bus.py`
- `backend/src/core/infrastructure/event_bus_registry.py`
- `backend/src/core/events/base.py`
- `backend/src/core/events/bus_events.py`
- `backend/src/core/infrastructure/cache_store.py`
- `backend/src/core/infrastructure/cache_manager.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/embeddings/embeddings.py`
- `backend/src/core/config/service.py`
- `backend/src/core/config/subscriptions.py`

## EventBus Runtime Model

`EventBus` owns:

- subscriber storage via `EventHandlerStore`
- global listeners/middleware-like hooks
- per-event publish counters (`_event_stats`)
- error-recovery mode (`enable_error_recovery`)

### Subscribe and Unsubscribe

- `subscribe(event_type, handler, priority, filter_func)` stores wrapped handlers sorted by ascending priority.
- `unsubscribe(...)` removes specific handler references for a specific event class.
- handler wrappers support both sync and async callables.

### Handler wrapping semantics

`EventHandlerWrapper` behavior:

- bound methods are stored as `weakref.WeakMethod` (prevents leaking object instances through strong refs)
- plain functions are stored strongly
- optional `filter_func(event)` can short-circuit invocation
- `call(event)` runs handler and awaits when result is awaitable

### MRO-based resolution and dedupe

`EventHandlerStore.resolve_handlers(event_type)`:

1. builds/uses MRO key cache for event class hierarchy
2. gathers handlers subscribed to each class in the hierarchy
3. deduplicates handlers by runtime handler object identity
4. sorts merged handlers by priority
5. caches resolved result for reuse

When subscriptions mutate, handler cache is invalidated.

### Dead-handler cleanup

On publish, inactive weak handlers are filtered out. If dead handlers are found, store cleanup prunes them and invalidates handler cache.

## Publish Pipeline Semantics

`EventBus.publish(event)` order:

1. increments event stats
2. runs global listeners first
3. listener returning `False` blocks downstream handlers
4. resolves active handlers through store
5. invokes handlers in priority order

Error behavior:

- if `enable_error_recovery=True` (default), listener/handler exceptions are logged and publish continues
- if `enable_error_recovery=False`, first listener/handler exception stops further processing

## Bus Event Producers and Consumers

### InteractionCompleted

- produced by `AgentExecutor._publish_completion_event(...)`
- subscribed by `AgentSession` in `agent/session/initializer.py`
- unsubscribed during session cleanup in `agent/session/lifecycle.py`

### ConfigChanged

- emitted by `ConfigurationService.update_config(...)` when `event_bus` is present
- runtime config subscribers are also notified via `ConfigSubscriptionManager`

## Config Subscription Manager Semantics

`ConfigSubscriptionManager` uses:

- thread-safe subscriber/callback lists (`threading.RLock`)
- copy-on-iterate strategy to prevent mutation during notification
- async subscriber calls (`await subscriber.on_config_changed(...)`)
- sync callback execution offloaded to threadpool (`run_in_executor`) to avoid event-loop blocking

## Cache Primitive Semantics

`Cache` (`cache_store.py`) combines:

- TTL expiration
- optional LRU eviction (`max_size` + ordered dict)
- negative caching of exceptions (`is_error=True`, short `error_ttl`)
- sync + async stampede guards for concurrent same-key compute paths

### Read path (`get`)

- cache miss increments `_misses`
- expired entries are removed then treated as miss
- successful hit moves key to end (LRU freshness)
- cached error entries re-raise stored exception object

### Write path (`set`)

- per-entry TTL (or default)
- overwrite preserves key freshness
- LRU eviction pops oldest key when max size exceeded

### Compute-on-miss guards

- `get_or_compute(...)` uses per-key `threading.Event` coordination
- `get_or_compute_async(...)` uses per-key `asyncio.Event` coordination
- only one caller computes; others wait and reuse result/error

### Negative caching

On compute failure, exception is cached temporarily (`error_ttl=5s` default). Repeated immediate callers receive same failure without recomputing until error entry expires.

## CacheManager Namespaces and Usage

`CacheManager` defines four named caches:

- `tool_schemas` (1h TTL)
- `embeddings` (24h TTL)
- `llm_clients` (24h TTL)
- `generic` (1h TTL)

Observed active usage:

- `tool_schemas`: used by `SchemaRegistry`
- `embeddings`: used by `SentenceTransformerProvider`
- `llm_clients`, `generic`: defined and exposed in stats, currently no direct runtime call sites

### Key generation contracts

- tool schema key: `tool_schema:{tool_name}`
- embedding key: `embedding:{sha256(text)}`
- llm client key helper exists (`llm_client:{config_hash}`) for future integration

## Schema Registry Cache Contract

`SchemaRegistry.get_schema(tool)`:

1. checks `tool_schemas` cache
2. validates canonical schema shape (`{type:'function', function:{name, parameters}}`)
3. regenerates cache entry if stale/non-canonical
4. logs and returns `None` on generation errors

This prevents malformed schema objects from persisting in cache.

## Embedding Cache Contract

`SentenceTransformerProvider`:

- optional cache dependency via DI
- caches individual text embeddings by hashed key
- batch embed path reuses cached values and computes only misses
- model loading and encode calls are offloaded to executor for non-test runtime
- initialization is serialized via `asyncio.Lock` to prevent duplicate model allocation

## Known Boundaries

- cache `get_or_compute*` helpers are currently defined but not used by call sites.
- event bus global listeners API exists, but standard runtime primarily uses per-event subscriptions.

## Debug Checklist

If events appear missing:

1. verify subscribed handler still alive (weakref-bound method owner not GC'd)
2. verify no global listener returned `False`
3. inspect event type/MRO mismatch against subscription class
4. check `enable_error_recovery` setting and handler exception logs

If cache behavior looks wrong:

1. verify TTL and `max_size` settings for that cache namespace
2. inspect for cached exceptions (`error_ttl` negative cache window)
3. confirm key generation consistency (tool name/text hashing)
4. check whether call path uses `get/set` directly vs compute helper path

## Related Pages

- [Backend Core Infrastructure Docs Hub](README.md)
- [Backend Core Cache Docs Hub](cache/README.md)
- [Cache Store TTL, LRU, Negative-Cache, and Sync/Async Waiter Contract Reference](cache/cache_store_ttl_lru_negative_cache_and_sync_async_waiter_contract_reference.md)
- [Cache Manager Namespace Keying, Cache Entry Dataclass, and Facade Export Contract Reference](cache/cache_manager_namespace_keying_cache_entry_dataclass_and_facade_export_contract_reference.md)
