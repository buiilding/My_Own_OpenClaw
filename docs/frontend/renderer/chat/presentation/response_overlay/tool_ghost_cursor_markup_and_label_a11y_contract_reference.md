---
summary: "Deep reference for shared ToolGhostCursor markup contract: CSS class ownership, decorative-icon accessibility defaults, and label rendering invariants across response-overlay and debug-app surfaces."
read_when:
  - When changing `ToolGhostCursor.jsx` structure, class names, or SVG markup used by chat overlay and debug app ghost previews.
  - When debugging ghost-cursor visuals that break after CSS class renames or tool-label text not rendering in response-overlay previews.
title: "Tool Ghost Cursor Markup and Label A11y Contract Reference"
---

# Tool Ghost Cursor Markup and Label A11y Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`
- `tests/frontend/ChatBoxResponse.toolGhost.test.jsx`

## Component Boundary

`ToolGhostCursor` is a presentational-only component.

It receives one prop:

- `label`

It does not own timing, positioning, or animation state. Parent components control those via the surrounding `chatbox-tool-ghost-track` style/class contract.

## Markup Contract

Rendered structure:

1. root wrapper `.chatbox-tool-ghost-cursor-wrap` with `aria-hidden="true"`
2. ambient ring `.chatbox-tool-ghost-ring`
3. cursor icon wrapper `.chatbox-tool-ghost-cursor` containing fixed 24x24 SVG line/polyline shape
4. text bubble `.chatbox-tool-ghost-label` with raw `label` value

Class names are part of the styling contract with `ChatBoxResponseOverlay.css`.

## Accessibility Contract

- root wrapper is explicitly hidden from accessibility tree (`aria-hidden="true"`)
- nested SVG is also marked `aria-hidden="true"`
- user-visible accessible label for the overlay stays on parent container (`aria-label="Assistant tool action preview"` in `ChatBoxResponse`)

Implication:

- changing `aria-hidden` behavior here can duplicate narration or expose decorative cursor geometry to screen readers.

## Cross-Surface Reuse Contract

`ToolGhostCursor` is shared by:

- `ChatBoxResponse` tool-action preview overlay
- `ToolGhostDebugApp` animation sandbox

Expected outcome:

- cursor shape, ring, and label visuals stay identical between production overlay and debug harness.

## Test-Backed Signals

Indirect coverage exists via `ChatBoxResponse.toolGhost` tests:

- explanation text is rendered as visible label text (for click and scroll payloads)
- tool-action preview container appears/disappears with ghost lifecycle state

Direct unit tests for `ToolGhostCursor` alone are currently absent.

## Drift Hotspots

1. Renaming `.chatbox-tool-ghost-*` classes in JSX without CSS parity update breaks cursor styling silently.
2. Moving `aria-hidden` flags can create duplicate or noisy assistive announcements.
3. Replacing SVG geometry without preserving 24x24 viewbox/coordinates can desync cursor hit-shape from animation expectations.

## Related Pages

- [Renderer Chat Response-Overlay Presentation Docs Hub](README.md)
- [Auto-Resized Response Height ResizeObserver and Clamp Contract Reference](auto_resized_response_height_resizeobserver_and_clamp_contract_reference.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](../../../../overlays/tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
