---
summary: "Deep reference for renderer permission state surfaces: manifest/status bootstrap, required-now evaluation, onboarding completion persistence, and Data-controls status checks."
read_when:
  - When changing onboarding gate logic in `App.jsx` or `permissionStore`.
  - When changing permission request/re-check flows in onboarding wizard or settings Data controls tab.
title: "Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference"
---

# Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/onboarding/components/FrontendOnboardingSlideshow.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionRowMain.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionStatusBadge.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/permissions/utils/permissionStatus.js`
- `frontend/src/renderer/features/permissions/utils/permissionStorage.js`
- `tests/frontend/FrontendOnboardingSlideshow.test.jsx`
- `tests/frontend/AppPermissionGate.test.jsx`

## Startup Behavior (`App.jsx`)

`AppContent` now enforces a renderer permission gate before shell render in non-VM mode.

- startup routes between VM dashboard mode and `permissionStore.needsOnboarding`
- permission onboarding is a startup blocker for dashboard/chat shell access until current-platform required permissions are granted

## Store State Model

`usePermissionStore` owns these gate-critical fields:

- manifest metadata: `manifestVersion`, `generatedAt`
- permission snapshot: `permissions`, `statusesByPermissionId`
- gate derivation outputs:
  - `requiredPermissionIds`
  - `missingRequiredPermissions`
  - `needsOnboarding`
  - `completedForManifest`
- local persistence snapshot: `onboardingState`

`resolveGateState(...)` computes whether onboarding is required.

Gate is true when any condition fails:

- onboarding completion manifest version does not match current manifest version
- any current-platform `required_now` permission is not granted

## IPC Actions and Store Mutations

Store actions call typed invoke channels:

- `LIST_PERMISSIONS` during bootstrap
- `RUN_PERMISSION_PROBE` for one permission
- `CHECK_PERMISSIONS` for batch re-check

Response normalization:

- status arrays map into `statusesByPermissionId`
- each status keeps `{ status, granted, reason, checked_at, details }`
- gate state recalculates after each mutation path

## Onboarding Persistence Contract

`permissionStorage.js` localStorage key:

- `windieos-permission-onboarding`

Persisted fields:

- `manifest_version`
- `completed`
- `completed_at`

`completeOnboarding()` guardrails:

- requires non-empty manifest version
- requires zero `missingRequiredPermissions`

When satisfied:

- writes persisted completion snapshot
- recalculates gate state (which should clear onboarding)

## UI Surface Split

### Onboarding Slideshow

`FrontendOnboardingSlideshow` renders:

- permission list with `Grant` actions on the first slide
- stop-agent shortcut instructions on the second slide
- final `Start WindieOS` CTA disabled until required permissions are all granted

### Settings Data Controls

`SettingsSection` routes `data-controls` tab to `PermissionControlCenter`.

`PermissionControlCenter` provides runtime monitoring/maintenance:

- per-permission status pills + reason text
- per-permission `Re-check`
- global `Re-run checks`

This shares store state/actions with onboarding flow, so both surfaces stay consistent.

## Error Handling

Store keeps last user-visible error in `error` field.

Failure modes surface as inline text in onboarding/control-center rather than throwing UI-level crashes.

Examples:

- manifest fetch failure (`bootstrapPermissions`)
- malformed channel response for probe/request/check
- onboarding completion guard violations

## Drift Hotspots

1. Changing permission manifest schema without updating store mapping/evaluation fields.
2. Forgetting to recompute gate state after status or onboarding-state writes.
3. Diverging onboarding and settings permission actions into separate stores.
4. Changing storage key/shape without compatibility handling for existing local state.

## Related Pages

- [Renderer Permissions Docs Hub](README.md)
- [Permission Status Badge, Row Rendering, and Reason Visibility Reference](permission_status_badge_row_rendering_and_reason_visibility_reference.md)
- [Renderer Settings Sections Docs Hub](../settings/sections/README.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](../../contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md)
