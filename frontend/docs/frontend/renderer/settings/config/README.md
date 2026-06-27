---
summary: "Renderer settings config docs sub-hub for renderer config-field filtering, localStorage defaults, and AppConfigProvider merge/apply guards."
read_when:
  - When changing renderer-owned config field allowlist or local config defaults.
  - When debugging config persistence drift between localStorage, disk config load, and backend update-settings sync.
title: "Renderer Settings Config Docs Hub"
---

# Renderer Settings Config Docs Hub

## Deep Pages

- [Renderer Config Filter, Storage, and Provider Merge Runtime Reference](frontend_config_filter_storage_and_provider_merge_runtime_reference.md)

## Related Pages

- [Frontend Renderer Settings Docs Hub](../README.md)
- [Config Sync and Settings Lifecycle Reference](../../../runtime/config_sync_and_settings_lifecycle_reference.md)
- Input Validation and Client Settings Patch Guard Reference (private backend docs)

## Code Scope

- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `tests/frontend/configFilter.test.js`
- `tests/frontend/configStorage.test.js`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
