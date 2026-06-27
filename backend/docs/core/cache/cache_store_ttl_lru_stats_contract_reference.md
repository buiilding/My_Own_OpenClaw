---
summary: "Deep reference for cache store behavior: ttl expiry checks, lru eviction order, direct get/set/delete operations, cleanup, and stats counters."
read_when:
  - When changing `Cache` get/set/delete/cleanup/stat behavior.
  - When debugging cache hit/miss behavior, ttl expiry, or eviction anomalies.
title: "Cache Store TTL, LRU, and Stats Contract Reference"
---

# Cache Store TTL, LRU, and Stats Contract Reference

## Canonical Modules

- `backend/src/core/infrastructure/cache_store.py`
- `backend/src/core/infrastructure/cache_entry.py`
- `tests/backend/test_cache_layer.py`

## Core `Cache` Runtime Model

`Cache` owns:

- ordered dict storage: `OrderedDict[str, CacheEntry]`
- default ttl
- optional `max_size` for LRU eviction
- hit/miss counters
- re-entrant lock (`threading.RLock`)

## Read Path Contract (`get`)

`get(key)`:

1. miss when key absent -> increments misses
2. checks expiry (`time.time() > entry.expires_at`) and drops expired entries
3. moves hit key to end (LRU freshness)
4. increments hits
5. otherwise returns cached value

## Write Path and Eviction Contract (`set`)

`set(key, value, ttl)`:

- ttl defaults to `default_ttl` when omitted
- overwriting existing key preserves freshness by delete + reinsert
- when inserting new key and at capacity, evicts oldest key (`popitem(last=False)`)

## Maintenance and Stats Contract

- `delete(key)` removes one key and returns whether it existed.
- `cleanup_expired()` prunes all expired keys and returns count removed.
- `get_stats()` returns:
  - `size`, `hits`, `misses`, `hit_rate`, `total_requests`
- `clear()` empties store and resets hit/miss counters.

## Test-Backed Matrix

`tests/backend/test_cache_layer.py` verifies:

- ttl expiration behavior via monkeypatched time
- `None` values count as cache hits when present
- LRU eviction preserves recently read keys
- delete and cleanup behavior
- stats counters

## Drift Hotspots

1. Removing key move-to-end on read breaks LRU recency semantics.
2. Treating cached `None` as a miss breaks callers that cache absence-like values intentionally.
3. Changing cleanup/stat counter behavior can hide cache churn in diagnostics.

## Related Pages

- [Backend Core Cache Docs Hub](README.md)
- [Cache Manager Namespace Keying and Cache Entry Singleton Reference](cache_manager_namespace_keying_cache_entry_singleton_reference.md)
- [Event Bus and Cache Infrastructure Reference](../event_bus_and_cache_infrastructure_reference.md)
