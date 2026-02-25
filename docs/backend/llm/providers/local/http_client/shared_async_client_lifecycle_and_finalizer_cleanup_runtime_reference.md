---
summary: "Deep reference for LocalLLMProvider shared AsyncClient creation locking, loop-aware finalizer cleanup paths, and provider-factory cache interactions."
read_when:
  - When changing local provider HTTP client ownership or cleanup behavior in `backend/src/llm/providers/local.py`.
  - When investigating stale keep-alive sockets, cleanup warnings about missing event loops, or cache-eviction resource retention.
title: "Shared Async Client Lifecycle and Finalizer Cleanup Runtime Reference"
---

# Shared Async Client Lifecycle and Finalizer Cleanup Runtime Reference

## Canonical Modules

- `backend/src/llm/providers/local.py`
- `backend/src/llm/providers/__init__.py`
- `tests/backend/test_local_llm_providers.py`
- `tests/backend/test_provider_factory_helpers.py`

## Ownership Model

Each `LocalLLMProvider` instance owns:

- `_http_client: Optional[httpx.AsyncClient]`
- `_http_client_loop: Optional[asyncio.AbstractEventLoop]`
- `_http_client_lock: asyncio.Lock`

Creation strategy:

- lazy on first `_get_http_client()` call
- single shared client per provider instance
- all model-list requests reuse same connection pool

Operational reason:

- reduce repeated TCP/TLS setup
- avoid file descriptor churn under frequent local model discovery

## Concurrency Guard on Client Creation

`_get_http_client()` uses double-checked locking:

1. fast path return if client already exists
2. async lock acquisition when `None`
3. second check inside lock
4. instantiate `httpx.AsyncClient(timeout=self.timeout)` once
5. capture current running loop if available

Test anchor:

- `test_get_http_client_creates_single_client_under_concurrency` asserts 20 concurrent calls still create exactly one client object.

## Finalizer Registration and Trigger

Provider constructor registers:

- `weakref.finalize(self, LocalLLMProvider._cleanup_http_client_finalizer, weakref.ref(self))`

When provider becomes unreachable:

- finalizer gets weakref
- fetches provider + existing client
- attempts async close using stored loop info

Important boundary:

- this is best-effort cleanup; behavior varies with event-loop state at GC time

## Finalizer Loop Resolution Paths

Finalizer path order:

1. use `provider._http_client_loop` if present
2. fallback `asyncio.get_event_loop()`
3. if no loop available -> warning log and return

If loop is running:

- schedules `cleanup()` coroutine with `loop.create_task(...)`
- task closes client (`client.aclose()`)
- exceptions logged at debug level

If loop is not running:

- if loop closed -> debug log and return
- else fallback synchronous `loop.run_until_complete(client.aclose())`

If scheduling/running fails:

- debug log only (no raise)

## Explicit Close Path

`_close_http_client()` exists for direct cleanup flow:

- awaits `aclose()`
- nulls `_http_client` and `_http_client_loop`

Current local-provider runtime mainly relies on finalizer for GC-driven cleanup; explicit close can be used by future deterministic shutdown hooks.

## Provider Factory Cache Coupling

Provider instances come from cached factory creation in `providers/__init__.py`.

Cache-key normalization includes:

- normalized provider name aliases
- canonicalized base URLs (trim + trailing slash handling)
- Kimi `/v1` canonicalization

Implication:

- stable normalized config avoids duplicate provider instances and duplicate AsyncClient pools
- config-key drift can multiply provider instances and increase open client count

## Observability and Failure Signals

Warning-level indicator:

- `"Could not clean up HTTP client: no event loop available. Resource leak possible."`

Debug-level indicators:

- failure to schedule cleanup task while loop closing
- exception during `aclose()`
- loop already closed for synchronous fallback path

## Test Coverage Boundary

Covered today:

- singleton client creation under concurrent calls
- provider-factory URL normalization that stabilizes cache reuse

Not directly covered by dedicated tests:

- weakref-finalizer execution branches for running/closed/no-loop states
- synchronous `run_until_complete` fallback branch

Risk note:

- finalizer behavior can regress silently unless validated in integration/runtime profiling.

## Drift Hotspots

1. removing lock or second-check in `_get_http_client` can create multiple clients per provider under concurrency.
2. dropping loop capture can make finalizer cleanup less reliable during shutdown.
3. changing cache-key normalization can inflate provider instances and client pools.
4. converting finalizer failures to hard errors can surface GC-time exceptions unpredictably.
5. removing warning signal for no-loop cleanup failure can hide resource-leak diagnostics.

## Change Checklist

When changing local provider client lifecycle:

1. preserve one-client-per-provider concurrency invariant
2. keep best-effort finalizer behavior non-fatal
3. keep explicit close path consistent (`client` and `loop` reset)
4. confirm provider-factory canonicalization still dedupes equivalent local URLs
5. run local provider tests and spot-check model-list flows for connection reuse
