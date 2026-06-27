---
summary: "Deep reference for which `permissionStore` actions are actively consumed by mounted renderer UI, including the startup permission-onboarding gate."
read_when:
  - When changing renderer permissions flows and deciding whether store actions are dead, dormant, or actively wired.
  - When debugging why permission gate fields (`needsOnboarding`, consent/completion state) change during startup routing or onboarding request flows.
title: "Permission Store Action Liveness and Active Consumer Map Reference"
---

# Permission Store Action Liveness and Active Consumer Map Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/app/runtime/desktopPermissionRuntimeClient.ts`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/onboarding/components/DesktopOnboardingSlideshow.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/BrowserSettingsTab.jsx`

## Why This Page Exists

The permission store drives startup routing, onboarding permission requests, and
focused settings permission checks such as Browser automation.

Without an explicit liveness map, it is easy to misclassify store actions as dead when they still gate app entry.

The store delegates desktop transport to `DesktopPermissionRuntimeClient`; UI
consumers should call store actions, not invoke permission IPC channels
directly.

## Active UI Consumer Map (Current Runtime)

### Actively called from mounted UI

- `bootstrapPermissions()`
  - called by `DesktopOnboardingSlideshow` when `bootstrapped` is false
- `runPermissionProbe(permissionId)`
  - called by Browser settings and onboarding wait loops for focused status refresh
- `requestPermission(permissionId)`
  - called by `DesktopOnboardingSlideshow` Grant actions and Browser settings Open Browser action
- `completeOnboarding()`
  - called by `DesktopOnboardingSlideshow` before the skin-provided start CTA

### Exported but currently dormant in mounted renderer UI

- `setPlannedSystemAccessConsent(consent)`
- `recheckAllPermissions()`

No current `frontend/src/renderer/**` component/hook calls these actions.

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

1. Assuming dormant actions can be removed without checking tests, future surfaces, or IPC consumers.
2. Changing current-platform permission filtering without updating `missingRequiredPermissions` expectations.
3. Adding new UI consumers for consent/completion actions without restoring/adding dedicated regression tests.

## Related Docs

- [Permission Store Gate-State and IPC Action Contract Reference](permission_store_gate_state_and_ipc_action_contract_reference.md)
- [App Startup VM-Mode and Permission Onboarding Runtime Reference](../app_startup_vm_mode_and_permission_onboarding_runtime_reference.md)
