---
summary: "Deep reference for local-runtime Python platform layering: direct OS probes used by `get_system_state`, separate window-manager adapters used by system tools, and OS-specific dependency/fallback behavior."
read_when:
  - When changing active-window/window-list collection logic or window-activation matching behavior on Windows/macOS/Linux.
  - When diagnosing mismatches where `get_system_state` reports one window title surface but `switch_window` matching/activation behaves differently.
title: "System-State Probe Layer and Window-Manager Adapter Boundary Reference"
---

# System-State Probe Layer and Window-Manager Adapter Boundary Reference

## Canonical Modules

- `frontend/src/main/python/core/system_state.py`
- `frontend/src/main/python/core/platform/window_manager.py`
- `frontend/src/main/python/core/platform/base.py`
- `frontend/src/main/python/core/platform/windows.py`
- `frontend/src/main/python/core/platform/macos.py`
- `frontend/src/main/python/core/platform/linux.py`
- `frontend/src/main/python/tools/system/window_tool.py`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`

## Two Platform Layers, Different Responsibilities

### Probe layer (`core/system_state.py`)

Used by JSON-RPC `get_system_state`:

- `active_window`: direct OS probe helpers (`_get_active_window_*`)
- `windows`: `_get_all_open_windows()` through `WindowManager().get_windows()`
- `mouse_position`, `clipboard`, `screen_resolution`, `stats`, `time`: non-window probes

Design goal:

- per-field best-effort capture with fallback defaults, never hard-fail whole payload

### Adapter layer (`core/platform/*`)

Used by system tools (`switch_window`, `get_open_windows`):

- one `WindowManager` implementation per OS
- normalized matching and activation behavior live here

Design goal:

- operational window control and selection logic for tool execution

Key boundary:

- `get_system_state` and tool window switching share some primitives, but they are not one unified code path

## Request Path and Null Boundary

Flow:

1. renderer invokes `get-system-state` IPC
2. main bridge calls local-runtime Python `get_system_state`
3. local-runtime Python handler returns `{ success: true, data }` or `{ success: false, error }`
4. main bridge unwraps `result.data || result`
5. if local-runtime Python fails or bridge errors, main returns `null`

Implication:

- renderer consumers must tolerate `null` from bridge even though local-runtime Python tries to return fallback-filled field objects

## OS-Specific Adapter Semantics

### Windows (`windows.py`)

Dependencies:

- `win32gui`, `win32con` (`pywin32`)

Enumeration:

- `EnumWindows` + visibility filter + non-empty title
- returned entry shape: `{ "title": str, "hwnd": int }`

Activation:

- first substring match (`requested in title`, case-insensitive)
- restore minimized window (`SW_RESTORE`) before `SetForegroundWindow`

### macOS (`macos.py`)

Dependencies:

- `AppKit.NSWorkspace`

Enumeration:

- app-level names from running applications, not window-level titles
- returned entry shape uses `hwnd: None`

Activation:

- case-insensitive substring match on app localized name
- `activateWithOptions_(0)`

### Linux (`linux.py`)

Dependencies:

- `xdotool` binary is preferred for window listing/switching
- local-runtime startup now surfaces explicit runtime warning when `xdotool` is missing
- probe-layer fallbacks in `core/system_state.py` can still use Xlib for active-window/mouse-position when available

Enumeration:

- `xdotool search --name .*` then `xdotool getwindowname <id>`
- returned entry shape: `{ "title": str, "hwnd": str }`

Activation matching (`_select_best_match`):

1. raw exact match
2. normalized exact match (NFKC + punctuation translation + casefold + whitespace collapse)
3. normalized substring match with tie-ambiguity rejection
4. conservative fuzzy fallback with thresholds:
   - min score `0.78`
   - ambiguity margin `0.08`

Activation command:

- `xdotool windowactivate <hwnd>`

## Probe Layer Differences That Matter

1. `active_window` on Linux uses direct `xdotool getactivewindow getwindowname`, while switch logic uses richer matcher over window list.
2. macOS `active_window` is active app name; no per-window granularity.
3. Windows `active_window` and adapter both use `win32gui`, but one is read-only foreground snapshot and one includes minimize-restore + foreground set.
4. unknown platform fallback maps `WindowManager` to abstract base class; adapter operations are effectively unavailable there.

## Failure/Fallback Semantics

Probe layer in `get_system_state`:

- gathers fields concurrently with `return_exceptions=True`
- on per-field failure returns defaults (`"Unknown"`, `[]`, `{}`, `"<error>"`)
- on top-level exception returns fallback object containing only requested fields

Adapter layer in tools:

- unavailable dependencies set `_available=False`
- operations return empty lists/`False` rather than raising
- caller-level tool wrappers convert failures into user-facing errors/help text

## Drift Hotspots

1. changing adapter matching thresholds without updating Linux tests can silently broaden or over-restrict window targeting.
2. changing `get_system_state` fallback literals alters prompt context XML, even if tool execution still works.
3. assuming window titles are comparable across OSes fails on macOS (app-level names only).
4. relying on `hwnd` shape in shared consumers is unsafe (`int` on Windows, `str` on Linux, `None` on macOS).

## Change Checklist

When changing platform adapters:

1. validate `switch_window` and `get_open_windows` behaviors for each OS-specific implementation
2. confirm `get_system_state` window fields still produce expected shape/fallbacks
3. ensure ambiguity guards remain conservative on Linux matching
4. verify main bridge still normalizes local-runtime Python success/error responses to renderer expectations
