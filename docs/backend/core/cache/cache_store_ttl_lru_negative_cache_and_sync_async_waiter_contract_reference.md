---
summary: "Deep reference for cache store behavior: ttl expiry checks, lru eviction order, negative caching of exceptions, stats counters, and sync/async single-compute waiter coordination."
read_when:
  - When changing `Cache` get/set/get_or_compute/get_or_compute_async behavior.
  - When debugging cache stampede prevention, error re-raise windows, or eviction/expiration anomalies.
title: "Cache Store TTL, LRU, Negative-Cache, and Sync/Async Waiter Contract Reference"
---

# Cache Store TTL, LRU, Negative-Cache, and Sync/Async Waiter Contract Reference

## Canonical Modules

- `backend/src/core/infrastructure/cache_store.py`
- `backend/src/core/infrastructure/cache_entry.py`
- `tests/backend/test_cache_layer.py`

## Core `Cache` Runtime Model

`Cache` owns:

- ordered dict storage: `OrderedDict[str, CacheEntry]`
- default ttl and error ttl
- optional `max_size` for LRU eviction
- hit/miss counters
- re-entrant lock (`threading.RLock`)
- compute-inflight maps:
  - sync waiters: `Dict[str, threading.Event]`
  - async waiters: `Dict[str, asyncio.Event]`

## Read Path Contract (`get`)

`get(key)`:

1. miss when key absent -> increments misses
2. checks expiry (`time.time() > entry.expires_at`) and drops expired entries
3. moves hit key to end (LRU freshness)
4. increments hits
5. if `entry.is_error` true, re-raises stored exception value
6. otherwise returns cached value

## Write Path and Eviction Contract (`set`)

`set(key, value, ttl)`:

- ttl defaults to `default_ttl` when omitted
- overwriting existing key preserves freshness by delete + reinsert
- when inserting new key and at capacity, evicts oldest key (`popitem(last=False)`)

## Negative Cache Contract (`_store_error_entry`)

On compute failure:

- stores exception object as cache entry
- marks `is_error=True`
- ttl uses `error_ttl`

Consequence:

- immediate repeat callers within error ttl re-raise same exception without recompute.

## Sync Compute Coordination Contract (`get_or_compute`)

For each key:

- first caller creates per-key `threading.Event` and computes
- concurrent callers wait on same event
- compute success caches value and wakes waiters
- compute failure caches error entry, re-raises, then wakes waiters
- event map cleanup is guarded in `finally`

## Async Compute Coordination Contract (`get_or_compute_async`)

Same semantics as sync path, using `asyncio.Event` and await semantics.

Additional loop-safety helper:

- `_new_async_event` ensures an event loop exists before constructing event.

## Maintenance and Stats Contract

- `cleanup_expired()` prunes all expired keys and returns count removed.
- `get_stats()` returns:
  - `size`, `hits`, `misses`, `hit_rate`, `total_requests`
- `clear()` empties store and resets hit/miss counters.

## Test-Backed Matrix

`tests/backend/test_cache_layer.py` verifies:

- ttl expiration behavior via monkeypatched time
- sync single-compute path (`get_or_compute` called once)
- sync waiter fan-in behavior
- async waiter fan-in behavior

## Drift Hotspots

1. Removing key move-to-end on read breaks LRU recency semantics.
2. Dropping error-entry caching can reintroduce thundering-herd failure recomputation.
3. Changing event cleanup/wakeup ordering risks deadlocks or stranded waiters.

## Related Pages

- [Backend Core Cache Docs Hub](README.md)
- [Cache Manager Namespace Keying, Cache Entry Dataclass, and Facade Export Contract Reference](cache_manager_namespace_keying_cache_entry_dataclass_and_facade_export_contract_reference.md)
- [Event Bus and Cache Infrastructure Reference](../event_bus_and_cache_infrastructure_reference.md)
