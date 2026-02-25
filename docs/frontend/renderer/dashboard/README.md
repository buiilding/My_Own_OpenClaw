---
summary: "Renderer dashboard docs sub-hub for ChatGPT-style shell layout, modal panel routing, and model/settings persistence semantics."
read_when:
  - When changing `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx` modal routing behavior.
  - When modifying model selection/search/fallback logic or dashboard local-storage helpers under `features/dashboard/utils`.
title: "Renderer Dashboard Docs Hub"
---

# Renderer Dashboard Docs Hub

## Deep Pages

- [Dashboard Section Router and Placeholder Panel Contract Reference](dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Dashboard Memory Management and Resume Reference](../dashboard_memory_management_and_resume_reference.md)
- [Settings Section Display Selection and Config Toggle Reference](../settings/settings_section_display_selection_and_config_toggle_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../providers/app_provider_coordinator_and_save_status_runtime_reference.md)

## Code Scope

- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SemanticMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js`
- `frontend/src/renderer/features/dashboard/utils/storage.js`
- `tests/frontend/ModelSelectionUtils.test.js`
- `tests/frontend/DashboardStorageUtils.test.js`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
