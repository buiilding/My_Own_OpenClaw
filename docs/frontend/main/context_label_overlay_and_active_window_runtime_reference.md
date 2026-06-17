---
summary: "Frontend main/runtime reference for the removed context-label renderer route and retained dormant main-process window orchestration hooks."
read_when:
  - When changing retained context-label positioning helpers or visibility gates in main process overlay code.
  - When removing dormant context-label main-process helper wiring.
title: "Context Label Overlay and Active-Window Runtime Reference"
---

# Context Label Overlay and Active-Window Runtime Reference

## Canonical Modules

- `frontend/src/main/index.cjs`
- `frontend/src/renderer/app/main.jsx`

## Current Runtime Status

Context-label overlay logic is currently a dormant main-process helper shell,
not an active renderer feature.

Current behavior in tree:

- no `view=chatbox-context-label` renderer route exists
- no context-label renderer app or component exists
- no active-window polling helper is used by renderer
- main process still keeps context-label visibility/position helper functions and constants
- no `createContextLabelWindow()` flow is currently wired during `app.whenReady()`

Result: no active context-label overlay content is shown at runtime.

## View Routing

Renderer routing in `frontend/src/renderer/app/main.jsx` does not include a
context-label view. A window loaded with `view=chatbox-context-label` falls back
to the default app route, so main process should not create that window unless a
new renderer app is restored in the same change.

## Main-Process Retained Hooks

`frontend/src/main/index.cjs` retains context-label constants and helper flow:

- sizing constants (`CONTEXT_LABEL_WIDTH`, `CONTEXT_LABEL_HEIGHT`)
- position math via `getOverlayContextLabelWindowBounds(...)`
- visibility gate via `syncContextLabelWindowVisibility()`
- z-order helper via `ensureContextLabelWindowOnTop()`

Guard behavior is defensive:

- every helper early-returns when `contextLabelWindow` is `null` or destroyed
- visibility sync is called from chat/response overlay transitions

These hooks currently operate as dormant guards because context-label window is
not instantiated and no renderer route exists for it.

## Overlay Visibility Coupling

Even in dormant mode, main process preserves coupling points:

- chat show/hide path calls `syncContextLabelWindowVisibility()`
- response-overlay visibility transitions call `syncContextLabelWindowVisibility()`
- `broadcastResponseOverlayVisibility(...)` includes context-label window in renderer broadcast target list when window exists

This keeps re-enable path low-friction if window creation is restored later.

## Reactivation Checklist

If re-enabling context-label UI:

1. restore/create context-label BrowserWindow lifecycle in `index.cjs`
2. add a renderer app/component route for the label surface
3. reintroduce renderer active-window state resolution (poll + normalization)
4. wire channel contracts for overlay visibility and optional system-state polling cadence
5. add/restore frontend tests for label render, overlay hide behavior, and fallback/offline state

## Drift Hotspots

1. Re-enabling renderer polling without main window lifecycle wiring creates invisible work and IPC noise.
2. Re-introducing context-label window without overlay visibility gating can overlap response overlay phases.
