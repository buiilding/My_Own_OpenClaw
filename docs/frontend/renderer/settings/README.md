---
summary: "Frontend renderer settings docs sub-hub for clone-style settings sections, frontend config ownership/persistence boundaries, and AppConfig update payload routing."
read_when:
  - When changing settings controls in `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`.
  - When debugging wakeword/wakeword-STT/agent-sudo behavior, optional Data-controls mounting, frontend config filtering/persistence, or settings update payload shape from settings UI.
title: "Frontend Renderer Settings Docs Hub"
---

# Frontend Renderer Settings Docs Hub

## Deep Pages

- [Renderer Settings Sections Docs Hub](sections/README.md)
- [Settings Section Clone Tabs and Wakeword Toggle Runtime Reference](sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](../permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [Renderer Settings Config Docs Hub](config/README.md)
- [Frontend Config Filter, Storage, and Provider Merge Runtime Reference](config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md)
- [Settings Section Display Selection and Config Toggle Reference (Legacy Link)](settings_section_display_selection_and_config_toggle_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Config Sync and Settings Lifecycle Reference](../../runtime/config_sync_and_settings_lifecycle_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Permissions Docs Hub](../permissions/README.md)
- [Settings and Model ACK Event Routing Reference](../../contracts/events/settings_and_model_ack_event_routing_reference.md)

## Code Scope

- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/permissions/utils/permissionStorage.js`
- `frontend/src/renderer/utils/configFilter.js`
- `frontend/src/renderer/utils/configStorage.js`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`
- `tests/frontend/SettingsSection.test.jsx`
- `tests/frontend/configFilter.test.js`
- `tests/frontend/configStorage.test.js`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/SettingsManagementHook.test.ts`
