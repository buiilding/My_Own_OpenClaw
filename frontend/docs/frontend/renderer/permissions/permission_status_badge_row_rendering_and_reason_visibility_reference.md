---
summary: "Renderer permissions presentation contract for `PermissionStatusBadge`: status-pill label and CSS class mapping used by live settings permission rows."
read_when:
  - When changing permission status label semantics or CSS class mapping in `desktopPermissionPresentationRuntime.js`.
  - When changing Browser settings permission status rendering, onboarding
    reason/remediation text, or any future permission surface.
title: "Permission Status Badge Rendering Reference"
---

# Permission Status Badge Rendering Reference

## Canonical Modules

- `frontend/src/renderer/features/permissions/components/PermissionStatusBadge.jsx`
- `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`
- `frontend/src/renderer/features/dashboard/components/sections/settings/BrowserSettingsTab.jsx`
- `frontend/src/renderer/styles/DashboardPanelSurfaces.css`

## Current Presentation Layer

`PermissionStatusBadge` is the shared live badge component for permission
status labels. The current mounted consumer is `BrowserSettingsTab`, which shows
the Browser automation permission state without mounting the retired full
permission control center.

## Status Pill Mapping Contract

`PermissionStatusBadge` delegates to
`DesktopPermissionPresentationRuntime.getPermissionPill(status, permission)`.
The status input may be either the status string or the full permission status
object; `DesktopPermissionPresentationRuntime` owns extracting and trimming
the status value.

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

`DesktopPermissionPresentationRuntime` owns access-kind labels, granted
labels, action-label defaults, granted-status normalization, and status-pill
mapping so onboarding and settings do not import utility paths from each
other's feature folders.

It also owns permission status detail presentation:

- `reason` is trimmed from `status.reason` and hidden when empty
- `statusClassName` is `status-<status>` with `status-unknown` fallback
- `remediation` is trimmed from `status.details.remediation` and hidden when
  empty

Onboarding slides and browser settings consume
`DesktopPermissionPresentationRuntime.getPermissionStatusDetailsPresentation(...)`
and pass full status objects to
badge/detail helpers instead of reading raw status detail or status-value
fields directly.

## Drift Hotspots

1. Changing status keywords from main/permission service/store without updating
   `DesktopPermissionPresentationRuntime.getPermissionPill`.
2. Adding new `access_kind` values without extending
   `DesktopPermissionPresentationRuntime` mappings.
3. Recreating badge label/class mapping directly in a settings or onboarding component.
4. Recreating reason/remediation trimming or status CSS class construction
   directly in a settings or onboarding component.
5. Renaming CSS class tokens (`permission-pill`, `status-*`) without style updates.

## Coverage Notes

`tests/frontend/PermissionPresentationRuntime.test.jsx` covers access-kind
labels, action-label fallback, granted-status normalization, pill mapping,
status detail presentation, and the `PermissionStatusBadge` rendering contract.

## Related Pages

- [Renderer Permissions Docs Hub](README.md)
- [Permission Onboarding Gate and Manifest Version Runtime Reference](permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
