---
summary: "Public operations hub for WindieOS frontend packaging, local reinstall loops, bundled local-runtime packaging, release checks, and desktop validation."
read_when:
  - When changing public frontend packaging, bundled local-runtime packaging,
    local reinstall helpers, desktop release checks, or packaged-app validation.
  - When deciding whether an operations topic belongs in public frontend docs
    or private backend operations docs.
title: "Frontend Operations Hub"
---

# Frontend Operations Hub

Public operations docs cover contributor-facing desktop packaging and local
validation workflows. Private deployment, hosted auth, private deployment,
incident, runtime-config, and VM-runs operations live in private backend docs.

## Public Frontend Operations

| Area | Start docs | Main files |
| --- | --- | --- |
| Packaged desktop builds | [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md), [Packaged Desktop Builds](../install/packaged_desktop.md) | `frontend/package.json`, Electron Builder config, package scripts |
| Bundled local runtime | [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md) | `scripts/build-sidecar-runtime`, local-runtime Python files |
| Release packaging | [Release and Packaging Change Workflow](release_packaging_change_workflow.md), [Release Guide](release.md) | release workflows, package config, smoke scripts |
| Local reinstall loops | [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md) | `<windie> reinstall mac`, `<windie> reinstall linux`, `<windie> reinstall win` |
| Platform validation | [Platform Docs](../platforms/README.md), [Platform Validation Matrix](../platforms/platform_validation_matrix.md) | platform permission, window, screenshot, and packaging checks |

## Private Backend Operations

These topics are intentionally not public frontend docs:

- backend runtime configuration and provider environment policy
- hosted install auth operations
- backend incident triage and production evidence collection
- backend operational troubleshooting

Public docs may describe stable API contracts, SDK expectations, or high-level
runtime boundaries. Private backend docs own implementation runbooks and
operator procedures.

## Validation

For frontend operations changes, run the narrowest relevant checks:

- docs changes: `<windie> docs check`
- package config changes: frontend package/build checks
- local-runtime packaging changes: bundled local-runtime build plus focused
  local-runtime tests
- platform-specific package changes: target OS smoke checks

Record any skipped platform checks clearly when the current machine cannot run
that target.
