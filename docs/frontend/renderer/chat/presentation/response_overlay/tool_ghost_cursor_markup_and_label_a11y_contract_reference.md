---
summary: "Deep reference for ToolGhostCursor markup contract: CSS class ownership, decorative-icon accessibility defaults, and debug-app label rendering invariants."
read_when:
  - When changing `ToolGhostCursor.jsx` structure, class names, or SVG markup used by the ghost debug app.
  - When debugging ghost-cursor visuals that break after CSS class renames or tool-label text not rendering in debug previews.
title: "Tool Ghost Cursor Markup and Label A11y Contract Reference"
---

# Tool Ghost Cursor Markup and Label A11y Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`

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
- user-visible accessible label stays on parent debug container (`aria-label="Ghost cursor debug animation"` in `ToolGhostDebugApp`)

Implication:

- changing `aria-hidden` behavior here can duplicate narration or expose decorative cursor geometry to screen readers.

## Cross-Surface Reuse Contract

`ToolGhostCursor` currently renders in:

- `ToolGhostDebugApp` animation sandbox only

Current runtime note:

- production `ChatBoxResponse` no longer renders ghost cursor preview layers.

## Test-Backed Signals

Dedicated automated coverage for `ToolGhostCursor` markup in current frontend tests is absent.

Closest adjacent coverage:

- `tests/frontend/ChatBoxResponse.state.test.jsx` verifies response-overlay state transitions, not ghost cursor markup.

## Drift Hotspots

1. Renaming `.chatbox-tool-ghost-*` classes in JSX without CSS parity update breaks cursor styling silently.
2. Moving `aria-hidden` flags can create duplicate or noisy assistive announcements.
3. Replacing SVG geometry without preserving 24x24 viewbox/coordinates can desync cursor shape from debug animation expectations.

## Related Pages

- [Renderer Chat Response-Overlay Presentation Docs Hub](README.md)
- [Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference](fixed_response_pill_height_scroll_and_visibility_rereport_contract_reference.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](../../../overlays/tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
