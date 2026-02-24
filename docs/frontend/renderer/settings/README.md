---
summary: "Frontend renderer settings docs sub-hub for SettingsSection UI contracts, display-selection persistence, and AppConfig update payload boundaries."
read_when:
  - When changing settings controls in `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`.
  - When debugging display dropdown persistence, wakeword toggle behavior, or config update payload shape from settings UI.
title: "Frontend Renderer Settings Docs Hub"
---

# Frontend Renderer Settings Docs Hub

## Deep Pages

- [Settings Section Display Selection and Config Toggle Reference](settings_section_display_selection_and_config_toggle_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Config Sync and Settings Lifecycle Reference](../../runtime/config_sync_and_settings_lifecycle_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Settings and Model ACK Event Routing Reference](../../contracts/events/settings_and_model_ack_event_routing_reference.md)

## Code Scope

- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/dashboard/utils/settingsDisplayUtils.js`
- `frontend/src/renderer/utils/displaySelection.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`
- `tests/frontend/SettingsSection.test.jsx`
- `tests/frontend/SettingsDisplayUtils.test.js`
- `tests/frontend/displaySelection.test.ts`
- `tests/frontend/SettingsManagementHook.test.ts`
