---
summary: "Renderer dashboard docs sub-hub for shell routing/search/sidebar behavior, section-level panels, and dashboard-specific persistence contracts."
read_when:
  - When changing `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx` panel routing behavior.
  - When modifying dashboard sidebar/search UX or section components under `features/dashboard/components/sections`.
title: "Renderer Dashboard Docs Hub"
---

# Renderer Dashboard Docs Hub

## Deep Pages

- [Dashboard Shell Docs Hub](shell/README.md)
- [Dashboard Sections Docs Hub](sections/README.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Dashboard Memory Management and Resume Reference](../dashboard_memory_management_and_resume_reference.md)
- [Settings Section Clone Tabs and Wakeword Toggle Runtime Reference](../settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md)
- [Frontend Config Filter, Storage, and Provider Merge Runtime Reference](../settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../providers/app_provider_coordinator_and_save_status_runtime_reference.md)

## Code Scope

- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/UsageSection.jsx`
- `frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js`
- `frontend/src/renderer/features/dashboard/utils/storage.js`
- `tests/frontend/ModelSelectionUtils.test.js`
- `tests/frontend/DashboardStorageUtils.test.js`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
