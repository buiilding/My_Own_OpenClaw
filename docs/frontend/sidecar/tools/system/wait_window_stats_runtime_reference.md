---
summary: "Deep reference for sidecar wait/window/stats tools: non-blocking wait semantics, platform window manager matching/activation behavior, and async system metrics collection contracts."
read_when:
  - When changing window-targeting logic, platform adapter behavior, or tool error-message contracts for system tools.
  - When debugging `switch_tab` misses, `get_open_windows` filtering output, or `get_system_stats` dependency/runtime failures.
title: "Wait, Window, and Stats Runtime Reference"
---

# Wait, Window, and Stats Runtime Reference

This page documents sidecar system tools implemented in:

- `frontend/src/main/python/tools/system/wait_tool.py`
- `frontend/src/main/python/tools/system/window_tool.py`
- `frontend/src/main/python/tools/system/stats_tool.py`
- `frontend/src/main/python/core/system_metrics.py`
- `frontend/src/main/python/core/platform/*`
- `tests/sidecar/test_system_tools.py`
- `tests/sidecar/test_linux_window_manager.py`

## Tool Routing

Registry names:

- `wait` -> `wait_tool.wait`
- `switch_tab` -> `window_tool.switch_to_window`
- `get_open_windows` -> `window_tool.get_open_windows`
- `get_system_stats` -> `stats_tool.get_system_stats`

All calls flow through `LocalBackend._handle_execute_tool` -> `ToolRegistry.execute_tool`.

## Wait Tool (`wait`)

Contract:

- input: optional `seconds` (default `1.0`)
- validation: must be non-negative int/float

Important behavior:

- wait tool is intentionally non-blocking
- it returns immediately and reports a status message
- effective delay is handled by higher-level capture orchestration, not by sleeping in the tool

Return shape:

- success payload includes:
  - `seconds_waited`
  - `status`
  - `llm_content`
  - `return_display`

Test-backed semantics:

- default status is exactly `Waited for 1 second`
- non-integer values preserve decimal formatting (for example `2.5`)
- invalid type or negative values return canonical error text

## Window Tools (`switch_tab`, `get_open_windows`)

### Shared runtime model

- `window_tool` keeps a lazy global `_window_manager`
- first use resolves platform implementation through `core.platform.WindowManager`
- window operations execute inside a thread executor

### `switch_tab` behavior

Input:

- requires `tab_name`

Semantics:

- missing `tab_name` returns `{success: false, error: "tab_name is required"}`
- delegates to `manager.switch_to_window(tab_name)`
- `False` return becomes a user-facing guidance error that recommends using exact title from `get_open_windows`
- unexpected exceptions are wrapped as `Tab switching operation failed: ...`

### `get_open_windows` behavior

Input:

- optional `filter_text` (default empty string)

Semantics:

- pulls all windows from manager
- keeps only non-empty trimmed titles
- optional filter is case-insensitive substring match
- `llm_content` is bullet list (`- <title>`) or `No open windows found.`

## Platform Window Manager Semantics

`core/platform/__init__.py` selects implementation by OS:

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

- returns `stats` object and pretty-printed JSON `llm_content`

Error semantics:

- import failure -> `psutil library not available`
- other failures -> `Failed to get system stats: ...`

## Known Boundary

This document covers explicit system tools.

- `run_shell_command` and `process` are documented separately in [Shell and Process Session Runtime Reference](../shell_and_process_session_runtime_reference.md).
- broader system-state capture (`active_window`, `mouse_position`, etc.) is documented in [System-State Collection and Platform Adapter Reference](../../system_state/system_state_collection_and_platform_adapter_reference.md).
