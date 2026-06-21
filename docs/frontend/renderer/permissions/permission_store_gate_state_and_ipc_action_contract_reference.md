---
summary: "Deep reference for renderer `permissionStore` runtime: state normalization, gate derivation rules, permission runtime client action semantics, and onboarding-state persistence behavior."
read_when:
  - When changing `permissionStore.js` state fields, gate formulas, or IPC action handlers.
  - When debugging why `needsOnboarding` or missing-required permission state changed unexpectedly after probe/recheck/request actions.
title: "Permission Store Gate-State and IPC Action Contract Reference"
---

# Permission Store Gate-State and IPC Action Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/app/runtime/desktopPermissionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopPermissionOnboardingStorageRuntime.js`
- `frontend/src/renderer/features/onboarding/components/DesktopOnboardingSlideshow.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/BrowserSettingsTab.jsx`
- `frontend/src/main/permissions/permission_service.cjs`
- `frontend/src/main/index.cjs`
- `tests/frontend/PermissionStorage.test.js`
- `tests/frontend/PermissionService.test.cjs`

## Store State Surface

`usePermissionStore` owns:

- manifest metadata: `manifestVersion`, `generatedAt`
- manifest snapshot: `permissions`
  - each permission now includes presentation metadata such as `access_kind` and `grant_action_label`
- normalized status index: `statusesByPermissionId`
- gate derivation outputs:
  - `requiredPermissionIds`
  - `missingRequiredPermissions`
  - `needsOnboarding`
  - `completedForManifest`
- lifecycle/error fields: `isLoading`, `bootstrapped`, `error`
- persisted onboarding snapshot: `onboardingState`

Current runtime-consumer reality:

- active UI callers in current renderer runtime are `bootstrapPermissions`,
  `runPermissionProbe`, `requestPermission`, and `completeOnboarding`
- Browser settings uses focused permission probe/request paths for browser automation
- `completeOnboarding` remains exported for any future gate-completion surface

## Status Value Contract

`DesktopPermissionRuntimeClient.mapPermissionStatusesByPermissionId(statuses)`
is the runtime-client facade for fail-closing malformed payloads and returning
an id-indexed map. The permission store consumes that value map instead of
importing standalone status-normalization helpers or reading raw status payload
fields.

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
4. `needsOnboarding = !completedForManifest`

Important current manifest consequence:

- runtime checks such as `shell_execution` are no longer `required_now`
- `missingRequiredPermissions` still highlights real OS/resource setup gaps even though they no longer hard-block startup completion

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

## Permission Runtime Client Boundary

`permissionStore` owns renderer permission state only: manifest snapshot,
gate derivation, onboarding persistence, and user-facing errors. Desktop
transport, permission command result-envelope resolution, and raw status value
normalization are delegated to `DesktopPermissionRuntimeClient` methods.

Runtime client calls:

- `listPermissionManifest()`
- `runPermissionProbeStatus(permissionId)`
- `requestPermissionStatus(permissionId)`
- `checkPermissionStatuses(permissionIds)`

The runtime client keeps lower-level raw command helpers for the IPC channel
boundary, but store actions consume only manifest/status values, normalized
status maps, or runtime client-thrown errors.

The store should not import `IpcBridge`, channel constants, or desktop
permission channel names directly.

## Permission Action Semantics

### `bootstrapPermissions`

- no-op when `isLoading` is already true
- sets loading state, calls `DesktopPermissionRuntimeClient.listPermissionManifest()`
- on success:
  - normalizes manifest + status payload
  - reloads `onboardingState` from localStorage
  - recomputes gate fields
  - sets `bootstrapped=true`
- on failure:
  - sets `bootstrapped=true` and `error`
  - clears `isLoading`

`bootstrapped=true` on failure is intentional so renderer surfaces can show error state instead of spinning indefinitely.

Main-process runtime now performs async startup probes before returning the initial manifest snapshot.

### `runPermissionProbe(permissionId)`

- calls `DesktopPermissionRuntimeClient.runPermissionProbeStatus(permissionId)` for one id
- consumes the returned status value; `{ success, data.status, error }`
  envelope handling stays inside `DesktopPermissionRuntimeClient`
- merges normalized status and recomputes gate fields
- does not set or clear `isLoading`; action-level in-flight state is not tracked

### `requestPermission(permissionId)`

- calls `DesktopPermissionRuntimeClient.requestPermissionStatus(permissionId)` and then applies returned status value
- shares merge/recompute semantics with probe path
- does not set or clear `isLoading`

### `recheckAllPermissions`

- builds `permissionIds` from current manifest snapshot
- calls `DesktopPermissionRuntimeClient.checkPermissionStatuses(permissionIds)`
- replaces entire status map with fresh normalized statuses
- does not set or clear `isLoading`; repeated clicks can trigger overlapping recheck requests

### `completeOnboarding()`

Guardrails:

- requires non-empty `manifestVersion`

On success:

- writes completed onboarding snapshot with ISO `completed_at`
- recomputes gate fields
- returns `true`

On guard failure:

- sets user-facing `error`
- returns `false`

## Persistence Contract

`DesktopPermissionOnboardingStorageRuntime` owns the active localStorage key:

- `windieos-permission-onboarding`

Permission feature code and tests should go through the onboarding storage
runtime rather than importing renderer skin storage keys directly.

Retired `desktop-agent-permission-onboarding` state is not read or migrated.
That intentionally resets onboarding completion for installs that only have the
old namespace.

`DesktopPermissionOnboardingStorageRuntime.loadPermissionOnboardingState()`
fail-closes malformed/missing values to:

- `manifest_version: ""`
- `completed: false`
- `completed_at: null`

## UI Coupling Boundary

- Renderer `App.jsx` startup is onboarding-completion-gated in non-VM mode through `permissionStore.needsOnboarding`.
- `DesktopOnboardingSlideshow` uses the manifest presentation metadata plus `requestPermission()` / `completeOnboarding()` to drive startup gating.
- `BrowserSettingsTab` uses focused probe/request paths for Browser automation status and setup.
- Store gate-state fields remain authoritative for any surfaces that still depend on onboarding state.

## Test-Backed Notes

- `PermissionStorage.test.js` covers storage defaults, round-trip save/load, and malformed JSON fail-closed behavior.
- `PermissionService.test.cjs` covers async main-process probe/request normalization, workspace-access persistence, and Windows screen-capture verification contracts consumed by store actions.
- `permissionStore.test.js` covers focused gate/store transitions and guards the
  runtime-client IPC boundary.

## Drift Hotspots

1. Changing manifest/status payload shape without updating
   `DesktopPermissionRuntimeClient.mapPermissionStatusesByPermissionId`.
2. Bypassing `buildStatusStateUpdate(...)` and forgetting gate recomputation.
3. Changing merge-vs-replace behavior can leave stale statuses for removed permissions.
4. Treating `requestPermission` as removed because current UI does not call it; store/main IPC contract still exposes it.

## Related Docs

- [Renderer Permissions Docs Hub](README.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)
