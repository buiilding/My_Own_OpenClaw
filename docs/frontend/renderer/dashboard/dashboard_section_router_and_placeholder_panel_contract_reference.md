---
summary: "Deep reference for dashboard section routing contracts: section-id to component mapping, pass-through prop ownership, and procedural/usage placeholder panel behavior."
read_when:
  - When changing `DashboardContent` switch routing or adding/removing dashboard sections.
  - When replacing procedural or usage placeholder panels with real runtime-backed surfaces.
title: "Dashboard Section Router and Placeholder Panel Contract Reference"
---

# Dashboard Section Router and Placeholder Panel Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/DashboardContent.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SemanticMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ProceduralSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/UsageSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`

## Section Router Contract (`DashboardContent`)

`DashboardContent(sectionId, config, availableModels, onConfigChange, onSelectSection)` is a pure switch-router.

Section map:

- `episodic` -> `EpisodicMemorySection` (receives `onSelectSection`)
- `semantic` -> `SemanticMemorySection`
- `procedural` -> `ProceduralSection`
- `models` -> `ModelsSection` (receives `config`, `availableModels`, `onConfigChange`)
- `usage` -> `UsageSection`
- `settings` -> `SettingsSection` (receives `config`, `onConfigChange`)
- default -> generic "Select an area from the left." panel

No side effects are performed in the router itself.

## Prop Ownership Boundaries

- Memory-only navigation callback is scoped to episodic section.
- Config mutation callbacks are scoped to models/settings sections.
- Procedural/usage panels are static and consume no provider/store hooks.

This boundary keeps high-churn chat runtime state out of dashboard section router logic.

## Placeholder Panel Contract

`ProceduralSection` and `UsageSection` are currently static informational placeholders.

`ProceduralSection` guarantees:

- heading: `Procedural Memory`
- fixed guidance that `SKILLS.md` is not detected

`UsageSection` guarantees:

- heading: `Usage`
- static cards for weekly/session limits marked not configured

Both reuse `SettingsPanel.css` structural classes for layout consistency with settings/models panels.

## Expected Evolution Pattern

When replacing placeholders with live data:

1. keep section IDs stable (`procedural`, `usage`) to preserve sidebar routing
2. maintain pass-through ownership in `DashboardContent` (inject dependencies via props, not global singletons)
3. document added IPC/API side effects under this subhub and contracts docs

## Drift Hotspots

1. Renaming section IDs without matching sidebar caller updates breaks view selection silently.
2. Adding side effects inside `DashboardContent` can couple render path to network/storage behavior.
3. Replacing placeholder sections without preserving panel class structure can regress dashboard layout consistency.

## Related Pages

- [Renderer Dashboard Docs Hub](README.md)
- [Dashboard Memory Management and Resume Reference](../dashboard_memory_management_and_resume_reference.md)
- [Settings Section Display Selection and Config Toggle Reference](../settings/settings_section_display_selection_and_config_toggle_reference.md)
