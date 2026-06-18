---
summary: "Workflow for changing backend AppConfig fields, runtime normalization, container DI wiring, provider rebinding, and live session config propagation."
read_when:
  - When adding, removing, renaming, or debugging backend AppConfig fields, provider defaults, env-var resolution, runtime config policies, or client update-settings keys.
  - When changing container initialization, DI providers, lazy session factory creation, model service rebinding, OCR/vision/embedding router rebinding, or API runtime overrides.
  - When a settings update appears to apply in the UI but new sessions, active sessions, model lists, prompts, tools, or inference providers still use stale config.
title: "Backend Config and Container Change Workflow"
---

# Backend Config and Container Change Workflow

Use this workflow when a backend config change needs to survive startup, runtime updates, provider selection, model-list reads, active session rewiring, and new session creation. This page is intentionally implementation-facing: it tells an agent where to edit, which boundary owns the behavior, and which tests prove the update reached the correct runtime.

Backend config has two shapes:

- global runtime config loaded from `backend/src/core/config/app_config.py` through `ConfigManager`
- session-scoped config assembled from client `update-settings` patches and applied to `AgentSession`

Do not make renderer settings, sidecar env, or Electron endpoint code mutate backend internals directly. They should send allowed values through the documented config/update boundary and let backend config assembly rebuild the runtime objects.

## Fast Owner Map

| Change or symptom | First owner | Code roots | Start docs | Focused tests |
| --- | --- | --- | --- | --- |
| add an `AppConfig` field, default, type, or nested config model | backend config models | `backend/src/core/config/models.py`, `backend/src/core/config/app_config.py` | [Config Fields and Runtime Policy](config_fields_and_runtime_policy.md), [Runtime Configuration Matrix](../../operations/runtime_configuration_matrix.md) | `tests/backend/test_config_models.py`, `tests/backend/test_config_loader.py` |
| add env-var lookup or provider API-key resolution | backend config loader | `backend/src/core/config/loader.py`, `backend/src/core/config/runtime.py`, provider config models | [Provider Credentials](../../providers/credentials.md), [Credentials and Tokens Matrix](../../security/credentials_and_tokens_matrix.md) | `tests/backend/test_config_loader.py`, provider-specific tests |
| add a client settings patch key | backend validation plus session config | `backend/src/core/validation/validators.py`, `backend/src/core/validation/settings_update_rules.py`, `backend/src/agent/session/session_config_service.py`, `backend/src/api/handlers/settings.py` | [Input Validation and Client Settings Patch Guard Reference](../core/validation/input_validation_and_frontend_patch_guard_reference.md), [Settings Sync Change Workflow](../../frontend/runtime/settings_sync_change_workflow.md) | `tests/backend/test_settings_update_rules.py`, `tests/backend/test_session_config_service.py`, `tests/backend/test_settings_payload_builder.py` |
| settings update applies but active session still uses old provider/model/tool policy | session runtime rewire | `backend/src/agent/session/config_runtime.py`, `backend/src/agent/session/session.py`, `backend/src/agent/session/manager.py` | [Session Runtime and Config Rewire Reference](../agent/session_runtime_and_config_rewire_reference.md) | `tests/backend/test_session_config_service.py`, `tests/backend/test_session_llm_factory.py` |
| new sessions use stale config after container update | container config updater and lazy session factory | `backend/src/core/container/config_updater.py`, `backend/src/core/container/session_runtime.py`, `backend/src/core/container/session_factory.py` | [Container DI and Initialization Lifecycle Reference](../bootstrap/container_di_and_init_lifecycle_reference.md) | `tests/backend/test_container_config_updater.py`, `tests/backend/test_session_manager.py` |
| model list, provider availability, or selected provider metadata is stale | model service/provider factory rebinding | `backend/src/core/container/config_updater.py`, `backend/src/llm/models`, `backend/src/llm/providers/factory.py` | [Provider Change Workflow](../../providers/provider_change_workflow.md), [Model Catalog Change Workflow](../../providers/model_catalog_change_workflow.md) | `tests/backend/test_models_config.py`, `tests/backend/test_inference_factory_selection.py`, provider tests |
| OCR, vision, or embedding route still uses old backend/timeout/circuit settings | inference provider/router rebinding | `backend/src/core/container/config_updater.py`, `backend/src/core/container/factories.py`, `backend/src/services/screen_grounding`, embedding services | [Backend Service Change Workflow](../services/backend_service_change_workflow.md), [Inference Providers](../../providers/inference.md) | `tests/backend/test_container_config_updater.py`, `tests/backend/test_vision_provider_loader.py`, `tests/backend/test_embeddings_provider.py`, `tests/backend/test_provider_health_policy.py` |
| backend startup order, preload policy, or DI singleton changes | container bootstrap | `backend/src/core/container/initializer.py`, `backend/src/core/container/application.py`, `backend/src/core/container/facade.py`, `backend/src/core/bootstrap/*` | [Backend Bootstrap Docs Hub](../bootstrap/README.md), [Container DI and Initialization Lifecycle Reference](../bootstrap/container_di_and_init_lifecycle_reference.md) | `tests/backend/test_container_initializer_dev_selection.py`, `tests/backend/test_api_container_source.py` |
| route handler receives stale config/service dependencies after runtime update | API runtime binder and handler providers | `backend/src/core/container/api_runtime.py`, `backend/src/core/container/api_container.py`, `backend/src/core/container/incoming_routing.py` | [API Route Change Workflow](../api/api_route_change_workflow.md) | API handler/route tests plus config updater tests |

## Boundary Rules

- `AppConfig` is immutable. Update by creating a new model instance or `model_copy(...)`, then push it through `ConfigManager`, `ConfigurationService`, `Container.update_config(...)`, or session config services.
- `backend/src/core/config/models.py` owns field types, nested config models, defaults, aliases, and strict value domains.
- `backend/src/core/config/app_config.py` owns checked-in backend defaults. Do not put real credentials there.
- `backend/src/core/config/loader.py` owns environment and frontend credential override resolution, including provider aliases and OAuth-derived OpenAI Codex tokens.
- `backend/src/core/config/runtime.py` owns runtime normalization policies that should apply both at startup and after client settings patches.
- `backend/src/core/validation/*` owns what clients are allowed to patch. Never widen `update-settings` just to make a UI control easy.
- `ContainerConfigUpdater` owns global dependency rebinding after a backend config update.
- `SessionConfigRuntime` owns active session dependency rewiring after a session-scoped config update.
- Existing sessions do not automatically inherit every global container update. Update the session explicitly if the active query/session must move.
- New sessions should inherit the updated container config after `invalidate_session_factory()` runs.
- Secrets stay in environment variables or approved user-entered credential surfaces. Logs, tests, docs, fixtures, and snapshots must use placeholder names only.

## Runtime Paths

### Startup Load Path

1. `ConfigManager.load_config()` calls `load_settings_from_file()`.
2. `backend/src/core/config/app_config.py` provides `APP_CONFIG`.
3. `build_runtime_config(...)` calls `assemble_runtime_config(...)`.
4. Runtime policies fill normalized values such as TTS defaults and selected provider API key.
5. `Container` receives the runtime `AppConfig`.
6. `ContainerInitializer` initializes config service, optional vision preload, optional OCR preload, and embedder preload according to `ToolPolicy.from_config(...)`.
7. `ApiRuntimeBinder` and `SessionRuntimeCoordinator` lazily create API handlers and session managers with the current container config.

### Global Container Update Path

Use this path when backend-owned config changes at runtime.

1. Call `Container.update_config(new_config)`.
2. `ContainerConfigUpdater.update_config(...)` updates `ConfigurationService`.
3. The DI `core.config` provider is rebound to the updated `AppConfig`, so
   future DI-backed factories such as LLM clients and tool orchestrators resolve
   the same config as the facade.
4. `container.refresh_runtime_config(updated_config)` refreshes facade references.
5. `ModelService` provider override is reset and recreated with the updated config.
6. Embedding provider/router is recreated or cleared depending on `memory_enabled`.
7. OCR and vision providers are recreated, routers get current circuit-breaker settings, and `context_factory` receives fresh services.
8. Cached `AgentSessionFactory` is invalidated so future sessions resolve current dependencies.
9. API runtime overrides refresh if the API container already exists; cached API
   handler/registry singletons are reset before overrides are re-synced so the
   next lookup captures current runtime dependencies.

### Session Settings Update Path

Use this path when the renderer sends a user-facing settings change.

1. Renderer sends `update-settings` with only allowlisted keys.
2. `ClientSettingsPatch` and settings update rules drop or reject unsafe fields.
3. `UpdateSettingsHandler` forwards normalized patch data to `SessionManager.update_session_config(...)`.
4. `SessionConfigService` merges the patch into session-scoped config and reassembles runtime policy.
5. `SessionConfigRuntime.apply(...)` rebuilds the session LLM client, executor references, prompt constructor, and conversation context.
6. Tool visibility, provider selection, prompt metadata, and active session behavior should now match the patched config.

## Add or Change an AppConfig Field

1. Add the field in `backend/src/core/config/models.py` with the narrowest useful type.
2. Add or update the checked-in default in `backend/src/core/config/app_config.py` only when the default belongs in source.
3. If the value comes from env, add env-var lookup in `loader.py` or the domain-specific loader. Do not read env vars from random service code.
4. If the value needs normalization, add it to `runtime.py` so startup and session updates share behavior.
5. If a client-visible setting controls it, add the allowlist and validation rule in `backend/src/core/validation/*`, then update renderer settings docs/tests separately.
6. If a service, provider, model list, or router stores the config at construction time, update `ContainerConfigUpdater` so runtime updates rebuild that dependency.
7. If active sessions need to change immediately, update `SessionConfigRuntime` and focused session tests.
8. Update config docs:
   - [Config Fields and Runtime Policy](config_fields_and_runtime_policy.md)
   - [Runtime Configuration Matrix](../../operations/runtime_configuration_matrix.md)
   - [Configuration Reference](../../reference/configuration_reference.md)
   - any provider, service, security, operations, or renderer settings page that exposes the field

## Add or Change a Provider Config

Provider config changes usually touch config, model catalog, provider factory, and settings.

1. Add nested provider config in `LLMProviders` or the relevant inference config model.
2. Add env-var metadata, base URL defaults, timeout defaults, and provider aliases in one owner layer.
3. Wire API-key resolution in `load_api_key_for_provider(...)` only if the provider uses backend env/user credential paths.
4. Wire runtime selection in `backend/src/llm/providers/factory.py` or inference factory code.
5. Add model catalog metadata in `backend/src/llm/models/models_config.py` when the provider exposes user-selectable models.
6. Rebind constructed services through `ContainerConfigUpdater` if they cache provider config.
7. Update frontend model/settings surfaces only if the user should see or select the provider.
8. Validate with provider/config tests and [Provider Change Workflow](../../providers/provider_change_workflow.md).

## Change Container Initialization or DI Wiring

Container wiring changes are higher risk because they alter startup, API handlers, sessions, and tests that monkeypatch provider surfaces.

1. Read [Container DI and Initialization Lifecycle Reference](../bootstrap/container_di_and_init_lifecycle_reference.md).
2. Decide whether the dependency belongs in:
   - `ApplicationContainer` composition
   - `core_container.py`
   - `tool_container.py`
   - `memory_container.py`
   - `api_container.py`
   - facade helpers such as `api_runtime.py`, `session_runtime.py`, or `config_updater.py`
3. Prefer adding a narrow provider/factory over passing raw config through unrelated services.
4. Add startup preloading only when first-use latency justifies it and the policy gate is explicit.
5. Add disabled-path behavior for optional heavy dependencies so development, CI, and hosted modes can start without local model stacks.
6. If the dependency is cached by a factory, add invalidation behavior on config update.
7. If API handlers need it, update `ApiContainer`, handler bindings, and route validation tests.
8. If sessions need it, update `AgentSessionFactory`, `SessionRuntimeCoordinator`, and session tests.

## Debug Checklist

### Config Value Is Missing at Startup

- Confirm the default exists in `models.py` and `app_config.py`.
- Confirm `load_settings_from_file()` did not fall back to `AppConfig()` after an import error.
- Confirm env-var lookup happens before `build_runtime_config(...)` returns.
- Confirm the field is included in the docs and tests that assert model defaults.

### Frontend Setting Is Ignored

- Confirm the key is allowlisted in backend frontend-patch validation.
- Confirm renderer persistence is allowed to send the key.
- Confirm `UpdateSettingsHandler` passes the field through.
- Confirm `SessionManager.update_session_config(...)` writes session-scoped config, not only global config.
- Confirm the active `AgentSession` gets `SessionConfigRuntime.apply(...)`.

### Provider or Model List Is Stale

- Confirm `ContainerConfigUpdater` reset and recreated `ModelService`.
- Confirm provider aliases match across `LLMProviders`, API-key override resolution, model catalog metadata, and provider factory selection.
- Confirm the API runtime binder refreshed overrides after config mutation.
- Confirm the renderer model picker is not showing cached renderer state from before backend ACK.

### New Sessions Use Old Dependencies

- Confirm config update went through `Container.update_config(...)`.
- Confirm `ContainerConfigUpdater` rebound `core.config` before future DI-backed
  factories are resolved.
- Confirm `invalidate_session_factory()` ran.
- Confirm `SessionRuntimeCoordinator` created a new `AgentSessionFactory`.
- Confirm the stale dependency is not a separate singleton outside the container update path.

### Active Session Uses Old LLM Client or Prompt Policy

- Confirm the change was session-scoped, not only container-global.
- Confirm `SessionConfigRuntime.apply(...)` recreated `session.llm_client`.
- Confirm executor and interaction-loop references point at the new client.
- Confirm `PromptConstructor` was rebuilt and repo instruction messages/workspace context were preserved.

### OCR, Vision, or Embeddings Ignore New Config

- Confirm `ContainerConfigUpdater` reinitialized the provider/router.
- Confirm router circuit-breaker thresholds were reconfigured.
- Confirm `context_factory.set_ocr_router(...)` or `set_vision_service(...)` ran when tool preparation depends on the service.
- Confirm provider-health tests cover unavailable or disabled modes.

## Validation Matrix

| Changed surface | Minimum checks |
| --- | --- |
| config model/default only | `./scripts/python-in-env backend pytest tests/backend/test_config_models.py tests/backend/test_config_loader.py` |
| config manager/service/subscriptions | `./scripts/python-in-env backend pytest tests/backend/test_config_manager.py tests/backend/test_config_service.py tests/backend/test_config_subscriptions.py` |
| client settings patch contract | `./scripts/python-in-env backend pytest tests/backend/test_settings_update_rules.py tests/backend/test_session_config_service.py tests/backend/test_settings_payload_builder.py` plus focused frontend settings tests |
| container update/rebinding | `./scripts/python-in-env backend pytest tests/backend/test_container_config_updater.py tests/backend/test_api_container_source.py` |
| provider/model config | provider-specific backend tests plus `tests/backend/test_models_config.py` and `tests/backend/test_provider_factory_helpers.py` |
| OCR/vision/embedding config | focused provider/router tests and relevant service tests |
| docs-only config workflow | `bin/windie docs list`, `git diff --check`, focused Markdown link check |

## Review Checklist

- The config field has one owner and one normalization point.
- Runtime updates rebuild every dependency that caches the changed config.
- Active-session behavior is explicit: either unchanged by design or rewired through session runtime.
- New-session behavior is explicit and covered by session factory invalidation tests when needed.
- Provider aliases are consistent across config, credentials, factory selection, model catalog, docs, and renderer settings.
- Optional heavy services have disabled or unavailable paths that do not break backend startup.
- No credentials, access tokens, or machine-specific paths were added to docs/tests/fixtures.
- Docs and tests mention whether the behavior applies to startup config, global runtime config, session-scoped config, or renderer-owned settings.

## Related Docs

- [Backend Config Docs Hub](README.md)
- [Config Fields and Runtime Policy](config_fields_and_runtime_policy.md)
- [Backend Bootstrap Docs Hub](../bootstrap/README.md)
- [Container DI and Initialization Lifecycle Reference](../bootstrap/container_di_and_init_lifecycle_reference.md)
- [Configuration Change Workflow](../../operations/configuration_change_workflow.md)
- [Runtime Configuration Matrix](../../operations/runtime_configuration_matrix.md)
- [Configuration Reference](../../reference/configuration_reference.md)
- [Provider Change Workflow](../../providers/provider_change_workflow.md)
- [Settings Sync Change Workflow](../../frontend/runtime/settings_sync_change_workflow.md)
