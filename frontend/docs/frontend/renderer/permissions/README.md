---
summary: "Renderer permissions docs sub-hub for current permission runtime surfaces: onboarding, Browser settings status presentation, and permission-store gate state derivation."
read_when:
  - When changing onboarding permission flows, Browser settings permission status badges, or `PermissionStatusBadge` renderer behavior.
  - When changing `permissionStore` gate-state derivation (`needsOnboarding`, manifest-version completion) or probe/recheck flows.
title: "Renderer Permissions Docs Hub"
---

# Renderer Permissions Docs Hub

## Deep Pages

- [Permission Store Gate-State and IPC Action Contract Reference](permission_store_gate_state_and_ipc_action_contract_reference.md)
- [Permission Store Action Liveness and Active Consumer Map Reference](permission_store_action_liveness_and_active_consumer_map_reference.md)
- [Permission Status Badge Rendering Reference](permission_status_badge_row_rendering_and_reason_visibility_reference.md)
- [Permission Onboarding Gate and Manifest Version Runtime Reference](permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
  - historical/store-level gate semantics page; renderer app startup now gates on onboarding completion, not on every missing permission

## Related Pages

- [Renderer Runtime](../renderer_runtime.md)
- [Renderer Settings Sections Docs Hub](../settings/sections/README.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)

## Code Scope

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionStatusBadge.jsx`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopPermissionOnboardingStorageRuntime.js`
