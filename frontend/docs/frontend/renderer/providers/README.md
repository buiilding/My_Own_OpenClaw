---
summary: "Frontend renderer provider docs sub-hub for root view routing, provider stack composition, config/status coordination, and save-status callback wiring."
read_when:
  - When changing renderer root app composition (`main.jsx`, `App.jsx`, overlay app wrappers).
  - When debugging provider state propagation, shift-tab mode toggle behavior, or settings save-status transitions.
title: "Frontend Renderer Provider Docs Hub"
---

# Frontend Renderer Provider Docs Hub

## Deep Pages

- [Entrypoint View Routing and Provider Stack Reference](entrypoint_view_routing_and_provider_stack_reference.md)
- [App Startup VM-Mode and Permission Onboarding Runtime Reference](../app_startup_vm_mode_and_permission_onboarding_runtime_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Provider Contexts Docs Hub](contexts/README.md)
- [App Config and Status Context Hook Guard Reference](contexts/app_config_and_status_context_hook_guard_and_reexport_boundary_reference.md)
- [Chat Provider Bootstrap Flag Contract Reference](contexts/chat_provider_bootstrap_flag_contract_reference.md)
- [Renderer Provider Components Docs Hub](components/README.md)
- [Error Boundary Fallback and Component-Tree Crash Isolation Contract Reference](components/error_boundary_fallback_and_component_tree_crash_isolation_contract_reference.md)
- [Renderer Provider Shortcut Docs Hub](shortcuts/README.md)
- [Shift+Tab Mode Toggle and Editable Target Guard Reference](shortcuts/shift_tab_mode_toggle_and_editable_target_guard_reference.md)

## Code Scope

- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/MinimalChatPillApp.jsx`
- `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`
- `frontend/src/renderer/components/ErrorBoundary.jsx`
- `frontend/src/renderer/app/providers/*`
- `frontend/src/renderer/app/providers/ChatProvider.jsx`
- `tests/frontend/AppProvider.test.tsx`
- `tests/frontend/AppConfigProvider.*.test.tsx`
- `tests/frontend/AppStatusProvider.test.tsx`
- `tests/frontend/AppConfigContext.test.tsx`
- `tests/frontend/AppStatusContext.test.tsx`
