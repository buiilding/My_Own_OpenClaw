---
summary: "Deep reference for the ChatGPT-style dashboard shell: conversation-first main surface, modal panel routing for memory/models/settings, and main-process open-target event handling."
read_when:
  - When changing `ChatGptDashboardShell` navigation, modal behavior, or open-target IPC handling.
  - When changing which dashboard sections render in modals versus the main conversation surface.
title: "Dashboard Shell Modal Routing Contract Reference"
---

# Dashboard Shell Modal Routing Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SemanticMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`

## Main Surface Contract

The main dashboard surface is conversation-only:

- `ChatInterface` is always mounted in the main content area.
- memory/models/settings no longer replace the main route.
- auxiliary panels open as modals over the conversation surface.
- shell visuals follow the `chatgpt-website-clone` language: `#212121` main frame, `#171717` grouped left sidebar, and collapsed-sidebar toggle mode.
- shell navigation uses the same lucide icon set semantics as the clone (`new chat`, `search`, `memory`, `models`, etc.) rather than custom dashboard glyphs.
- sidebar `New chat` dispatches a renderer event (`windie:new-chat`) consumed by `ChatInterface` to reset conversation state, so the main-header duplicate new-chat button is not required.

## Modal Routing Contract

`ChatGptDashboardShell` owns three modal booleans:

- `memoryOpen`
- `modelsOpen`
- `settingsOpen`

Opening one panel closes the others (`closeAllPanels`) to avoid stacked overlays.

Modal visual contract:

- overlay and panel styling match the clone dark dialog treatment (`#2F2F2F` panel, dim backdrop).
- shell does not inject an extra modal-header close icon; close behavior is backdrop/escape or section-level controls.

Memory modal includes local tab routing:

- `episodic` -> `EpisodicMemorySection`
- `semantic` -> `SemanticMemorySection`

## External Open-Target Contract

Main process may emit `main-window-open-target` with payload:

- `{ target: 'chat' }`
- `{ target: 'settings' }`
- `{ target: 'models' }`
- `{ target: 'memory' }`

Renderer behavior:

- chat target closes any open dashboard modal panel
- settings target opens settings modal
- models target opens models modal
- memory target opens memory modal (episodic tab default)

## Ownership Boundaries

- config mutation remains in existing section components (`ModelsSection`, `SettingsSection`) via `onConfigChange`.
- chat runtime state remains in `ChatInterface`/chat store; modal shell does not mutate chat stream state directly.
- memory resume flow remains implemented in `EpisodicMemorySection`.

## Drift Hotspots

1. Adding a new open target without updating both preload allowlist and renderer channel constants.
2. Routing a panel into main content instead of modal can violate conversation-first dashboard contract.
3. Opening multiple modals at once without close-all behavior causes stacked overlay regressions.

## Related Pages

- [Renderer Dashboard Docs Hub](README.md)
- [Settings Section Display Selection and Config Toggle Reference](../settings/settings_section_display_selection_and_config_toggle_reference.md)
- [Window and Overlay Lifecycle](../../main/window_and_overlay_lifecycle.md)
