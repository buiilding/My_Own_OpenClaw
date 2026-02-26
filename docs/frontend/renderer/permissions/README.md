---
summary: "Renderer permissions docs sub-hub for install-time onboarding gate state, manifest-version completion semantics, and settings data-controls permission center behavior."
read_when:
  - When changing permission onboarding wizard flow or required-permission gate behavior in renderer app startup.
  - When changing Data controls tab permission status/probe/request behavior in settings UI.
title: "Renderer Permissions Docs Hub"
---

# Renderer Permissions Docs Hub

## Deep Pages

- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)

## Related Pages

- [Renderer Runtime](../renderer_runtime.md)
- [Renderer Settings Sections Docs Hub](../settings/sections/README.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)

## Code Scope

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionOnboardingWizard.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/permissions/utils/permissionStorage.js`
- `frontend/src/renderer/styles/PermissionOnboarding.css`
