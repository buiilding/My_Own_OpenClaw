---
summary: "Frontend main/runtime reference for the context-label overlay shell: retained main-process window orchestration hooks, renderer route wiring, and current no-op label component status."
read_when:
  - When changing `chatbox-context-label` window lifecycle, positioning helpers, or visibility gates in main process overlay code.
  - When re-enabling active-window label rendering in `ChatBoxContextLabel` and related renderer IPC/system-state flows.
title: "Context Label Overlay and Active-Window Runtime Reference"
---

# Context Label Overlay and Active-Window Runtime Reference

## Canonical Modules

- `frontend/src/main/index.cjs`
- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/ChatBoxContextLabelApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxContextLabel.jsx`

## Current Runtime Status

Context-label overlay logic is currently a retained shell, not an active feature.

Current behavior in tree:

- `ChatBoxContextLabel` returns `null` (no rendered label UI)
- no active-window polling helper is used by renderer
- no `activeWindowContext` utility module exists in current chat utils
- main process still keeps context-label visibility/position helper functions and constants
- no `createContextLabelWindow()` flow is currently wired during `app.whenReady()`

Result: no active context-label overlay content is shown at runtime.

## View Routing

Renderer routing in `frontend/src/renderer/app/main.jsx` still maps:

- `view=chatbox-context-label` -> `ChatBoxContextLabelApp`

`ChatBoxContextLabelApp` still wraps the component in:

- `ErrorBoundary`
- `AppProvider`
- `ChatProvider(enableToolRunner=false, enableTranscript=false)`

This preserves route compatibility, but with current component no-op output.

## Main-Process Retained Hooks

`frontend/src/main/index.cjs` retains context-label constants and helper flow:

- sizing constants (`CONTEXT_LABEL_WIDTH`, `CONTEXT_LABEL_HEIGHT`)
- position math via `getOverlayContextLabelWindowBounds(...)`
- visibility gate via `syncContextLabelWindowVisibility()`
- z-order helper via `ensureContextLabelWindowOnTop()`

Guard behavior is defensive:

- every helper early-returns when `contextLabelWindow` is `null` or destroyed
- visibility sync is called from chat/response overlay transitions

These hooks currently operate as dormant guards because context-label window is not instantiated.

## Overlay Visibility Coupling

Even in dormant mode, main process preserves coupling points:

- chat show/hide path calls `syncContextLabelWindowVisibility()`
- response-overlay visibility transitions call `syncContextLabelWindowVisibility()`
- `broadcastResponseOverlayVisibility(...)` includes context-label window in renderer broadcast target list when window exists

This keeps re-enable path low-friction if window creation is restored later.

## Reactivation Checklist

If re-enabling context-label UI:

1. restore/create context-label BrowserWindow lifecycle in `index.cjs`
2. reintroduce renderer active-window state resolution (poll + normalization)
3. wire channel contracts for overlay visibility and optional system-state polling cadence
4. add/restore frontend tests for label render, overlay hide behavior, and fallback/offline state

## Drift Hotspots

1. Doc/runtime mismatch if docs assume active label rendering while component remains no-op.
2. Re-enabling renderer polling without main window lifecycle wiring creates invisible work and IPC noise.
3. Re-introducing context-label window without overlay visibility gating can overlap response overlay phases.
