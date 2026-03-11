---
summary: "Deep reference for which `permissionStore` actions are actively consumed by mounted renderer UI, including the startup permission-onboarding gate."
read_when:
  - When changing renderer permissions flows and deciding whether store actions are dead, dormant, or actively wired.
  - When debugging why permission gate fields (`needsOnboarding`, consent/completion state) change during startup routing or settings re-check flows.
title: "Permission Store Action Liveness and Active Consumer Map Reference"
---

# Permission Store Action Liveness and Active Consumer Map Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`

## Why This Page Exists

The permission store now drives both startup routing and settings-time permission maintenance.

Without an explicit liveness map, it is easy to misclassify store actions as dead when they still gate app entry.

## Active UI Consumer Map (Current Runtime)

### Actively called from mounted UI

- `bootstrapPermissions()`
  - called by `FrontendOnboardingSlideshow` and `PermissionControlCenter` when `bootstrapped` is false
- `runPermissionProbe(permissionId)`
  - called by per-row `Re-check` button in `PermissionControlCenter`
- `recheckAllPermissions()`
  - called by global `Re-run checks` button in `PermissionControlCenter`
- `requestPermission(permissionId)`
  - called by `FrontendOnboardingSlideshow` Grant actions
- `completeOnboarding()`
  - called by `FrontendOnboardingSlideshow` before `Start WindieOS`

### Exported but currently dormant in mounted renderer UI

- `setPlannedSystemAccessConsent(consent)`

No current `frontend/src/renderer/**` component/hook calls this action.

## Gate-Field Liveness

`resolveGateState(...)` still recomputes and stores:

- `needsOnboarding`
- `completedForManifest`
- `requiredPermissionIds`
- `missingRequiredPermissions`

Those fields are startup-route inputs in current `App.jsx` routing.

## Startup Boundary Clarification

`App.jsx` startup routing currently depends on:

1. VM mode (`isVmModeEnabled()`)
2. permission onboarding gate (`permissionStore.needsOnboarding`)

It no longer uses the deleted `windieos-frontend-onboarding` localStorage flag.

## Drift Hotspots

1. Assuming dormant actions can be removed without checking non-renderer callers (tests, future surfaces, IPC consumers).
2. Changing current-platform permission filtering without updating `missingRequiredPermissions` expectations.
3. Adding new UI consumers for consent/completion actions without restoring/adding dedicated regression tests.

## Related Docs

- [Permission Store Gate-State and IPC Action Contract Reference](permission_store_gate_state_and_ipc_action_contract_reference.md)
- [Permission Control Center Probe and Recheck Store-Sync Runtime Reference](permission_control_center_probe_and_recheck_store_sync_runtime_reference.md)
- [App Startup VM-Mode and Frontend Onboarding Runtime Reference](../app_startup_vm_mode_and_frontend_onboarding_runtime_reference.md)
