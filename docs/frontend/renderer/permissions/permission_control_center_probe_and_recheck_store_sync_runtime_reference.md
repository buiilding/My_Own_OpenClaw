---
summary: "Deep reference for renderer Permission Control Center runtime: bootstrap-on-mount store sync, global/per-permission probe actions, loading/error rendering, and gate-state coupling with permissionStore."
read_when:
  - When changing `PermissionControlCenter` UI behavior, action wiring, or loading/error rendering.
  - When debugging permission status rows that fail to refresh after probe/recheck actions in settings Data controls.
title: "Permission Control Center Probe and Recheck Store-Sync Runtime Reference"
---

# Permission Control Center Probe and Recheck Store-Sync Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionRowMain.jsx`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/styles/CloneMemoryModels.css`

## Runtime Ownership Boundary

`PermissionControlCenter` is a settings-surface runtime view over `permissionStore` state.

It owns:

- one-time bootstrap trigger when store is not bootstrapped
- rendering current manifest permission rows and status snapshots
- wiring global recheck and per-permission re-probe actions
- rendering store error surface

It does not own:

- permission manifest fetch/probe/request IPC calls
- gate-state computation (`needsOnboarding`, missing required permissions)
- onboarding completion persistence

Those behaviors remain in `permissionStore`.

Current UI note:

- `PermissionControlCenter` exposes `Re-run checks` and per-row `Re-check` actions
- it does not expose a per-row `Request` action in current renderer code

## Bootstrap-on-Mount Contract

On mount/update:

- if `bootstrapped` is false, call `bootstrapPermissions()` once via effect
- while bootstrap is active (`isLoading` true), global recheck button is disabled

`bootstrapPermissions()` in store:

- calls `list-permissions`
- normalizes manifest + status rows
- computes onboarding gate state from manifest + status + saved onboarding state
- sets `bootstrapped=true` even on failure so UI can render error state instead of spinning indefinitely

Action-loading nuance:

- `runPermissionProbe()` and `recheckAllPermissions()` currently do not toggle `isLoading`
- global `Re-run checks` and per-row `Re-check` buttons therefore remain clickable while those
  requests are in-flight

## Rendered UI Shape

Container layout:

- heading: `Permissions`
- description: `Live capability status used by onboarding and runtime gating.`
- global action button: `Re-run checks`
- per-permission rows rendered from store `permissions`
- row status display delegated to `PermissionRowMain`

Per-row action:

- button `Re-check` invokes `runPermissionProbe(permission.permission_id)`

Error surface:

- when store `error` is non-empty, renders inline row with shield icon + error text

## Action Wiring and Store Semantics

Global button (`recheckAllPermissions`):

- collects all permission ids from current manifest
- invokes `check-permissions`
- replaces `statusesByPermissionId` map (not merge)

Per-row button (`runPermissionProbe`):

- invokes `run-permission-probe` for one permission id
- merges returned status into existing `statusesByPermissionId`

Both paths recompute gate state through shared `buildStatusStateUpdate(...)` in store.

Store/API surface note:

- `permissionStore.requestPermission(permissionId)` and `REQUEST_PERMISSION` IPC still exist for non-ControlCenter flows
- current ControlCenter runtime does not call that action

Concurrency implication:

- because action-level loading is not tracked, overlapping manual probe/recheck calls can race
  and whichever response lands last wins for that permission/status map write

## Gate-State Coupling

Although this component does not render gate booleans directly, it is coupled to onboarding/runtime gating through store recomputation of:

- `requiredPermissionIds`
- `missingRequiredPermissions`
- `completedForManifest`
- `needsOnboarding`

Any successful probe/recheck can therefore change onboarding eligibility state used elsewhere.

## Testing Coverage Notes

Current frontend test coverage is indirect:

- dashboard/app tests verify broader settings and app-surface mount paths
- no dedicated `PermissionControlCenter` component test currently asserts button disabled/loading/error/per-row action behavior

Recommended tests when changing this module:

1. bootstrap effect fires only when `bootstrapped` is false
2. global recheck button disables while `isLoading` true
3. per-row `Re-check` dispatches correct permission id
4. error row render/clear behavior

## Drift Hotspots

1. Removing bootstrap guard can repeatedly refetch manifest and produce noisy permission IPC traffic.
2. Switching global recheck from replace to merge semantics can preserve stale statuses for removed permissions.
3. Bypassing store-level recompute helpers can desync settings UI from onboarding gate decisions.
4. Hiding errors in component rendering can make failed probes appear as stale permission state.
5. Reintroducing request buttons without clarifying probe-vs-request intent can blur permission refresh semantics.

## Related Docs

- [Permission Store Gate-State and IPC Action Contract Reference](permission_store_gate_state_and_ipc_action_contract_reference.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [Permission Status Badge, Row Rendering, and Reason Visibility Reference](permission_status_badge_row_rendering_and_reason_visibility_reference.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)
