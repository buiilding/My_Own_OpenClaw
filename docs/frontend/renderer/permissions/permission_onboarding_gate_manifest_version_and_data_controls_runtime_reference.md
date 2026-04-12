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
- `frontend/src/renderer/features/onboarding/components/PermissionOnboardingSlide.jsx`
- `frontend/src/renderer/features/onboarding/hooks/useOnboardingPermissionActions.js`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionRowMain.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionStatusBadge.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/permissions/utils/permissionGrantEffects.js`
- `frontend/src/renderer/features/permissions/utils/permissionStatus.js`
- `frontend/src/renderer/features/permissions/utils/permissionStorage.js`
- `tests/frontend/FrontendOnboardingSlideshow.test.jsx`
- `tests/frontend/AppPermissionGate.test.jsx`
- `tests/frontend/permissionGrantEffects.test.js`

## Startup Behavior (`App.jsx`)

`AppContent` now enforces an onboarding-completion gate before shell render in non-VM mode.

- startup routes between VM dashboard mode and `permissionStore.needsOnboarding`
- onboarding blocks dashboard/chat shell access only until the current manifest has been acknowledged

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

The required set is onboarding-specific, not a raw copy of manifest `required_now`.
Renderer prefers `onboarding_required_now` when present so first-run flow can be
lighter on platforms where some rows are capability checks rather than true OS
permission prompts.

Gate is true when any condition fails:

- onboarding completion manifest version does not match current manifest version
- onboarding for the current manifest has not been completed

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
- does not require all `missingRequiredPermissions` to be cleared first

When satisfied:

- writes persisted completion snapshot
- recalculates gate state (which should clear onboarding)

## UI Surface Split

### Onboarding Slideshow

`FrontendOnboardingSlideshow` renders:

- one permission card per slide with a `Grant` action where applicable
- a final stop-agent shortcut slide after the permission sequence
- final `Start WindieOS` CTA enabled after permission status loads, with a warning if permissions remain missing

The slideshow uses only permissions where `show_in_onboarding !== false`.
Settings/Data controls still render the full permission list, including
settings-only/runtime-check rows hidden from first-run onboarding on
Windows/Linux.

macOS browser onboarding opens directly on the `browser_automation` slide.
There is no separate `app_management` onboarding step because WindieOS does not
have a reliable standalone App Management registration/probe path to gate on.

Permission request handling is split deliberately:

- `usePermissionStore.requestPermission()` remains the shared IPC-backed request primitive
- `useOnboardingPermissionActions()` owns onboarding-local request pending state
- `applyPermissionGrantEffects(...)` centralizes permission-specific post-grant renderer effects such as enabling `browser_automation_enabled`

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
5. Reintroducing permission-specific config side effects directly inside onboarding view components will make permission behavior harder to reuse or test.

## Related Pages

- [Renderer Permissions Docs Hub](README.md)
- [Permission Status Badge, Row Rendering, and Reason Visibility Reference](permission_status_badge_row_rendering_and_reason_visibility_reference.md)
- [Renderer Settings Sections Docs Hub](../settings/sections/README.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](../../contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md)
