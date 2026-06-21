---
summary: "Workflow for WindieOS configuration changes across backend AppConfig, Electron endpoint/defaults, renderer settings persistence, local-runtime env, provider credentials, VM variables, and packaging."
read_when:
  - When adding, removing, renaming, or debugging a runtime config field,
    environment variable, frontend setting, endpoint default, provider
    credential, or local-runtime implementation variable.
  - When deciding whether a setting belongs in backend config, Electron main, renderer storage, local-runtime startup env, release CI, or docs only.
  - When a setting works in source mode but fails in packaged app or hosted backend mode.
title: "Configuration Change Workflow"
---

# Configuration Change Workflow

Use this workflow before changing config. WindieOS has multiple config owners, and broad propagation creates bugs: stale settings, leaked secrets, packaged/runtime drift, and first-query races.

The core rule is: put the setting where it can be enforced, then propagate only normalized values that another runtime truly needs.

## Fast Owner Map

| Request or symptom | First owner | Source roots | Start docs | Tests |
| --- | --- | --- | --- | --- |
| add backend policy field, timeout, provider mode, inference route, or limit | backend `AppConfig` | `backend/src/core/config`, `backend/src/core/container/config_updater.py` | [Runtime Configuration Matrix](runtime_configuration_matrix.md), [Backend Config Docs Hub](../backend/config/README.md) | `tests/backend/test_config_models.py`, `tests/backend/test_config_loader.py`, `tests/backend/test_config_manager.py`, `tests/backend/test_config_service.py` |
| make settings update rewire sessions correctly | backend session config service | `backend/src/agent/session/config_runtime.py`, `backend/src/agent/session/session_config_service.py`, `backend/src/api/handlers/settings.py` | [Backend Session Runtime and Config Rewire Reference](../backend/agent/session_runtime_and_config_rewire_reference.md) | `tests/backend/test_session_config_service.py`, `tests/backend/test_settings_update_rules.py`, `tests/backend/test_settings_payload_builder.py` |
| change model picker or renderer settings toggle | renderer config/settings | `frontend/src/renderer/features/settings`, `frontend/src/renderer/app/providers`, `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`, `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js` | [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md), [Renderer Config Sync Lifecycle](../frontend/runtime/config_sync_and_settings_lifecycle_reference.md) | `tests/frontend/SettingsSection.test.jsx`, `tests/frontend/configFilter.test.js`, `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx` |
| first query ignores latest settings | Electron main settings ACK gate | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_settings_sync.cjs`, `frontend/src/main/ipc/ipc_desktop_ui_config.cjs` | [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md) | `tests/frontend/IpcSettingsSync.test.cjs`, `tests/frontend/AppStatusProvider.test.tsx` |
| endpoint defaults or hosted/local URL selection changed | Electron endpoint resolver and local-runtime env propagation | `frontend/src/main/app/backend_endpoints.cjs`, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/python/windie/_backend_config.py` | [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md), [Backend Endpoint Setup](../install/local_backend_and_endpoint_setup.md) | `tests/frontend/BackendEndpoints.test.cjs`, `tests/sidecar/test_backend_config.py` |
| provider key, OAuth, or secret behavior changed | env var loader and credential boundary | `backend/src/core/config/loader.py`, `backend/src/core/config/models.py`, provider runtime files, renderer provider settings only for user-entered overrides | [Credentials and Tokens Matrix](../security/credentials_and_tokens_matrix.md), [Provider Credentials](../providers/credentials.md) | backend config/provider tests plus frontend provider settings tests |
| local-runtime implementation variable changed | SDK local-runtime launch env and local-runtime Python config reader | `frontend/src/main/sidecar/local_runtime_launch_options.cjs`, `frontend/src/main/python/core`, `frontend/src/main/python/tools` | [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md), [Local Tool Channels](../channels/sidecar_and_tool_channels.md) | `tests/sidecar/test_backend_config.py`, focused local-runtime Python tool tests |
| VM worker or runs API variable changed | backend runs API and Electron VM worker runtime | `backend/src/api/routes/runs`, `backend/src/services/vm_run_control.py`, `frontend/src/main/app/vm_worker_runtime.cjs`, `frontend/src/main/app/runtime_mode.cjs` | [Runs API Runbook](../automation/runs_api_runbook.md), [VM Runs and Workers](../automation/vm_runs_and_workers.md) | backend runs tests, frontend VM worker tests |
| release, signing, package, or bundled runtime variable changed | release/packaging scripts | `.github/workflows`, `frontend/package.json`, `frontend/electron-builder.*`, `scripts/build-sidecar-runtime`, `<windie> reinstall <platform>` | [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md), [Release Guide](release.md) | package build, smoke helper, target OS manual installed-app check |

## Ownership Rules

- Backend config owns enforceable backend policy: providers, model defaults, auth, timeouts, inference routing, artifacts, capability gates, and API limits.
- Electron main owns desktop process defaults: backend endpoint resolution, SDK local-runtime launch env facts, disk config, runtime mode, and package-mode behavior.
- Renderer owns user-facing settings state and presentation. It persists only renderer-managed fields.
- The local-runtime implementation owns local execution variables and backend
  URLs needed by local-runtime memory/API clients.
- Release/CI owns signing, notarization, package targets, and bundled runtime build variables.
- Secrets must come from environment variables or user-entered secure config surfaces. Do not commit real keys.

## Change Sequence

1. Identify the owner from the fast owner map.
2. Read [Runtime Configuration Matrix](runtime_configuration_matrix.md) and the owner deep reference.
3. Add the config field at the owner layer first.
4. Normalize the value once at the owner boundary.
5. Propagate only the normalized value needed by downstream runtimes.
6. Add tests at the owner boundary and every protocol boundary that receives the value.
7. Update docs that list defaults, env vars, renderer-persisted settings, and packaging behavior.
8. Validate source mode and packaged mode when the change touches endpoint, local-runtime env, signing, or bundled runtime behavior.

## Backend Config Changes

Use backend config when the setting affects backend runtime behavior.

For backend-only details such as `AppConfig` field ownership, runtime normalization, session-scoped settings updates, DI provider rebinding, model service refresh, OCR/vision/embedding router refresh, and lazy session factory invalidation, read [Backend Config and Container Change Workflow](../backend/config/backend_config_and_container_change_workflow.md).

Primary files:

- `backend/src/core/config/app_config.py`
- `backend/src/core/config/models.py`
- `backend/src/core/config/loader.py`
- `backend/src/core/config/runtime.py`
- `backend/src/core/config/manager.py`
- `backend/src/core/config/service.py`
- `backend/src/core/config/subscriptions.py`
- `backend/src/core/container/config_updater.py`
- `backend/src/agent/session/config_runtime.py`
- `backend/src/agent/session/session_config_service.py`

Validation:

- `tests/backend/test_config_models.py`
- `tests/backend/test_config_loader.py`
- `tests/backend/test_config_manager.py`
- `tests/backend/test_config_service.py`
- `tests/backend/test_config_subscriptions.py`
- `tests/backend/test_container_config_updater.py`
- feature-specific tests for providers, inference, auth, memory, or runs.

Docs to update:

- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Configuration Reference](../reference/configuration_reference.md)
- [Backend Config Runtime Policy](../backend/config/config_fields_and_runtime_policy.md)
- feature docs such as provider, SDK, gateway, automation, or memory pages.

## Renderer Settings Changes

Use renderer settings when the value is user-facing and local to desktop UX or backend update payloads.

Primary files:

- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/renderer/features/settings/**`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`

Validation:

- `tests/frontend/configFilter.test.js`
- `tests/frontend/configStorage.test.js`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppStatusProvider.test.tsx`
- `tests/frontend/IpcSettingsSync.test.cjs`
- settings-section tests for UI controls.

Do not persist backend-owned secrets or internal backend provider knobs in renderer local storage unless the product intentionally exposes user-entered credentials and the credential docs are updated.

## Endpoint Changes

Endpoint changes are high blast-radius because renderer, Electron main, sidecar, hosted auth, and packaged defaults all depend on them.

Primary files:

- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/python/windie/_backend_config.py`
- `packages/windie-sdk-js`
- `docs/install/local_backend_and_endpoint_setup.md`
- `docs/debug/endpoint_and_network_debugging.md`

Validation:

- `tests/frontend/BackendEndpoints.test.cjs`
- Electron client websocket/endpoint tests.
- `tests/sidecar/test_backend_config.py`
- manual source-mode check with explicit local endpoint env.
- packaged-app check when packaged defaults changed.

## Provider Credential Changes

Credential changes must preserve the secret boundary.

Rules:

- API keys must come from environment variables or an approved user-entered override path.
- Docs and tests must use placeholder names, not real credentials.
- Backend provider factories should receive normalized config, not renderer raw settings.
- Renderer-managed settings can display credential status or accept user-entered overrides only where product behavior already supports that path.
- Hosted install auth tokens are not provider API keys; document them separately.

Start docs:

- [Credentials and Tokens Matrix](../security/credentials_and_tokens_matrix.md)
- [Provider Credentials](../providers/credentials.md)
- [Provider Change Workflow](../providers/provider_change_workflow.md)

## Local-Runtime Implementation Env Changes

Local-runtime implementation env changes must be validated in both source and
packaged shape when they affect process launch or bundled dependencies.

Primary files:

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_supervisor.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/python/windie/_backend_config.py`
- `frontend/src/main/python/core/env_flags.py`
- `frontend/src/main/python/core/executors.py`
- `frontend/src/main/python/tools/**`
- `frontend/src/main/python/requirements.runtime.txt`

Validation:

- focused local-runtime Python pytest.
- `<windie> build local-runtime` if runtime dependencies or packaged launch env changed.
- target OS package smoke when packaged env behavior changed.

## Review Checklist

- The setting has a single owner.
- Defaults are documented next to the owner.
- Renderer persistence includes only renderer-managed fields.
- Secrets are not committed or serialized into logs/tests/docs.
- Session config rewire behavior is tested when backend session settings change.
- First-query settings sync still waits for the backend ACK when required.
- Local-runtime Python receives only normalized env values.
- Packaged-app behavior is validated when endpoint, local-runtime env, signing, or bundled runtime config changes.

## Related Docs

- [Operations Hub](README.md)
- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md)
- [Backend Config Docs Hub](../backend/config/README.md)
- [Configuration Reference](../reference/configuration_reference.md)
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)
- [Credentials and Tokens Matrix](../security/credentials_and_tokens_matrix.md)
