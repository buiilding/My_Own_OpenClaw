---
summary: "Dependency-injector wiring and startup lifecycle reference for backend container facade, API binder, session runtime coordinator, and phased bootstrap rollback behavior."
read_when:
  - When changing backend dependency wiring, lazy provider overrides, or config update behavior.
  - When debugging startup races, session-manager creation, or handler-registry initialization failures.
title: "Container DI and Initialization Lifecycle Reference"
---

# Container DI and Initialization Lifecycle Reference

## Canonical Modules

- `backend/src/core/container/application.py`
- `backend/src/core/container/facade.py`
- `backend/src/core/container/core_container.py`
- `backend/src/core/container/tool_container.py`
- `backend/src/core/container/memory_container.py`
- `backend/src/core/container/api_container.py`
- `backend/src/core/container/api_runtime.py`
- `backend/src/core/container/session_runtime.py`
- `backend/src/core/container/session_factory.py`
- `backend/src/core/container/config_updater.py`
- `backend/src/core/container/initializer.py`
- `backend/src/core/bootstrap/coordinator.py`
- `backend/src/core/bootstrap/handler_initializer.py`
- `backend/src/core/container/incoming_routing.py`

## Container Composition Model

`ApplicationContainer` composes three domain containers:

- `core`: config, config service, event bus, cache manager, LLM client factory, TTS, vision, OCR, model service, metrics
- `tools`: agent factory, tool registry/context factory pair, tool orchestrator factory
- `memory`: sentence-transformer embedder provider

Facade entrypoint is `Container`:

- wraps `ApplicationContainer`
- preserves backward-compatible `Container.*` accessors used by bootstrap/runtime code
- delegates orchestration to specialized helpers (`ContainerInitializer`, `ContainerConfigUpdater`, `SessionRuntimeCoordinator`, `ApiRuntimeBinder`)

## Startup Sequence (Coordinator + Container)

`InitializationCoordinator.initialize()` executes serialized phases:

1. configuration phase
2. container phase (`Container(config_manager=...)`, then `await container.initialize()`)
3. services phase (PromptManager init, session manager subscription, handler initializer)
4. final state validation

Concurrency guards:

- coordinator uses thread-safe lazy creation for `asyncio.Lock`
- second call after initialization raises `RuntimeError`
- race during concurrent calls is guarded by double-check after lock acquisition

Rollback behavior on failure:

- services rollback: unsubscribe session manager from config service
- container rollback: force-clear global API dependency container via `set_container(..., force=True)`
- resets coordinator state (`_initialized_phases`, references, `_is_initialized`)

## API Container and Routing Bindings

`ApiContainer` owns singleton providers for handlers and transport helpers:

- query, stop-query, rehydrate, tool-result, wakeword
- list-models, load-settings, update-settings
- `TTSManager`, `ResponseFormatter`, `WakewordService`

`handler_registry` is built by `_create_handler_registry()` and `build_handler_bindings()`.

Route table lives in `incoming_routing.py` (`INCOMING_ROUTES`):

- strict mapping between incoming message `type` and handler key
- includes both `tool-result` and `tool-bundle-result` routed to `tool_result_handler`

Validation safeguards:

- duplicate route-type detection
- schema drift detection against discriminated `IncomingMessage` union
- missing handler key detection during binding assembly

## Lazy Runtime Coordinators

### SessionRuntimeCoordinator

Responsibilities:

- lazy-create `SessionManager` with thread-lock double-check pattern
- lazy-create and cache `AgentSessionFactory`
- invalidate cached session factory after config updates

Session factory dependencies:

- config
- tool registry
- OCR service
- llm client factory (session-config aware)
- tool orchestrator factory
- event bus
- metrics service

`create_agent_session(...)` supports per-session config override without mutating global container config.

### ApiRuntimeBinder

Responsibilities:

- lazy-create `ApiContainer`
- sync runtime overrides (`config`, `config_service`, `model_service`, `session_manager`)
- refresh overrides after config mutation when API container already exists

## Async Component Initialization (`ContainerInitializer`)

Initializer order:

1. config service init (`ConfigurationService.initialize()`)
2. optional vision preload (policy gated)
3. optional OCR preload (policy gated)
4. optional embedder preload
5. inject vision/OCR instances into tool context factory

Policy source:

- `ToolPolicy.from_config(container.config)`
- disables expensive startup paths when relevant dev-tool selection gates are off

Behavior details:

- OCR skip path sets `ocr_service.enabled = False` when available
- failures are logged; startup continues unless upstream coordinator phase raises

## Runtime Config Update Path

`Container.update_config(...)` delegates to `ContainerConfigUpdater.update_config(...)`.

Update steps:

1. update via `ConfigurationService.update_config()` when available (publishes notifications)
2. refresh facade runtime references (`refresh_runtime_config`)
3. recreate `ModelService` provider override with new config singleton
4. recreate embedder provider when memory enabled; otherwise set `embedder=None`
5. invalidate cached session factory so new sessions resolve latest config/dependencies
6. refresh API runtime overrides

Key boundary:

- existing sessions continue with their current session-scoped config unless explicitly recreated
- new sessions inherit updated container config

## Debug Checklist

If handlers appear missing or wrong:

1. verify `incoming_routing.INCOMING_ROUTES` includes new message type
2. verify matching handler key exists in `ApiContainer` provider map
3. run/inspect route validation errors for missing/extra types

If startup intermittently fails under concurrency:

1. confirm single coordinator instance usage
2. confirm no duplicate external `set_container(...)` calls
3. inspect rollback logs for partial phase completion

If config changes do not affect new sessions:

1. verify `Container.update_config(...)` path is used (not direct config mutation)
2. verify `invalidate_session_factory()` executed
3. verify `SessionRuntimeCoordinator` created a new factory after update

If model list/config responses are stale:

1. confirm `ApiRuntimeBinder.refresh_overrides()` was called after config refresh
2. confirm `model_service` provider override reset/recreated successfully
