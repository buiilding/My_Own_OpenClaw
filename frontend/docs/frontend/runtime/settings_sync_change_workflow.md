---
summary: "Workflow for renderer settings-sync changes across renderer config storage, AppConfig/AppStatus providers, Electron disk persistence, SDK settings command dispatch, update-settings ACK gating, backend session config, and model/provider UI."
read_when:
  - When changing a user-facing setting, config persistence, model picker, settings ACK behavior, first-query settings sync, or renderer-to-SDK/main settings command shape.
  - When debugging stale settings, save-status drift, first-query settings races, model list fallback, or config fields that reappear after reload.
  - When deciding whether a setting belongs in renderer local storage, Electron
    disk config, backend session config, or local-runtime env.
title: "Settings Sync Change Workflow"
---

# Settings Sync Change Workflow

Use this workflow before changing renderer settings or config sync. Settings changes are cross-runtime by default: renderer UI persists local state, Electron main stores disk state and gates backend sync, and the backend may rewire sessions from the sanitized settings payload.

For tab/control ownership, start with [Settings Surface Change Workflow](../renderer/settings/settings_surface_change_workflow.md). Use this page when the setting value crosses persistence, Electron ACK, or backend session-config boundaries.

## Settings Flow

1. renderer loads local storage and disk config.
2. renderer filters to renderer-owned settings fields.
3. settings UI updates `AppConfigProvider`.
4. renderer persists local storage and main-process disk config.
5. renderer sends the SDK-shaped `settings.update` command to Electron main.
6. Electron main filters the backend settings payload, sends backend
   `update-settings` through the Agent SDK runtime, and waits for matching ACK.
7. backend validates allowed patch fields and rewires session/runtime config.
8. backend emits `settings-updated` or an error.
9. renderer updates save status and model/provider UI.

## Fast Owner Map

| Symptom or request | First owner | Source roots | Start docs | Tests |
| --- | --- | --- | --- | --- |
| setting disappears after reload | renderer app-runtime storage and filter | `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`, `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`, `frontend/src/renderer/app/providers/appConfigPersistence.js` | [Renderer Config Sync Lifecycle](config_sync_and_settings_lifecycle_reference.md) | `tests/frontend/configStorage.test.js`, `tests/frontend/configFilter.test.js`, `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx` |
| setting saves locally but backend ignores it | backend patch allowlist or main ACK path | `frontend/src/main/ipc/ipc_settings_sync.cjs`, `backend/src/api/handlers/settings.py`, `backend/src/core/validation` | Configuration Change Workflow (private backend docs), Backend Input Validation and Client Settings Patch Guard (private backend docs) | `tests/frontend/IpcSettingsSync.test.cjs`, `tests/backend/test_settings_update_rules.py` |
| first query uses stale model/settings | Electron main initial settings sync gate | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_settings_sync.cjs`, `frontend/src/main/ipc/ipc_query_runtime.cjs` | [Frontend Query Payload Relay](../main/query_payload_and_relay_reference.md), [Frontend WS Handshake and Settings Sync](../main/websocket_handshake_and_settings_sync_reference.md) | `tests/frontend/IpcSettingsSync.test.cjs`, query relay tests |
| save indicator is stuck | renderer status provider and backend ACK routing | `frontend/src/renderer/app/providers/AppStatusProvider.jsx`, `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`, `frontend/src/main/ipc/ipc_settings_sync.cjs` | [Settings and Model ACK Event Routing Reference](../contracts/events/settings_and_model_ack_event_routing_reference.md) | `tests/frontend/AppStatusProvider.test.tsx`, `tests/frontend/DesktopSettingsEventRuntimeClient.test.ts` |
| model list or model picker is wrong | renderer model settings plus backend model catalog/list-models | `frontend/src/renderer/features/settings`, `frontend/src/renderer/features/chat`, `backend/src/llm/models`, `backend/src/api/handlers/settings.py` | [Model Catalog Change Workflow](../../providers/model_catalog_change_workflow.md), [Model Provider Selection](../../concepts/model_provider_selection.md) | `tests/frontend/AppConfigProvider.models.test.tsx`, `tests/frontend/ModelsSection.test.jsx`, `tests/backend/test_model_service.py` |
| backend provider/session does not rewire | backend session config service | `backend/src/agent/session/session_config_service.py`, `backend/src/agent/session/config_runtime.py`, `backend/src/core/config/runtime.py` | Backend Session Runtime and Config Rewire Reference (private backend docs) | `tests/backend/test_session_config_service.py`, `tests/backend/test_settings_payload_builder.py` |
| local-runtime implementation env should change from a setting | SDK local-runtime launch options, not renderer storage alone | `frontend/src/main/sidecar/local_runtime_launch_options.cjs`, `frontend/src/main/python/core`, `frontend/src/main/python/tools` | Configuration Change Workflow (private backend docs) | focused local-runtime Python tests and launch/runtime checks |

## Ownership Rules

- Renderer owns local UI state, settings controls, local storage, and model-picker presentation.
- Electron main owns disk persistence, websocket forwarding, ACK gating, backend endpoint status, and SDK local-runtime launch env facts.
- Backend owns allowed settings patch fields, session config rewire, provider runtime selection, and model catalog policy.
- The local-runtime implementation owns local tool runtime env and should not
  read renderer local storage directly.
- Renderer should never send backend-owned internal config fields just because they exist in a backend model.

## Change Sequence

1. Decide whether the setting is renderer-only, backend session config, Electron process config, local-runtime env, or release/packaging config.
2. Update the owner first.
3. Update `filterRendererConfig(...)` only if the field is renderer-owned or intentionally sent in `update-settings`.
4. Update storage defaults and migration/cleanup if persisted shape changes.
5. Update Electron disk persistence, SDK command dispatch, and ACK behavior if
   the sync protocol changes.
6. Update backend settings validation and session rewire if backend behavior changes.
7. Add tests at renderer storage, main ACK, and backend patch boundaries as needed.
8. Update Configuration Change Workflow (private backend docs), Runtime Configuration Matrix (private backend docs), and feature docs.

## Renderer Storage Changes

Primary files:

- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`

Validation:

- `tests/frontend/configStorage.test.js`
- `tests/frontend/configFilter.test.js`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/DesktopSettingsEventRuntimeClient.test.ts`
- settings-section tests for visible controls.

Rules:

- Strip unknown, deprecated, or backend-owned fields when loading persisted config.
- Keep defaults deterministic.
- Avoid saving `undefined` values.
- Persist user-visible settings immediately, then rely on backend ACK for remote runtime state.

## Electron Main Sync Changes

Primary files:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`

Validation:

- `tests/frontend/IpcSettingsSync.test.cjs`
- `tests/frontend/BackendEndpoints.test.cjs` when endpoint state is involved.
- query relay tests when first-query gating changes.

Rules:

- `update-settings` ACK matching should use outbound message ID.
- Initial settings sync should complete before first backend-bound query when a connection is available.
- Timeout paths should fail visibly without blocking the app forever.
- Disk config writes should remain atomic.

## Backend Settings Changes

Primary files:

- `backend/src/api/handlers/settings.py`
- `backend/src/core/validation/**`
- `backend/src/core/config/**`
- `backend/src/agent/session/session_config_service.py`
- `backend/src/agent/session/config_runtime.py`

Validation:

- `tests/backend/test_settings_update_rules.py`
- `tests/backend/test_settings_payload_builder.py`
- `tests/backend/test_session_config_service.py`
- config model/loader tests if the field is backend-owned.

Rules:

- Reject or ignore fields outside the renderer settings patch allowlist.
- Rebuild provider, prompt, and tool policy dependencies only when the changed field affects them.
- Keep session-scoped config distinct from process-wide defaults.
- Do not trust renderer-provided hosted identity.

## Model and Provider Settings

Model/provider UI changes often cross renderer, backend model catalog, and provider capability flags.

Start docs:

- [Model Catalog Change Workflow](../../providers/model_catalog_change_workflow.md)
- [Provider Change Workflow](../../providers/provider_change_workflow.md)
- [Model Provider Selection](../../concepts/model_provider_selection.md)
- Provider Credentials (private backend docs)

Validation:

- renderer model picker tests.
- backend model catalog tests.
- provider factory/config tests when provider selection changes.
- hosted model-list route/handler tests if event payloads change.

## Review Checklist

- The setting has exactly one owner.
- Renderer persistence contains only allowed renderer-managed settings fields.
- Electron main ACK and timeout behavior are covered.
- Backend patch validation covers accepted and rejected fields.
- First-query sync still prevents stale settings from reaching the backend.
- Model/provider changes update catalog, picker, and provider docs together.
- Local-runtime implementation env changes are validated through local-runtime Python
  startup or focused local-runtime Python tests.
- Docs and changelog list defaults and propagation behavior.

## Related Docs

- [Frontend Runtime Docs Hub](README.md)
- [Settings Surface Change Workflow](../renderer/settings/settings_surface_change_workflow.md)
- [Config Sync and Settings Lifecycle Reference](config_sync_and_settings_lifecycle_reference.md)
- [Model Settings Change Workflow](../renderer/settings/model_settings_change_workflow.md)
- Configuration Change Workflow (private backend docs)
- Runtime Configuration Matrix (private backend docs)
- [Frontend Renderer Settings Docs Hub](../renderer/settings/README.md)
- [Settings and Model ACK Event Routing Reference](../contracts/events/settings_and_model_ack_event_routing_reference.md)
