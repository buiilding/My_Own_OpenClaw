---
summary: "Renderer permissions presentation contract for `PermissionStatusBadge`: status-pill label and CSS class mapping used by live settings permission rows."
read_when:
  - When changing permission status label semantics or CSS class mapping in `desktopPermissionPresentationRuntime.js`.
  - When changing Browser settings permission status rendering or any future permission surface.
title: "Permission Status Badge Rendering Reference"
---

# Permission Status Badge Rendering Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/components/PermissionStatusBadge.jsx`
- `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`
- `frontend/src/renderer/features/dashboard/components/sections/settings/BrowserSettingsTab.jsx`
- `frontend/src/renderer/styles/CloneMemoryModels.css`

## Current Presentation Layer

`PermissionStatusBadge` is the shared live badge component for permission
status labels. The current mounted consumer is `BrowserSettingsTab`, which shows
the Browser automation permission state without mounting the retired full
permission control center.

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

## Reuse Boundary

Future permission surfaces should reuse `PermissionStatusBadge` rather than
recreating status keyword-to-label mappings.

`DesktopOnboardingSlideshow` reuses the same presentation metadata but renders
action buttons from `permission.grant_action_label` instead of hard-coding
`Grant` vs `Enable`.

`desktopPermissionPresentationRuntime.js` owns access-kind labels, granted
labels, action-label defaults, granted-status normalization, and status-pill
mapping so onboarding and settings do not import utility paths from each
other's feature folders.

## Drift Hotspots

1. Changing status keywords from main/permission service/store without updating `getPermissionPill`.
2. Adding new `access_kind` values without extending `desktopPermissionPresentationRuntime.js` mappings.
3. Recreating badge label/class mapping directly in a settings or onboarding component.
4. Renaming CSS class tokens (`permission-pill`) without style updates.

## Coverage Notes

`tests/frontend/PermissionPresentationRuntime.test.jsx` covers access-kind
labels, action-label fallback, granted-status normalization, pill mapping, and
the `PermissionStatusBadge` rendering contract.

## Related Pages

- [Renderer Permissions Docs Hub](README.md)
- [Permission Onboarding Gate and Manifest Version Runtime Reference](permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
