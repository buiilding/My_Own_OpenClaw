---
summary: "Onboarding and permissions guide covering first-run gate, permission manifest, probes, grant effects, settings control center, and platform-specific behavior."
read_when:
  - When changing onboarding, permission probes, permission grant actions, or settings data controls.
  - When debugging permission state that differs between onboarding and settings.
title: "Onboarding and Permissions"
---

# Onboarding and Permissions

Desktop onboarding is a first-run gate for required local capabilities. It is
renderer-owned for presentation and Electron-main-owned for platform probes and
grant actions; WindieOS product copy comes from the renderer skin/config.

## Main Files

- Onboarding UI: `frontend/src/renderer/features/onboarding/*`
- Permission store: `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- Permission UI: `frontend/src/renderer/features/permissions/components/*`
- Permission runtime facades: `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`, `frontend/src/renderer/app/runtime/desktopPermissionGrantEffectsRuntime.js`, `frontend/src/renderer/app/runtime/desktopPermissionOnboardingStorageRuntime.js`, `frontend/src/renderer/app/runtime/desktopPermissionRuntimeClient.ts`
- Manifest: `frontend/src/shared/permissions/permission_manifest.json`
- Main IPC: `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- Main services: `frontend/src/main/permissions/permission_service*.cjs`

## Behavior Rules

- Onboarding should not mount wakeword capture before the microphone permission step.
- Opening OS settings is not the same as a granted permission; probe the real capability.
- Permission control center in settings should reuse the same manifest, store behavior, and renderer app-runtime permission facades as onboarding.
- Platform-specific permission behavior belongs in main process services, local-runtime platform adapters, or local-runtime Python implementation details.

## Settings Re-Entry

Settings can restart onboarding through the onboarding/settings tab. Keep re-entry behavior explicit so users can repeat the flow without corrupting already-granted capability state.

## Deep Docs

- [App Startup and Onboarding Change Workflow](../frontend/renderer/app_startup_onboarding_change_workflow.md)
- [Frontend Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](../frontend/renderer/permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [Frontend Permission Store Action Liveness and Active Consumer Map Reference](../frontend/renderer/permissions/permission_store_action_liveness_and_active_consumer_map_reference.md)
- [Frontend Permission Manifest, Probe, and IPC Request Contract Reference](../frontend/main/permission_manifest_probe_and_request_ipc_reference.md)
