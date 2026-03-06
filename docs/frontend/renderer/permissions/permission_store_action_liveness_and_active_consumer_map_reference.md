---
summary: "Deep reference for which `permissionStore` actions are actively consumed by mounted renderer UI versus currently dormant onboarding-only actions."
read_when:
  - When changing renderer permissions flows and deciding whether store actions are dead, dormant, or actively wired.
  - When debugging why permission gate fields (`needsOnboarding`, consent/completion state) change even though startup is not permission-gated.
title: "Permission Store Action Liveness and Active Consumer Map Reference"
---

# Permission Store Action Liveness and Active Consumer Map Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`

## Why This Page Exists

The permission store still carries onboarding-gate fields and onboarding-completion actions, but
the current renderer runtime no longer mounts a permission-onboarding startup surface.

Without an explicit liveness map, it is easy to assume all store actions are currently in use.

## Active UI Consumer Map (Current Runtime)

### Actively called from mounted UI

- `bootstrapPermissions()`
  - called by `PermissionControlCenter` effect when `bootstrapped` is false
- `runPermissionProbe(permissionId)`
  - called by per-row `Re-check` button in `PermissionControlCenter`
- `recheckAllPermissions()`
  - called by global `Re-run checks` button in `PermissionControlCenter`

### Exported but currently dormant in mounted renderer UI

- `requestPermission(permissionId)`
- `setPlannedSystemAccessConsent(consent)`
- `completeOnboarding()`

No current `frontend/src/renderer/**` component/hook calls these actions.

## Gate-Field Liveness

`resolveGateState(...)` still recomputes and stores:

- `needsOnboarding`
- `completedForManifest`
- `requiredPermissionIds`
- `missingRequiredPermissions`

Those fields are still semantically valid store state, but not a startup-route gate in current
`App.jsx` routing.

## Startup Boundary Clarification

`App.jsx` startup routing currently depends on:

1. VM mode (`isVmModeEnabled()`)
2. frontend onboarding slideshow state (`windieos-frontend-onboarding`)

It does not currently branch on `permissionStore.needsOnboarding`.

## Drift Hotspots

1. Assuming dormant actions can be removed without checking non-renderer callers (tests, future surfaces, IPC consumers).
2. Reintroducing startup permission gating without documenting the route switch back to `needsOnboarding`.
3. Adding new UI consumers for consent/completion actions without restoring/adding dedicated regression tests.

## Related Docs

- [Permission Store Gate-State and IPC Action Contract Reference](permission_store_gate_state_and_ipc_action_contract_reference.md)
- [Permission Control Center Probe and Recheck Store-Sync Runtime Reference](permission_control_center_probe_and_recheck_store_sync_runtime_reference.md)
- [App Startup VM-Mode and Frontend Onboarding Runtime Reference](../app_startup_vm_mode_and_frontend_onboarding_runtime_reference.md)
