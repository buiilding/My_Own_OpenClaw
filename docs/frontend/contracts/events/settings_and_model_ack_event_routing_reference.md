---
summary: "Deep reference for frontend handling of non-typed control ACK events on `from-backend`: `models-listed`, `settings-updated`, and settings-error status transitions."
read_when:
  - When changing model-list/settings sync flows between renderer providers and backend handlers.
  - When debugging save-status state not transitioning or model list updates not appearing.
title: "Settings and Model ACK Event Routing Reference"
---

# Settings and Model ACK Event Routing Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `frontend/src/main/ipc.cjs`
- `backend/src/api/handlers/settings.py`

## Event Family Boundary

These control ACK events are rebroadcast on `from-backend` but are not part of `backendEvents.ts` typed union:

- `models-listed`
- `settings-updated`
- `settings-loaded` (used in transport/contracts; not currently routed in appConfigEvents)

They are consumed by app/provider-specific listeners, not typed stream hooks.

## Model List Flow (`models-listed`)

Flow:

1. renderer requests models (`ApiClient.listModels()` -> `to-backend`)
2. backend `ListModelsHandler` responds with `type: "models-listed"`
3. main `ipc.cjs` rebroadcasts event on `from-backend`
4. `AppConfigProvider` listener calls `routeConfigBackendEvent(...)`
5. `routeConfigBackendEvent` dispatches `models-listed` to `handleModelsListed(...)`
6. `useSettingsManagement` updates `availableModels` via payload passthrough

Important:

- `handleModelsListed` trusts payload shape and assigns directly to state
- payload validation is not done in the provider layer

## Settings Save Status Flow (`settings-updated` and error)

`AppStatusProvider` listens on `from-backend` and updates `saveStatus`:

- `settings-updated` -> `success` -> auto-reset to `idle` after 3s
- `error` containing text `Failed to update settings` -> `error` -> auto-reset to `idle` after 3s

`setSaving()` behavior:

- sets `saveStatus = "saving"`
- starts 10s timeout fallback to `error` if no completion signal arrives

## Stream Error Suppression Coupling

`useChatStream` suppresses assistant error rows for settings failures via:

- `shouldIgnoreStreamError(...)`
- message/content includes `Failed to update settings`

This prevents settings-update failures from appearing as chat conversation errors while still allowing `AppStatusProvider` to reflect failure state.

## Drift Hotspot: Error Text Coupling

`AppStatusProvider` and `shouldIgnoreStreamError(...)` both depend on substring `Failed to update settings`.

If backend error text changes, both save-status failure detection and chat-error suppression can drift.

## Initial Sync Context

`AppConfigProvider` also reacts to `ipc-status` and `get-client-user-id` snapshots:

- updates transcript user/session snapshot
- sets backend HTTP URL for artifact uploader
- may trigger `ApiClient.updateSettings(currentConfig)` when backend connection is active

This path is separate from `from-backend` ACK/control events but interacts with settings lifecycle timing.

## Debug Checklist

If model list never updates:

1. verify `list-models` request is sent from provider/main view
2. verify backend emits `models-listed`
3. verify `routeConfigBackendEvent(...)` receives event and `handleModelsListed` runs

If save status remains `saving`:

1. verify backend emits `settings-updated` or error event
2. verify event arrives on `from-backend`
3. verify error text still matches expected substring when failure path is intended
4. check 10s fallback timeout behavior in `setSaving()`

## Related Pages

- [Frontend Contracts Events Docs Hub](README.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Backend Event Consumer Matrix Reference](../backend_event_consumer_matrix_reference.md)
