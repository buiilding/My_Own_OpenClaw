---
summary: "Deep reference for frontend handling of non-typed settings/model control ACK events on `backend-settings-event`: `models-listed`, `settings-updated`, and settings-error status transitions."
read_when:
  - When changing model-list/settings sync flows between renderer providers and backend handlers.
  - When debugging save-status state not transitioning or model list updates not appearing.
title: "Settings and Model ACK Event Routing Reference"
---

# Settings and Model ACK Event Routing Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopSettingsUpdateErrorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- `frontend/src/main/ipc.cjs`
- `backend/src/api/handlers/settings.py`

## Event Family Boundary

These control ACK events are routed to renderer on `backend-settings-event` by
`ipc_backend_event_channels.cjs`; they are not part of the renderer
`backendEvents.ts` typed chat union:

- `models-listed`
- `settings-updated`
- `error` when it carries settings-update failure text

`settings-loaded` remains a backend/SDK event type but is not currently routed
to `AppConfigProvider` by `ipc_backend_event_channels.cjs`.

They are consumed by app/provider-specific listeners, not typed stream hooks.

## Model List Flow (`models-listed`)

Flow:

1. renderer requests models through `DesktopSettingsRuntimeClient.listModels()`
2. `desktopRuntimeTransport.ts` sends `window.agentSdk.invoke("models.list")`
3. Electron main `ipc.cjs` routes the command to the Agent SDK model-list path
4. backend `ListModelsHandler` responds with `type: "models-listed"`
5. `ipc_backend_event_channels.cjs` routes the event to
   `backend-settings-event`
6. `AppConfigProvider` listener calls
   `DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(...)`
7. `DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(...)`
   dispatches `models-listed` to `handleModelsListed(...)`
8. `DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers(...)`
   updates `availableModels` via payload passthrough

Important:

- `handleModelsListed` trusts payload shape and assigns directly to state
- payload validation is not done in the provider layer

## Settings Save Status Flow (`settings-updated` and error)

`AppStatusProvider` listens through
`DesktopAppConfigRuntimeClient.onSettingsSaveStatusAction(...)`, which keeps raw
settings event normalization and settings-update failure classification private
to the runtime client. The provider updates `saveStatus` from value-level
actions:

- `settings-updated` -> `success` -> auto-reset to `idle` after 3s
- `error` with `isSettingsUpdateError=true` -> `error` -> auto-reset to `idle` after 3s

`setSaving()` behavior:

- sets `saveStatus = "saving"`
- starts 10s timeout fallback to `error` if no completion signal arrives

## Stream Error Suppression Coupling

`useChatStream` suppresses assistant error rows for settings failures via:

- `DesktopChatStreamEventPayloadRuntime.shouldIgnoreStreamError(...)`
- `DesktopSettingsUpdateErrorRuntime.isSettingsUpdateErrorPayload(...)`
  matching the shared backend failure text

This prevents settings-update failures from appearing as chat conversation errors while still allowing `AppStatusProvider` to reflect failure state.

## Drift Hotspot: Error Text Coupling

`DesktopAppConfigRuntimeClient` and `DesktopChatStreamEventPayloadRuntime.shouldIgnoreStreamError(...)` both route
through `DesktopSettingsUpdateErrorRuntime` for the settings-update failure
substring, keeping the raw classifier helpers private to
`desktopSettingsUpdateErrorRuntime.ts`.

If backend error text changes, update that shared runtime classifier plus the
save-status and chat-error suppression coverage together.

## Initial Sync Context

`AppConfigProvider` also reacts to `ipc-status` and `get-client-user-id` snapshots:

- updates transcript user/session snapshot
- sets backend HTTP URL for renderer artifact URL composition
- may trigger `DesktopSettingsRuntimeClient.updateSettings(currentConfig)` when backend connection is active

This path is separate from settings/model ACK events but interacts with settings
lifecycle timing.

## Debug Checklist

If model list never updates:

1. verify the dashboard provider calls `DesktopSettingsRuntimeClient.requestDashboardStartupModelList()` and the `models.list` command reaches main through `windie:invoke`
2. verify backend emits `models-listed`
3. verify `DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(...)`
   receives event and `handleModelsListed` runs

If save status remains `saving`:

1. verify backend emits `settings-updated` or error event
2. verify `ipc_backend_event_channels.cjs` routes the event to
   `backend-settings-event`
3. verify the runtime classifier still recognizes the backend failure text when the failure path is intended
4. check 10s fallback timeout behavior in `setSaving()`

## Related Pages

- [Frontend Contracts Events Docs Hub](README.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Backend Event Consumer Matrix Reference](../backend_event_consumer_matrix_reference.md)
