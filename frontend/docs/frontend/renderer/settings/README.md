---
summary: "Frontend renderer settings docs sub-hub for settings-surface sections, renderer config ownership/persistence boundaries, and AppConfig update payload routing."
read_when:
  - When changing settings controls in `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`.
  - When debugging wakeword/wakeword-STT behavior, global stop shortcut settings, retired agent-sudo settings references, renderer config filtering/persistence, or settings update payload shape from settings UI.
title: "Frontend Renderer Settings Docs Hub"
---

# Frontend Renderer Settings Docs Hub

## Deep Pages

- [Settings Surface Change Workflow](settings_surface_change_workflow.md)
- [Renderer Settings Sections Docs Hub](sections/README.md)
- [Model Settings Change Workflow](model_settings_change_workflow.md)
- [Renderer State Change Workflow](../renderer_state_change_workflow.md)
- [Settings Section Tabs and Wakeword Toggle Runtime Reference](sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md)
- [Permission Onboarding Gate and Manifest Version Runtime Reference](../permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [Renderer Settings Config Docs Hub](config/README.md)
- [Renderer Config Filter, Storage, and Provider Merge Runtime Reference](config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Settings Sync Change Workflow](../../runtime/settings_sync_change_workflow.md)
- [Settings Surface Change Workflow](settings_surface_change_workflow.md)
- [Config Sync and Settings Lifecycle Reference](../../runtime/config_sync_and_settings_lifecycle_reference.md)
- [Global Stop Shortcut Runtime Reference](../../main/global_stop_shortcut_runtime_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Permissions Docs Hub](../permissions/README.md)
- [Settings and Model ACK Event Routing Reference](../../contracts/events/settings_and_model_ack_event_routing_reference.md)

## Code Scope

- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/app/runtime/desktopModelCardPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopModelSelectionRuntime.js`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/app/runtime/desktopPermissionOnboardingStorageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `tests/frontend/SettingsSection.test.jsx`
- `tests/frontend/configFilter.test.js`
- `tests/frontend/configStorage.test.js`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/DesktopSettingsEventRuntimeClient.test.ts`
