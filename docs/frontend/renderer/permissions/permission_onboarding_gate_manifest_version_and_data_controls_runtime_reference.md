---
summary: "Deep reference for renderer permission onboarding: manifest/status bootstrap, required-now gate evaluation, consent persistence, and shared Data-controls permission center actions."
read_when:
  - When changing onboarding gate logic in `App.jsx` or `permissionStore`.
  - When changing permission request/re-check flows in onboarding wizard or settings Data controls tab.
title: "Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference"
---

# Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/permissions/components/PermissionOnboardingWizard.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/permissions/utils/permissionStorage.js`
- `frontend/src/renderer/styles/PermissionOnboarding.css`
- `tests/frontend/PermissionOnboardingWizard.test.jsx`

## Startup Gate Flow (`App.jsx`)

`AppContent` enforces permission bootstrap before dashboard/chat shell render:

1. if `!bootstrapped && !isLoading`, invoke `bootstrapPermissions()`
2. while loading, render permission loading card
3. if `needsOnboarding === true`, render `PermissionOnboardingWizard`
4. only render `ChatGptDashboardShell` after onboarding gate is satisfied

This gate is renderer-side and blocks normal UX surfaces until required permission criteria pass.

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
- any `required_now` permission is not granted
- planned-system-access disclosure consent is not set

## IPC Actions and Store Mutations

Store actions call typed invoke channels:

- `LIST_PERMISSIONS` during bootstrap
- `RUN_PERMISSION_PROBE` for one permission
- `REQUEST_PERMISSION` for one permission
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
- `planned_system_access_consent`
- `completed_at`

`completeOnboarding()` guardrails:

- requires non-empty manifest version
- requires planned-system-access consent `true`
- requires zero `missingRequiredPermissions`

When satisfied:

- writes persisted completion snapshot
- recalculates gate state (which should clear onboarding)

## UI Surface Split

### Onboarding Wizard

`PermissionOnboardingWizard` renders:

- required-now permission list with `Grant` + `Re-check`
- planned-system-access disclosure consent checkbox
- continue button disabled until:
  - required permissions all granted
  - consent checkbox true

### Settings Data Controls

`SettingsSection` routes `data-controls` tab to `PermissionControlCenter`.

`PermissionControlCenter` provides runtime monitoring/maintenance:

- per-permission status pills + reason text
- per-permission `Request` + `Re-check`
- global `Re-run checks`

This shares store state/actions with onboarding flow, so both surfaces stay consistent.

## Error Handling

Store keeps last user-visible error in `error` field.

Failure modes surface as inline text in wizard/control-center rather than throwing UI-level crashes.

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
- [Renderer Settings Sections Docs Hub](../settings/sections/README.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](../../main/permission_manifest_probe_and_request_ipc_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](../../contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md)
