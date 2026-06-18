---
summary: "Backend startup phases, dependency injection containers, runtime config policy, and per-session config behavior."
read_when:
  - When changing startup, config loading, or container wiring.
  - When debugging config drift between global app state and per-user sessions.
title: "Bootstrap and Config"
---

# Bootstrap and Config

## Startup Path

Primary entrypoint:

- `backend/src/main.py`

Startup sequence:

1. FastAPI app is created via `api/app_assembly.py:create_api_app`.
2. `lifespan` creates `InitializationCoordinator`.
3. `InitializationCoordinator.initialize()` runs phased startup.
4. Container is set in API deps (`api/deps.py:set_container`).
5. On shutdown, container reference is cleared and sessions are cleaned via manager paths.

## Initialization Phases (`core/bootstrap/coordinator.py`)

1. Configuration phase
- Uses `ConfigManager` (global singleton or injected instance).
- Loads `AppConfig` lazily once.

2. Container phase
- Constructs `core/container/facade.py:Container`.
- Facade wraps `ApplicationContainer` and DI providers.
- Container is registered on `app.state.container` for API dependency resolution.

3. Services phase
- Initializes prompt manager.
- Creates `SessionManager` lazily through container runtime coordinator.
- Subscribes `SessionManager` to config-change notifications.
- Initializes message handlers via `HandlerInitializer`.

4. Validation phase
- Confirms required runtime services are present (config service, tool registry, etc.).

Concurrency contract:

- `initialize()` is a one-shot startup path.
- A call made after successful initialization raises `RuntimeError`.
- A call made while another thread or event loop is actively initializing raises `RuntimeError` immediately.

## Config Model and Runtime Policy

Core model:

- `core/config/models.py:AppConfig`

Notable config field groups:

- Provider selection: `model_mode`, `model_provider`, `selected_model_id`, provider blocks
- Runtime limits: parser size/time constraints, websocket limits, artifact size limits
- Agent policy: `interaction_mode` plus history-compaction controls
- Vision/OCR: `vision_model_name`

Runtime normalization (`core/config/runtime.py` via loader helpers):

- Enforces runtime defaults and API-key resolution for chosen provider
- Forces runtime `tts_enabled` policy
- Resolves default TTS model path per platform

Backend code reads these fields from `AppConfig` or focused owner modules
directly. The unused config-domain view module has been removed so there is no
parallel projection layer to keep in sync with `AppConfig`.

## Config Loading and Updates

- Initial load: `core/config/loader.py:load_settings_from_file`
- Runtime access: `ConfigManager.get_config()`
- Runtime in-memory update: `ConfigManager.update_config()`
- Reload from module: `ConfigManager.reload_config()`

Important behavior:

- Config is immutable (`frozen=True` Pydantic model), updates are model copies.
- Updates are runtime-only unless source file (`app_config.py`) changes.

## DI Container Composition

Main composition (`core/container/application.py`):

- `CoreContainer`: config, llm client, TTS, event bus, vision/OCR, config service
- `ToolContainer`: tool registry, context factory, tool orchestrator, agent factory
- `MemoryContainer`: embedder provider wiring
- `ApiContainer` (bound via runtime binder): handler registry + handler instances

Facade (`core/container/facade.py`) exposes bootstrap/runtime accessors while delegating to split runtime coordinators.

Session LLM client creation:

- default container-created sessions use the DI `llm_client` provider with no per-session config argument
- explicit session config overrides use the config-aware LLM factory path
- this keeps DI/test/simulation LLM provider overrides reachable for normal default sessions

## Session Configuration Behavior

Session manager (`agent/session/manager.py`):

- Holds global config plus active sessions map by `user_id`.
- Uses per-user async locks to prevent duplicate concurrent session creation.
- Builds per-session runtime config via shared runtime assembly policy.
- Supports runtime updates for client settings patch fields.

Query task tracking:

- Tracks active query task per user and turn metadata.
- Supports cancellation through `stop-query` flow.
