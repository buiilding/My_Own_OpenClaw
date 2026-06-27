---
summary: "Local-runtime system-state reference for capture fields, per-field fallback defaults, platform-specific probes, Electron/renderer `get-system-state` integration semantics, and the removed `local_runtime_bridge.getSystemState` export."
read_when:
  - When adding/removing system-state fields or changing per-field fallback/default values.
  - When debugging active-window/mouse/screen/windows/stats drift across the local-runtime Python implementation, main-process bridge, and renderer consumers.
  - When resolving removed `local_runtime_bridge.getSystemState` or `getSystemState` export references.
title: "System-State Collection and Removed getSystemState Bridge Export Reference"
---

# System-State Collection and Platform Adapter Reference

## Canonical Modules

- `frontend/src/main/python/core/system_state.py`
- `frontend/src/main/python/core/platform/window_manager.py`
- `frontend/src/main/python/core/platform/windows.py`
- `frontend/src/main/python/core/platform/macos.py`
- `frontend/src/main/python/core/platform/linux.py`
- `frontend/src/main/python/core/system_metrics.py`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/ipc.cjs`

## End-to-End Path

1. a renderer or Electron-main consumer invokes `get-system-state` through Electron IPC.
2. Electron main (`ipcMain.handle('get-system-state')`) calls `getSystemStateFromBackend(fields)`.
3. main bridge sends JSON-RPC `get_system_state` request to the local-runtime Python implementation.
4. Local-runtime Python `LocalRuntimeService._handle_get_system_state(...)` calls `core.system_state.get_system_state(...)`.
5. Local-runtime Python returns `{ success: true, data: state }`.
6. main bridge unwraps to `result.data || result` and returns plain state object to renderer.

Error path:

- if JSON-RPC fails or local-runtime Python returns `{ success: false, ... }`, main returns `null`.

## Removed Direct Bridge Export

`local_runtime_bridge.cjs` no longer exports `getSystemState(fields)`.
System-state access stays on the `get-system-state` IPC handler, which calls
the internal `getSystemStateFromBackend(fields)` helper and then dispatches
local-runtime JSON-RPC `get_system_state`. Stale references to
`local_runtime_bridge.getSystemState`, `getSystemState export removed`, or
direct system-state bridge exports should be routed back to this IPC path.

## Requested Fields Contract

`get_system_state(fields)` supports selective field fetch.

Valid fields:

- `active_window`
- `mouse_position`
- `clipboard`
- `screen_resolution`
- `windows`
- `stats`
- `time`

If `fields is None`, the local-runtime request returns the canonical full system-state snapshot.

## Collection Model

`core/system_state.py` builds coroutine list only for requested fields, then runs:

- `asyncio.gather(*coroutines, return_exceptions=True)`

Per-field post-processing:

- each field lookup is isolated
- exceptions in one field do not drop other fields
- field-specific defaults are applied when probe fails

## Field Defaults and Value Shapes

### `active_window`

- source: OS-specific active-window probe
- default on failure: `"Unknown"`

### `mouse_position`

- source: `pyautogui.position()`
- format: `"(x, y)"`
- default on failure: `"Unknown"`

### `clipboard`

- source: `pyperclip.paste()`
- normalized: one-line string (`\n` escaped)
- empty clipboard: `"<empty>"`
- failure default: `"<error>"`

### `screen_resolution`

- source: `pyautogui.size()`
- format: `"{width}x{height}"`
- default on failure: `"Unknown"`

### `windows`

- source: `core.platform.window_manager.WindowManager().get_windows()`
- local-runtime Python returns title list only
- default on failure: `[]`

### `stats`

- source: `collect_system_stats()` (`psutil` in thread pool)
- shape: `{ cpu_percent, memory_percent, battery_percent, battery_charging }`
- default on failure: `{}`

### `time`

- source: `datetime.now().isoformat()`
- local host clock, no explicit UTC normalization in this path

## Platform Adapter Semantics

### Windows

- active window: `win32gui.GetForegroundWindow()` + `GetWindowText()`
- open windows: `EnumWindows` filtered by visibility
- switch behavior (used by tools): restore minimized windows then foreground
- dependency: `pywin32`

### macOS

- active app/window: `NSWorkspace.sharedWorkspace().activeApplication()`
- open-window inspection prefers Accessibility (`AXWindows`) enumeration for regular GUI apps, then fills gaps with Quartz windows for apps that expose no Accessibility windows, with `runningApplications()` fallback when neither source yields usable windows
- switch behavior: `activateWithOptions_(0)` on matched app name
- dependency: `AppKit` bridge

### Linux

- active window: `xdotool getactivewindow getwindowname`
- active-window fallback: Python Xlib probe of `_NET_ACTIVE_WINDOW` (`_NET_WM_NAME` / `WM_NAME`) when `xdotool` path fails
- open windows: enumerate visible IDs with `xdotool search --onlyvisible --name .*`, then names per ID
- mouse-position fallback: Python Xlib pointer query (`root.query_pointer`) when `pyautogui.position()` path fails
- switch behavior: exact -> normalized -> substring -> conservative fuzzy match
- ambiguity guards prevent unsafe focus switching for close-match titles
- dependency: `xdotool`

Platform bootstrap:

- `core/platform/window_manager.py` selects `WindowManager` class by OS.

## Consumer-Specific Field Usage

### Query context assembly

SDK/main query preparation requests:

- default captures: `active_window`, `mouse_position`, `screen_resolution`
- `windows` only when explicitly requested by the caller

### Context-label overlay

Current runtime note:


## Failure and Fallback Behavior Across Layers

- Local-runtime Python field probe failure -> per-field defaults in response object
- Local-runtime Python handler exception -> `{ success: false, error }`
- main bridge error or `success: false` -> renderer receives `null`
- main/renderer consumers typically degrade to null/unknown UI state rather than hard-failing query flow

## Test-Backed Anchors

- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`
  - `get-system-state` returns `null` when the local-runtime response is unsuccessful
- `tests/frontend/IpcMainBridge.query.test.cjs`
  - query payload falls back to `<active_window>Unknown</active_window>` when system-state fetch fails

## Drift Hotspots

1. changing local-runtime JSON-RPC response shape (`{ success, data }`) without main unwrapping updates breaks renderer consumers.
2. changing default values (`Unknown`, `<error>`, `[]`) can alter prompt XML and downstream model behavior.
3. platform dependency loss (`xdotool`, `pyautogui`, `pyperclip`, `pywin32`, `AppKit`) silently degrades capture quality unless logs are monitored.
4. Linux fuzzy matching thresholds in window switching are safety-sensitive; loosened thresholds risk wrong-window activation.

## Related Pages

- [Local-Runtime System-State Docs Hub](README.md)
- [Local-Runtime System-State Platform Docs Hub](platform/README.md)
- [System-State Probe Layer and Window-Manager Adapter Boundary Reference](platform/system_state_probe_layer_and_window_manager_adapter_boundary_reference.md)
