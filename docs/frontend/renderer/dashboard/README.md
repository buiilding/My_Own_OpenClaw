---
summary: "Renderer dashboard docs sub-hub for shell/sidebar/search behavior, panel section runtime contracts, and dashboard utility ownership."
read_when:
  - When changing `ChatGptDashboardShell.jsx` panel routing behavior.
  - When modifying sidebar/search UX or section components under `features/dashboard/components/sections`.
title: "Renderer Dashboard Docs Hub"
---

# Renderer Dashboard Docs Hub

## Deep Pages

- [Dashboard Shell Docs Hub](shell/README.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Dashboard Recent Conversation Loader, Retry, and Title-Visibility Poll Runtime Reference](shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md)
- [Dashboard Sections Docs Hub](sections/README.md)
- [Memory Section Data Normalization and Semantic Delete Contract Reference](sections/memory_section_data_normalization_and_semantic_delete_contract_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](sections/models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)

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
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/MemoryItem.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/memorySectionData.js`
- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/modelCardData.js`
- `frontend/src/renderer/features/dashboard/components/sections/modelCards.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/providerApiKeys.js`
- `frontend/src/renderer/features/dashboard/components/sections/ApiKeysSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/UsageSection.jsx`
- `frontend/src/renderer/features/dashboard/utils/conversationGroups.js`
- `frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
- `tests/frontend/MemorySection.test.jsx`
- `tests/frontend/ModelsSection.test.jsx`
- `tests/frontend/ModelSelectionUtils.test.js`
- `tests/frontend/EpisodicMemoryUtils.test.js`
