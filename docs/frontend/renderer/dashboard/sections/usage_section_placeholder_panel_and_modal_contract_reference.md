---
summary: "Deep reference for UsageSection placeholder runtime: shell-owned modal routing, sidebar usage intent wiring, and present-day no-data/no-fetch contract."
read_when:
  - When changing `UsageSection.jsx` markup, CSS-class contract, or modal open/close behavior.
  - When wiring usage analytics data fetches so shell/sidebar intent and placeholder assumptions stay coherent.
title: "Usage Section Placeholder Panel and Modal Contract Reference"
---

# Usage Section Placeholder Panel and Modal Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/UsageSection.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/styles/DashboardPanelSurfaces.css`
- `tests/frontend/DashboardShell.test.jsx`

## Surface Ownership Contract

`UsageSection` is section-local UI only.

- no props accepted.
- no hooks/state/effects in the section component.
- no IPC or backend API calls from the section component.

Shell ownership:

- `usageOpen` boolean controls mount/unmount through `DashboardModal`.
- `openUsage()` closes all panels first, then opens usage modal.
- sidebar `Usage` nav item calls shell `onOpenUsage`.

Expected invariant:

- usage panel is mutually exclusive with `settings`, `models`, `memory`, and `search` surfaces.

## Markup and Class Contract

`UsageSection` renders the same panel scaffold classes used by model-style sections:

- root: `dashboard-panel-surface`
- header wrapper: `dashboard-panel-header`
- body wrapper: `dashboard-panel-body`
- placeholder body text: `dashboard-empty-state`

Rendered copy today:

- heading: `Usage`
- subtitle: `Track usage activity and limits.`
- empty state: `Usage insights will appear here.`

Because classes are shared, style changes in `DashboardPanelSurfaces.css` can alter usage panel appearance without touching `UsageSection.jsx`.

## Test-Backed Behavior

`tests/frontend/DashboardShell.test.jsx` covers user-intent routing:

- clicking sidebar `Usage` button opens usage modal.
- usage modal mount confirms wiring between sidebar product nav and shell panel state.

Coverage gap:

- no dedicated section-level test for exact placeholder text/class names.

## Extension Constraints for Future Usage Metrics

When replacing placeholder content with real usage telemetry:

1. keep `DashboardSidebar -> onOpenUsage -> usageOpen` wiring stable.
2. preserve modal exclusivity through `closeAllPanels()`.
3. if fetch logic is added, document ownership boundary (section-owned fetch vs shell-owned fetch).
4. add tests for loading/error/empty/data states before shipping non-placeholder behavior.

## Drift Hotspots

1. Adding internal section fetches without documenting ownership can duplicate shell-level state and regress modal close behavior.
2. Replacing shared classes without checking `DashboardPanelSurfaces.css` can unintentionally diverge panel styling from models/memory surfaces.
3. Removing `usageOpen` from shell exclusivity flow can leave stacked modals open.

## Related Pages

- [Dashboard Sections Docs Hub](README.md)
- [Dashboard Shell Modal Routing Contract Reference](../shell/dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](../shell/sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
