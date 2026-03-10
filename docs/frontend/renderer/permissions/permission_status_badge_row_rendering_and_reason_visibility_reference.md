---
summary: "Renderer permissions presentation contract for `PermissionRowMain` + `PermissionStatusBadge`: status-pill mapping, reason text visibility, and Control Center row rendering."
read_when:
  - When changing permission status label semantics or CSS class mapping in `permissionStatus.js`.
  - When changing permission row rendering in settings Data controls or any future permission surface.
title: "Permission Status Badge, Row Rendering, and Reason Visibility Reference"
---

# Permission Status Badge, Row Rendering, and Reason Visibility Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/components/PermissionRowMain.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionStatusBadge.jsx`
- `frontend/src/renderer/features/permissions/utils/permissionStatus.js`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/styles/CloneMemoryModels.css`

## Current Presentation Layer

`PermissionRowMain` is the base permission row used by `PermissionControlCenter`.

It can be reused by future permission surfaces without changing badge/reason semantics.

Row output shape:

- title (`permission.label`)
- access-kind line (`permission.access_kind` mapped through `permissionPresentation.js`)
- status badge (`PermissionStatusBadge`)
- description (`permission.description`)
- optional reason line when `status.reason` is non-empty

## Status Pill Mapping Contract

`PermissionStatusBadge` delegates to `getPermissionPill(status, permission)`:

- `granted` -> label depends on `permission.access_kind`:
  - `os_permission` -> `Granted`
  - `app_capability` -> `Enabled`
  - `resource_access` -> `Configured`
  - `runtime_check` -> `Ready`
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

## Reuse Boundary

`PermissionControlCenter` composes one row wrapper with a `Re-check` action and shared `PermissionRowMain` content.

As long as additional surfaces use `PermissionRowMain` + `PermissionStatusBadge`, status wording and reason visibility stay consistent.

`FrontendOnboardingSlideshow` reuses the same presentation metadata but renders action buttons from `permission.grant_action_label` instead of hard-coding `Grant` vs `Enable`.

## Drift Hotspots

1. Changing status keywords from main/permission service/store without updating `getPermissionPill`.
2. Adding new `access_kind` values without extending `permissionPresentation.js` and granted-label mapping.
3. Diverging control-center vs future permission-surface row composition without shared `PermissionRowMain`.
4. Renaming CSS class tokens (`permission-pill`, `permission-row-reason`, `permission-row-kind`) without style updates.

## Coverage Notes

Current frontend tests cover permission store and IPC/service behavior.

Direct unit coverage for `PermissionStatusBadge` and `PermissionRowMain` rendering permutations is currently absent.

## Related Pages

- [Renderer Permissions Docs Hub](README.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
