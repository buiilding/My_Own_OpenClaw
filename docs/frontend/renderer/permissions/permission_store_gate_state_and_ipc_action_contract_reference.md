---
summary: "Deep reference for renderer `permissionStore` runtime: state normalization, gate derivation rules, IPC action semantics, and onboarding-state persistence behavior."
read_when:
  - When changing `permissionStore.js` state fields, gate formulas, or IPC action handlers.
  - When debugging why `needsOnboarding` or missing-required permission state changed unexpectedly after probe/recheck/request actions.
title: "Permission Store Gate-State and IPC Action Contract Reference"
---

# Permission Store Gate-State and IPC Action Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/permissions/utils/permissionStorage.js`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/main/permission_service.cjs`
- `frontend/src/main/index.cjs`
- `tests/frontend/PermissionStorage.test.js`
- `tests/frontend/PermissionService.test.cjs`

## Store State Surface

`usePermissionStore` owns:

- manifest metadata: `manifestVersion`, `generatedAt`
- manifest snapshot: `permissions`
- normalized status index: `statusesByPermissionId`
- gate derivation outputs:
  - `requiredPermissionIds`
  - `missingRequiredPermissions`
  - `needsOnboarding`
  - `completedForManifest`
- lifecycle/error fields: `isLoading`, `bootstrapped`, `error`
- persisted onboarding snapshot: `onboardingState`

Current runtime-consumer reality:

- active UI callers in current renderer runtime are `bootstrapPermissions`, `runPermissionProbe`,
  and `recheckAllPermissions` (via `PermissionControlCenter`)
- `requestPermission` and `completeOnboarding` remain exported
  but have no active renderer caller in current code paths

## Status Normalization Contract

`mapStatusesByPermissionId(statuses)` fail-closes malformed payloads and returns an id-indexed map.

Per-status normalization:

- requires string `permission_id`; entries without id are dropped
- `status` defaults to `unknown`
- `granted` is strict `=== true`
- `reason` defaults to empty string
- `checked_at` keeps string value or `null`
- `details` keeps object payload or defaults to `{}`

## Gate Derivation Formula

`resolveGateState(...)` computes onboarding/runtime gate state from:

- manifest `permissions`
- normalized statuses
- persisted onboarding state
- current `manifestVersion`

Algorithm:

1. `requiredPermissionIds = permissions.filter(required_now).map(permission_id)`
2. `missingRequiredPermissions = requiredPermissionIds` where status `granted !== true`
3. `completedForManifest = onboarding.manifest_version === manifestVersion && onboarding.completed === true`
4. `needsOnboarding = !completedForManifest || missingRequiredPermissions.length > 0`

## Shared Status-Update Helper

`buildStatusStateUpdate(currentState, statusPayload, options)` centralizes mutation semantics:

- `replace=true`: overwrite whole `statusesByPermissionId` with incoming normalized map
- default: merge incoming statuses onto existing map
- always recomputes gate fields via `resolveGateState(...)`
- clears `error` on successful mutation

Callers:

- `runPermissionProbe` (merge path)
- `requestPermission` (merge path)
- `recheckAllPermissions` (replace path)

## IPC Action Semantics

### `bootstrapPermissions`

- no-op when `isLoading` is already true
- sets loading state, invokes `LIST_PERMISSIONS`
- on success:
  - normalizes manifest + status payload
  - reloads `onboardingState` from localStorage
  - recomputes gate fields
  - sets `bootstrapped=true`
- on failure:
  - sets `bootstrapped=true` and `error`
  - clears `isLoading`

`bootstrapped=true` on failure is intentional so renderer surfaces can show error state instead of spinning indefinitely.

### `runPermissionProbe(permissionId)`

- invokes `RUN_PERMISSION_PROBE` for one id
- requires `{ success:true, data.status }` response shape
- merges normalized status and recomputes gate fields
- does not set or clear `isLoading`; action-level in-flight state is not tracked

### `requestPermission(permissionId)`

- invokes `REQUEST_PERMISSION` and then applies returned `data.status`
- shares merge/recompute semantics with probe path
- currently not called by `PermissionControlCenter` UI, but remains part of store/runtime contract
- does not set or clear `isLoading`

### `recheckAllPermissions`

- builds `permissionIds` from current manifest snapshot
- invokes `CHECK_PERMISSIONS` batch handler
- replaces entire status map with fresh normalized statuses
- does not set or clear `isLoading`; repeated clicks can trigger overlapping recheck requests

### `completeOnboarding()`

Guardrails:

- requires non-empty `manifestVersion`
- requires `missingRequiredPermissions.length === 0`

On success:

- writes completed onboarding snapshot with ISO `completed_at`
- recomputes gate fields
- returns `true`

On guard failure:

- sets user-facing `error`
- returns `false`

## Persistence Contract

`permissionStorage.js` uses localStorage key:

- `windieos-permission-onboarding`

`loadPermissionOnboardingState()` fail-closes malformed/missing values to:

- `manifest_version: ""`
- `completed: false`
- `completed_at: null`

## UI Coupling Boundary

- Renderer `App.jsx` startup is not permission-gated in current runtime.
- `PermissionControlCenter` mounts this store and uses probe/recheck actions.
- Store gate-state fields remain authoritative for any surfaces that still depend on onboarding state.
- Current renderer runtime has no mounted onboarding wizard component that consumes
  `needsOnboarding`, consent toggles, or `completeOnboarding()`.

## Test-Backed Notes

- `PermissionStorage.test.js` covers storage defaults, round-trip save/load, and malformed JSON fail-closed behavior.
- `PermissionService.test.cjs` covers main-process probe/request normalization contracts consumed by store actions.
- No dedicated `permissionStore` unit test currently verifies every state transition path end-to-end.

## Drift Hotspots

1. Changing manifest/status payload shape without updating `mapStatusesByPermissionId`.
2. Bypassing `buildStatusStateUpdate(...)` and forgetting gate recomputation.
3. Changing merge-vs-replace behavior can leave stale statuses for removed permissions.
4. Treating `requestPermission` as removed because current UI does not call it; store/main IPC contract still exposes it.

## Related Docs

- [Renderer Permissions Docs Hub](README.md)
- [Permission Control Center Probe and Recheck Store-Sync Runtime Reference](permission_control_center_probe_and_recheck_store_sync_runtime_reference.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)
