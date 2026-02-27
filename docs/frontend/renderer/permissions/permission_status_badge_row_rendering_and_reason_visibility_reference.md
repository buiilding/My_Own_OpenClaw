---
summary: "Renderer permissions presentation contract for `PermissionRowMain` + `PermissionStatusBadge`: status-pill mapping, reason text visibility, and onboarding/control-center shared row rendering."
read_when:
  - When changing permission status label semantics or CSS class mapping in `permissionStatus.js`.
  - When changing onboarding or settings data-controls permission row rendering.
title: "Permission Status Badge, Row Rendering, and Reason Visibility Reference"
---

# Permission Status Badge, Row Rendering, and Reason Visibility Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/components/PermissionRowMain.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionStatusBadge.jsx`
- `frontend/src/renderer/features/permissions/utils/permissionStatus.js`
- `frontend/src/renderer/features/permissions/components/PermissionOnboardingWizard.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/styles/PermissionOnboarding.css`

## Shared Presentation Layer

`PermissionRowMain` is the shared base row used by both:

- onboarding wizard required-permission list
- settings data-controls permission list

Row output shape:

- title (`permission.label`)
- status badge (`PermissionStatusBadge`)
- description (`permission.description`)
- optional reason line when `status.reason` is non-empty

## Status Pill Mapping Contract

`PermissionStatusBadge` delegates to `getPermissionPill(status)`:

- `granted` -> label `Granted`, class `granted`
- `needs-action` -> label `Needs action`, class `warning`
- `unsupported` -> label `Unsupported`, class `warning`
- any other value -> label `Not checked`, no extra class

Badge class contract:

- rendered class always includes base `permission-pill`
- optional style class appended from mapping result

This mapping is the canonical renderer label/style contract for permission states.

## Reason Visibility Contract

`PermissionRowMain` shows reason text only when:

- `status?.reason` exists and is truthy

Reason is rendered as:

- `<p className="permission-row-reason">...</p>`

If reason missing/empty, no reason node is rendered.

## Reuse Boundaries Across Surfaces

`PermissionOnboardingWizard` and `PermissionControlCenter` both compose:

- one row wrapper with surface-specific action buttons
- the same `PermissionRowMain` core content for title/status/description/reason

This keeps status wording and reason visibility consistent across onboarding and settings flows.

## Drift Hotspots

1. Changing status keywords from main/permission service/store without updating `getPermissionPill`.
2. Adding new status values but leaving them to default `Not checked`.
3. Diverging onboarding vs control-center row composition without shared `PermissionRowMain`.
4. Renaming CSS class tokens (`permission-pill`, `permission-row-reason`) without style updates.

## Coverage Notes

Current frontend tests cover onboarding gate/button flow and store interactions.

Direct unit coverage for `PermissionStatusBadge` and `PermissionRowMain` rendering permutations is currently absent.

## Related Pages

- [Renderer Permissions Docs Hub](README.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
