---
summary: "Deep reference for vendored browser_use package internals used by sidecar browser runtime: package bootstrap behavior, lazy import resolution, env/config loading, logging pipeline, optional lmnr observability integration, and utility helpers."
read_when:
  - When changing `tools/browser/browser_use` package bootstrap behavior, especially logging setup and lazy imports.
  - When debugging browser_use runtime issues such as noisy loop-close subprocess errors, unexpected logging output, config migration behavior, or observability decorator behavior.
title: "Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference"
---

# Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference

This page covers vendored Browser Use internals in:

- `frontend/src/main/python/tools/browser/browser_use/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/_lazy_import.py`
- `frontend/src/main/python/tools/browser/browser_use/config.py`
- `frontend/src/main/python/tools/browser/browser_use/logging_config.py`
- `frontend/src/main/python/tools/browser/browser_use/observability.py`
- `frontend/src/main/python/tools/browser/browser_use/utils.py`

## Package Bootstrap (`__init__.py`)

Bootstrap behavior has three major parts:

1. optional logging setup
2. subprocess transport destructor monkeypatch
3. lazy import registry for heavy Browser Use modules

### Logging bootstrap gate

- env `BROWSER_USE_SETUP_LOGGING` controls automatic setup
- default behavior is enabled
- when disabled, package uses plain `logging.getLogger('browser_use')`

When enabled:

- reads `CONFIG` from `browser_use.config`
- passes optional debug/info file paths into `setup_logging(...)`

### Event-loop-close subprocess noise patch

`BaseSubprocessTransport.__del__` is patched to ignore `RuntimeError: Event loop is closed` in destructor cleanup paths.

Intent:

- reduce noisy, misleading teardown errors during shutdown

### Lazy symbol exports

`_LAZY_IMPORTS` maps public symbols (`Agent`, `BrowserSession`, `Chat*`, etc.) to module paths.

`__getattr__` delegates to `resolve_lazy_attr(...)` for on-demand import and optional caching in `globals()`.

## Lazy Import Helper Contract (`_lazy_import.py`)

`import_lazy(...)`:

- imports module and optional attribute
- wraps ImportError with standardized message including symbol/module path

`resolve_lazy_attr(...)`:

- validates symbol exists in lazy map
- resolves symbol via `import_lazy`
- optionally caches resolved symbol in mutable module cache
- raises `AttributeError` when symbol missing from lazy map

## Config Layer (`config.py`)

Configuration stack includes:

- Docker detection heuristics (`is_running_in_docker`)
- old lazy env-property accessor class (`OldConfig`)
- flat env model via `pydantic_settings` (`FlatEnvConfig`)
- JSON config migration model (`DBStyleConfigJSON` and entry types)
- compatibility façade (`Config`) that proxies to fresh env/config reads

### Key behavior highlights

- env values are re-read on each `Config` attribute access (compatibility-first behavior)
- default config path resolves from:
  - `BROWSER_USE_CONFIG_PATH` or
  - `BROWSER_USE_CONFIG_DIR` or
  - `XDG_CONFIG_HOME/browseruse/config.json`
- missing/old/invalid config JSON triggers fresh DB-style config creation
- migration path overwrites old format with new default structured config

### Docker/runtime heuristics

`is_running_in_docker()` uses multiple fallback signals:

- `/.dockerenv`
- `/proc/1/cgroup` content
- PID 1 commandline heuristics via psutil
- low process-count heuristic

## Logging Pipeline (`logging_config.py`)

`setup_logging(...)` supports:

- dynamic custom RESULT log level
- console stream override
- optional debug/info file handlers
- level mapping based on `BROWSER_USE_LOGGING_LEVEL`
- separate browser_use and bubus logger handling
- CDP logger setup via `cdp_use.logging.setup_cdp_logging` when available
- fallback manual logger configuration when cdp_use helper import unavailable

Additional behavior:

- third-party loggers are aggressively silenced to ERROR
- optional FIFO pipe handlers support session-scoped log streaming (`setup_log_pipes`)

## Observability Layer (`observability.py`)

Observability decorator behavior is optional and resilient:

- attempts lmnr import (`from lmnr import observe`)
- if unavailable, decorators degrade to no-op wrappers with compatible signatures

Decorators:

- `observe(...)`: always attempts trace path when lmnr available
- `observe_debug(...)`: traces only when debug mode active (`LMNR_LOGGING_LEVEL=debug`)

Status helpers:

- `is_lmnr_available()`
- `is_debug_mode()`
- `get_observability_status()`

Verbose diagnostics:

- `BROWSER_USE_VERBOSE_OBSERVABILITY=true` enables debug logging about lmnr availability detection

## Utility Surface (`utils.py`)

Utility module includes mixed runtime helpers used across Browser Use internals.

Notable groups:

- signal handling wrapper class (`SignalHandler`) for Ctrl+C/SIGTERM pause/exit behavior
- execution timing decorators (`time_execution_sync/async`) with >0.25s logging threshold
- domain/URL pattern safety helpers (`match_url_with_domain_pattern`, `is_unsafe_pattern`, `is_new_tab_page`)
- singleton/task/error handling helpers
- package/version/git metadata helpers
- path/url pretty logging helpers

Notable safety behavior in URL matcher:

- defaults to `https` when scheme omitted
- rejects unsafe wildcard patterns (for example multiple wildcard segments or wildcard TLD)

## Sidecar Integration Boundary

These modules are vendored Browser Use internals loaded through WindieOS browser runtime provider.

Important integration fact:

- backend and sidecar browser action schema/adapter layers are WindieOS-owned
- browser_use package internals here mainly affect runtime bootstrap, logging, and Browser Use internal behavior after adapter dispatch

## Related Docs

- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](../browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Detailed Browser Action Compatibility and Runtime Reference](../../browser_action_compatibility_and_runtime_reference.md)
