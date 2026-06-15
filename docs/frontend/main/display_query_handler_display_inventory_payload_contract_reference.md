---
summary: "Deep reference for Electron main display inventory payload shaping used by `get-displays`: label format, primary-display marking, and IPC window-control registration boundary."
read_when:
  - When changing `get-displays` IPC payload shape or display metadata fields consumed by renderer settings/window placement flows.
  - When debugging mismatches between Electron `screen` display data and renderer-visible display selector labels.
title: "Display Query Handler Display Inventory Payload Contract Reference"
---

# Display Query Handler Display Inventory Payload Contract Reference

## Canonical Modules

- `frontend/src/main/surfaces/display_query_handler.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/index.cjs`
- `tests/frontend/DisplayQueryHandler.test.cjs`

## IPC Entry Path

`initializeWindowControlHandlersRuntime(...)` registers:

- `ipcMain.handle('get-displays', async () => handleGetDisplays({ screen }))`

This keeps display payload mapping in one pure helper (`handleGetDisplays`) and main-process IPC ownership in `window_controls_ipc_runtime.cjs`.

## Payload Mapping Contract (`handleGetDisplays`)

Inputs:

- `screen.getAllDisplays()`
- `screen.getPrimaryDisplay().id`

Output shape per display:

- `id`
- `label`
- `isPrimary`
- `bounds`
- `scaleFactor`

Label format is stable and positional:

- ``Display ${index + 1} (${display.size.width}x${display.size.height})``

Primary flag contract:

- `isPrimary = (display.id === primaryDisplayId)`

No additional wrapping envelope is added by the handler; IPC returns the mapped array directly.

## Field Semantics

`id`:

- forwarded from Electron display id, used as stable selection key

`label`:

- human-readable renderer-facing label
- tied to display order returned by `getAllDisplays()`

`bounds`:

- raw Electron bounds object (`x`, `y`, `width`, `height`)
- used by window-placement codepaths to target specific monitors

`scaleFactor`:

- raw display scale factor for DPI-aware rendering/placement logic

## Empty-State Behavior

When `screen.getAllDisplays()` returns `[]`:

- handler returns `[]`
- no throw/fallback synthetic display entry

## Test-Backed Invariants

`tests/frontend/DisplayQueryHandler.test.cjs` locks:

- deterministic label format (`Display N (WxH)`)
- primary marker correctness for non-first displays
- pass-through of `bounds` + `scaleFactor`
- empty-list passthrough behavior

## Drift Hotspots

1. Changing label format can break renderer display pickers that rely on stable wording.
2. Reordering displays before mapping changes `Display N` numbering and can create UX mismatch with OS monitor ordering.
3. Wrapping the result in `{ success, data }` in this helper (instead of at IPC caller boundary) would break current invoke-call expectations.

## Related Docs

- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Electron Main and IPC](electron_main_and_ipc.md)
- [IPC Channel and Handler Reference](../contracts/ipc_channel_and_handler_reference.md)
