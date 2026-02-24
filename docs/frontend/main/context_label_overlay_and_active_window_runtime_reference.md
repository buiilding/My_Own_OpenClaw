---
summary: "Frontend main/runtime reference for the context-label overlay window: Electron lifecycle, renderer view wiring, active-window polling, and response-overlay visibility gates."
read_when:
  - When changing `chatbox-context-label` window creation, positioning, or visibility rules.
  - When debugging active-window label drift between sidecar system-state reads and overlay rendering.
title: "Context Label Overlay and Active-Window Runtime Reference"
---

# Context Label Overlay and Active-Window Runtime Reference

## Canonical Modules

- `frontend/src/main/index.cjs`
- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/ChatBoxContextLabelApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxContextLabel.jsx`
- `frontend/src/renderer/features/chat/utils/activeWindowContext.js`
- `frontend/src/renderer/styles/ChatBox.css`

## Purpose and Boundary

The context-label overlay is a separate always-on-top transparent Electron window that displays a short active-app label above the chatbox.

It is intentionally split from the chatbox and response windows so main process can:

- position it independently
- hide it whenever response overlay is visible
- keep it click-through compatible with chat overlay behavior

## View Routing and App Composition

Renderer entry (`frontend/src/renderer/app/main.jsx`) selects root component by `view` query param.

`view=chatbox-context-label` maps to `ChatBoxContextLabelApp`.

`ChatBoxContextLabelApp` wraps `ChatBoxContextLabel` in:

- `ErrorBoundary`
- `AppProvider`
- `ChatProvider(enableToolRunner=false, enableTranscript=false)`

This keeps context-label window lightweight and avoids tool-runner/transcript overhead.

## Main-Process Window Lifecycle

`createContextLabelWindow()` in `frontend/src/main/index.cjs` creates a dedicated overlay window with:

- fixed size constants:
  - `CONTEXT_LABEL_WIDTH = 280`
  - `CONTEXT_LABEL_HEIGHT = 26`
- transparent, frameless, always-on-top toolbar window
- preload boundary enabled (`../preload.js`)
- view target `chatbox-context-label`

Positioning behavior:

- anchored to chatbox via `getContextLabelWindowBounds()`
- x-offset constant `CONTEXT_LABEL_OFFSET_X`
- vertical placement above chatbox using `CONTEXT_LABEL_GAP_ABOVE_CHATBOX`
- re-positioned on chat move/resize and display metric changes

Close behavior:

- close is intercepted unless `app.isQuitting`
- window hides instead of being destroyed

## Visibility Control Model

Main-process visibility source of truth is `syncContextLabelWindowVisibility()`.

Label window shows only when:

- chat window exists and is visible
- `responseOverlayVisible` is `false`

Label window hides when:

- chat overlay hidden
- response overlay becomes visible
- response overlay enters streaming/tool phases

Main process also broadcasts `response-overlay-visibility` to all renderer windows (including context label window).

Renderer-level guard in `ChatBoxContextLabel` adds a second safety layer:

- subscribes to `ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY`
- returns `null` when overlay visibility payload is `true`

This dual guard prevents stale label render during fast overlay phase transitions.

## Active-Window Data Pipeline

`ChatBoxContextLabel` polls `INVOKE_CHANNELS.GET_SYSTEM_STATE` every 5000ms with fields:

- `active_window`

Pipeline:

1. invoke `get-system-state`
2. normalize label with `resolveActiveWindowContext(...)`
3. render compact text + aria label + full title tooltip

Status model:

- `fresh`: successful read path
- `offline`: initial fetch failures before any successful sample

Resilience behavior:

- `hasSuccessfulContextRef` tracks whether at least one successful read occurred
- after first success, transient poll failures keep status as `fresh` with fallback label

## Label Normalization Rules

`resolveActiveWindowContext(...)` maps raw titles to concise categories.

Predefined pattern buckets include:

- browsers (`Chrome`, `Edge`, `Firefox`, etc.)
- editors (`VS Code`, `Cursor`, `Windsurf`, generic `Code`)
- terminal shells (`Terminal`)
- communication (`Chat`, `Mail`)
- docs/design apps

Fallback behavior:

- split title by separators (` - `, ` | `, ` : `)
- prefer final segment
- truncate to max 26 chars with ellipsis
- derive two-letter icon code from sanitized text

## Styling Contract

`ChatBox.css` class `.chatbox-floating-context` controls rendering:

- fixed top-left placement within context-label window
- single-line ellipsis clipping (`max-width: 260px`)
- selectable text with tooltip fallback for full label
- `is-offline` modifier switches to warning color

## Critical Couplings

Keep these aligned together:

1. `index.cjs` context-label window creation + visibility calls
2. renderer `view=chatbox-context-label` route in `app/main.jsx`
3. `ChatBoxContextLabel` subscription to `response-overlay-visibility`
4. preload + channel constants for `get-system-state` and `response-overlay-visibility`

## Test Coverage Anchors

- `tests/frontend/ChatBoxContextLabel.test.jsx`
  - renders mapped label (`VS Code`)
  - hides on `response-overlay-visibility` event
- `tests/frontend/OverlayPhaseListener.test.js`
  - verifies overlay phase subscription/unsubscribe wrapper behavior

## Debug Checklist

If context label never appears:

1. verify `createContextLabelWindow()` is called in `app.whenReady()`
2. verify renderer view route includes `chatbox-context-label`
3. verify chat window is visible and `responseOverlayVisible === false`

If label text is stale/wrong:

1. verify `get-system-state` invoke returns `active_window`
2. inspect `resolveActiveWindowContext(...)` rule matching order
3. verify poll interval timer still active (not unmounted)

If flicker happens during response streaming:

1. inspect `response-overlay-visibility` broadcast timing in `index.cjs`
2. verify both main-process hide and renderer `return null` guard remain intact
