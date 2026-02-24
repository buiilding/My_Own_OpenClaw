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
- [App Provider Coordinator and Save-Status Runtime Reference](app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Provider Shortcut Docs Hub](shortcuts/README.md)
- [Shift+Tab Mode Toggle and Editable Target Guard Reference](shortcuts/shift_tab_mode_toggle_and_editable_target_guard_reference.md)

## Code Scope

- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/ChatBoxApp.jsx`
- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/app/ChatBoxContextLabelApp.jsx`
- `frontend/src/renderer/app/providers/*`
- `tests/frontend/AppProvider.test.tsx`
- `tests/frontend/AppConfigProvider.*.test.tsx`
- `tests/frontend/AppStatusProvider.test.tsx`
