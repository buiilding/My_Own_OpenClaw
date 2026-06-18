---
summary: "Deep reference for sidecar wait/window/stats tools: non-blocking wait semantics, platform window manager matching/activation behavior, and async system metrics collection contracts."
read_when:
  - When changing window-targeting logic, platform adapter behavior, or tool error-message contracts for system tools.
  - When debugging `switch_window` misses, `get_open_windows` filtering output, or `get_system_stats` dependency/runtime failures.
title: "Wait, Window, and Stats Runtime Reference"
---

# Wait, Window, and Stats Runtime Reference

This page documents sidecar system tools implemented in:

- `frontend/src/main/python/tools/system/wait_tool.py`
- `frontend/src/main/python/tools/system/window_tool.py`
- `frontend/src/main/python/tools/system/stats_tool.py`
- `frontend/src/main/python/tools/system/open_app_tool.py`
- `frontend/src/main/python/core/system_metrics.py`
- `frontend/src/main/python/core/platform/*`
- `tests/sidecar/test_system_tools.py`
- `tests/sidecar/test_linux_window_manager.py`

## Tool Routing

Registry names:

- `wait` -> `wait_tool.wait`
- `switch_window` -> `window_tool.switch_to_window`
- `get_open_windows` -> `window_tool.get_open_windows`
- `get_system_stats` -> `stats_tool.get_system_stats`
- `open_app` -> `open_app_tool.open_app`

All calls flow through `LocalRuntimeService._handle_execute_tool` -> `ToolRegistry.execute_tool`.

## Wait Tool (`wait`)

Contract:

- input: required `seconds`
- validation: must be non-negative int/float

Important behavior:

- wait tool is intentionally non-blocking
- it returns immediately and reports a status message
- effective delay is handled by higher-level capture orchestration, not by sleeping in the tool

Return shape:

- success payload includes:
  - `seconds_waited`
  - `status`
  - `output`
- the tool returns native `ToolResult`; JSON-RPC conversion happens in
  `LocalRuntimeService._handle_execute_tool`

Test-backed semantics:

- missing `seconds` returns canonical error text
- non-integer values preserve decimal formatting (for example `2.5`)
- invalid type or negative values return canonical error text

## Window Tools (`switch_window`, `get_open_windows`)

### Shared runtime model

- `window_tool` keeps a lazy global `_window_manager`
- first use resolves platform implementation through `core.platform.window_manager.WindowManager`
- window operations execute inside a thread executor

### `switch_window` behavior

Input:

- requires `tab_name`

Semantics:

- missing `tab_name` returns `{success: false, error: "tab_name is required"}`
- exact numbered labels from `get_open_windows` such as `Google Chrome: New Tab - Google Chrome (2)` now resolve back to the selected underlying window instead of collapsing to the raw duplicate title again before activation
- duplicate-label selection is carried through to the platform window manager as a resolved window record; Windows/Linux prefer the exact window handle when present, and macOS raises the matching duplicate window by ordinal within the app when multiple windows share the same title
- otherwise delegates to `manager.switch_to_window(tab_name)`
- on macOS, app-level entries from `get_open_windows` now verify success by active app match when the target entry is the app name rather than a specific window title, so entries like `Finder` do not fail just because the focused Finder window title is `Downloads`
- `False` return becomes a user-facing guidance error that recommends using exact title from `get_open_windows`
- unexpected exceptions are wrapped as `Window switching operation failed: ...`
- returns native `ToolResult`; JSON-RPC conversion happens in
  `LocalRuntimeService._handle_execute_tool`

### `get_open_windows` behavior

Input:

- optional `filter_text` (default empty string)

Semantics:

- pulls open user-facing windows from the platform manager while filtering out background/helper windows
- on macOS, prefers Accessibility window enumeration for regular GUI apps and uses Quartz only as a per-app fallback when Accessibility returns no usable windows
- on macOS, Quartz fallback only keeps titled windows; unnamed app-owned Quartz surfaces are treated as non-user-facing artifacts rather than promoted back to the bare app name
- formats entries as `app_name: title` when both exist and differ; otherwise uses whichever one is available
- removes empty entries while preserving one row per underlying window; duplicate final display strings are suffixed as ` (1)`, ` (2)`, and so on
- optional filter is case-insensitive substring match against the displayed app/window name and its raw app/title parts
- `output` is bullet list (`- <name>`) or `No open windows found.`
- returns native `ToolResult`; JSON-RPC conversion happens in
  `LocalRuntimeService._handle_execute_tool`

## Platform Window Manager Semantics

`core/platform/window_manager.py` selects implementation by OS:

- Windows -> `WindowsWindowManager`
- macOS -> `MacOSWindowManager`
- Linux -> `LinuxWindowManager`
- unknown OS -> `BaseWindowManager` fallback

### Linux (`linux.py`)

Runtime dependencies:

- requires `xdotool`; unavailable binary disables manager (`_available=False`)

Window enumeration:

- `xdotool search --name .*` then `xdotool getwindowname <id>`

Matching algorithm (`_select_best_match`):

1. raw exact match
2. normalized exact match
3. normalized substring ranking
4. conservative fuzzy fallback (`difflib.SequenceMatcher`)

Normalization details:

- Unicode NFKC normalization
- punctuation translations (curly apostrophes/quotes, en/em dash, non-breaking space)
- whitespace collapse and casefold

Ambiguity guards:

- substring ties return `None`
- fuzzy score threshold `0.78`
- fuzzy ambiguity margin `0.08`

Activation:

- uses `xdotool windowactivate <hwnd>`

Test coverage confirms:

- normalized apostrophe matching succeeds
- ambiguous fuzzy matches are rejected
- activation command uses selected `hwnd`

### Windows (`windows.py`)

Runtime dependencies:

- requires `win32gui` and `win32con`

Enumeration:

- `EnumWindows` over visible windows with non-empty titles

Switch behavior:

- substring match (`requested in title`, case-insensitive)
- restores minimized windows (`SW_RESTORE`)
- brings target to foreground via `SetForegroundWindow`

### macOS (`macos.py`)

Runtime dependencies:

- requires `AppKit.NSWorkspace`

Enumeration:

- lists running application names (app-level, not per-window titles)

Switch behavior:

- substring match against app localized name
- uses `activateWithOptions_(0)`

## System Stats Tool (`get_system_stats`)

Implementation split:

- `stats_tool.get_system_stats` calls shared `collect_system_stats()`
- shared collector lives in `core/system_metrics.py`

Collector behavior:

- runs sync metric collection in executor thread
- uses:
  - `psutil.cpu_percent(interval=0.1)`
  - `psutil.virtual_memory().percent`
  - `psutil.sensors_battery()` when available

Battery fallback semantics:

- `AttributeError` or `NotImplementedError` from battery probe yields `None` battery fields
- collector still succeeds

Output shape:

- returns `stats` object and pretty-printed JSON `output`
- the tool returns native `ToolResult`; JSON-RPC conversion happens in
  `LocalRuntimeService._handle_execute_tool`

Error semantics:

- import failure -> `psutil library not available`
- other failures -> `Failed to get system stats: ...`

## Open App Tool (`open_app`)

Contract:

- input:
  - required `command`
  - optional `args[]`, `directory`
  - optional `verify`: `none` | `window` | `screenshot` (default `window`)
  - optional `verify_window_title`
  - optional `verify_timeout_seconds`

Runtime behavior:

- launches a detached desktop process (app keeps running after the current agent turn ends)
- validates `directory` as absolute existing directory when provided
- verification modes:
  - `none`: immediate launch acknowledgment
  - `window`: polls `get_open_windows` filter path for title match
  - `screenshot`: runs window verification + captures screenshot evidence payload

Return shape:

- `detached`, `pid`, `verify_mode`
- `verify_status`, `verified`, optional `matched_window_title`
- screenshot mode includes screenshot payload fields (`screenshot_path`, `screenshot_content_type`, etc.)

## Known Boundary

This document covers explicit system tools.

- `run_shell_command` and `process` are documented separately in [Shell and Process Session Runtime Reference](../shell_and_process_session_runtime_reference.md).
- broader system-state capture (`active_window`, `mouse_position`, etc.) is documented in [System-State Collection and Platform Adapter Reference](../../system_state/system_state_collection_and_platform_adapter_reference.md).
