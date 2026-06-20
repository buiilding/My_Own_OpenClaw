---
summary: "Deep reference for local-runtime Python computer tools covering action-level argument contracts, pyautogui execution semantics, OS-aware scroll normalization, and screenshot encoding behavior."
read_when:
  - When changing local-runtime Python computer-tool action names, argument fields, or result payload structure.
  - When debugging pyautogui dependency failures, hotkey safety blocks, scroll amount inconsistencies, or screenshot capture overhead.
title: "Mouse, Keyboard, Scroll, and Screenshot Runtime Reference"
---

# Mouse, Keyboard, Scroll, and Screenshot Runtime Reference

This page documents local-runtime Python computer tools as implemented in:

- `frontend/src/main/python/tools/computer/mouse_tool.py`
- `frontend/src/main/python/tools/computer/keyboard_tool.py`
- `frontend/src/main/python/tools/computer/scroll_tool.py`
- `frontend/src/main/python/tools/computer/scroll_config.py`
- `frontend/src/main/python/tools/computer/screenshot_tool.py`
- `frontend/src/main/python/tools/schemas.py`
- `frontend/src/main/python/tools/registry.py`

## Runtime Entry Points

1. `LocalRuntimeService._handle_execute_tool` calls `ToolRegistry.execute_tool`.
2. Registry resolves tool function names:
   - `mouse_control` -> `execute_mouse_control`
   - `keyboard_control` -> `execute_keyboard_control`
   - `scroll_control` -> `execute_scroll_control`
   - `screenshot` -> `capture_screenshot`
3. Tool returns are native `ToolResult`; the registry passes them through.

## Mouse Tool (`mouse_control`)

Supported actions:

- `click`, `double_click`, `right_click`, `move`, `drag`

Action contracts from implementation:

- all mouse actions require `x` and `y`
- `click` and `double_click` accept optional `button` (`left`, `right`, `middle`); default is `left`
- `drag` also requires `drag_to_x` and `drag_to_y`
- pyautogui failsafe is disabled (`pyautogui.FAILSAFE = False`)

Execution semantics:

- sync pyautogui work runs via `loop.run_in_executor(...)`
- `drag` moves to the source point first, then `dragTo(drag_to_x, drag_to_y, duration=duration)`

Output semantics:

- returns `ToolResult.success_result(...)` directly
- payload includes `message` and `output`

## Keyboard Tool (`keyboard_control`)

Supported actions:

- `type`, `paste`, `press`, `hotkey`

Validation and guards:

- missing `action` returns `{success: false, error: "action is required"}`
- `type`/`paste` require `text`; hard limit `len(text) <= 10000`
- `press` requires `key`
- `hotkey` requires non-empty `keys`
- dangerous hotkeys are blocked:
  - `alt + f4`
  - `ctrl + alt + del`
  - `ctrl + shift + esc`

Key normalization:

- uses a shared normalization helper with common aliases (`escape` -> `esc`, arrow keys, page keys, function keys) plus platform-specific aliases for modifier keys such as `super`
- unknown keys are lowercased pass-through

Execution semantics:

- runs in thread executor to avoid blocking event loop
- `type` uses `pyautogui.write(text, interval=0.01)` for short single-line input
- `type` auto-switches to clipboard paste for multiline or long text
- `paste` always uses clipboard + platform paste hotkey (`ctrl+v` on Windows/Linux, `command+v` on macOS), then attempts to restore prior clipboard content

Output semantics:

- returns `ToolResult.success_result(...)` directly
- `input` field truncates visible preview to 50 chars, while `message` contains full text

## Scroll Tool (`scroll_control`)

`scroll_control` is the only scroll execution path.

Supported actions:

- `scroll`
- `scroll_up`
- `scroll_down`

Required fields:

- implementation requires `x` and `y` for all scroll actions
- for `scroll`, `direction` must be one of `up|down|left|right`

Behavior details:

- moves cursor to `(x, y)`, then sleeps `0.5s` before scrolling
- scroll amount argument is `clicks`, interpreted as standardized visual units, not raw wheel ticks
- converts standardized units to OS clicks via `calculate_scroll_clicks`

Direction mapping:

- vertical: `vscroll(+clicks)` for up, `vscroll(-clicks)` for down
- horizontal: `hscroll(+/-clicks)`; fallback to vertical if `hscroll` missing

Returned metadata:

- both `scroll_units` (requested) and `os_clicks` (actual emitted) are returned
- returns `ToolResult.success_result(...)` directly

## OS-Aware Scroll Normalization (`scroll_config.py`)

Normalization policy:

- target: `1` scroll unit ~= `3` lines of visible content
- default multipliers:
  - Windows: `1.0`
  - macOS (`Darwin`): `0.3`
  - Linux: `1.0`

Windows refinement:

- reads `HKEY_CURRENT_USER\\Control Panel\\Desktop\\WheelScrollLines`
- runtime multiplier becomes `TARGET_LINES_PER_UNIT / actual_lines`
- calculated clicks are rounded and clamped: `max(1, round(units * multiplier))`

Diagnostics:

- `get_scroll_diagnostics()` exposes OS, active multiplier, defaults, and custom Windows setting flag

## Screenshot Tool (`screenshot`)

Capture behavior:

- full desktop screenshot by default
- optional region/monitor capture through `display_bounds`:
  - required region keys: `x`, `y`, `width`, `height`
  - optional `monitor_id`
  - optional `desktop_virtual_bounds` (`x`, `y`, `width`, `height`) for multi-monitor virtual desktop crop normalization
- numeric bounds accept ints/floats and are cast to ints (invalid/non-positive bounds are ignored)

Capture engine strategy:

  - preferred native/system cursor-aware backend per OS when available
  - Windows: Win32 GDI + `DrawIconEx` cursor rendering
  - Linux:
    - X11 session: intentionally skips `gnome-screenshot`/`scrot` to avoid flash/shutter side-effects; uses silent fallback then XFixes cursor overlay
    - non-X11 path may use `scrot`/`gnome-screenshot` include-pointer capture
  - macOS: avoids `screencapture` side-effects and overlays a repo-owned built-in cursor image with a fixed hotspot instead of depending on live AppKit cursor objects, preventing transient oversized cursor states and making cursor rendering deterministic across sidecar runs
- fallback path uses `pyautogui.screenshot(...)`
- the returned model-facing image is normalized to the desktop-coordinate
  dimensions represented by the capture when those dimensions are known:
  full-desktop captures use `pyautogui.size()`, and bounded captures use
  `display_bounds.width/height`
- `capture_meta.source_w/source_h` describe this final model-facing image,
  while `capture_meta.crop_x/crop_y/crop_w/crop_h` describe the desktop-space
  rectangle represented by that image
- macOS cursor overlay maps `pyautogui.position()` desktop coordinates into the
  captured image coordinate space before drawing, so Retina screenshots place
  the built-in cursor at the matching screenshot pixel rather than at the
  unscaled desktop point.
- if region + `desktop_virtual_bounds` are provided, sidecar captures the full virtual desktop first and crops to target monitor region safely (bounds-checked)
- full-virtual-desktop crops are mapped from desktop bounds into raw image
  pixels first, so a raw high-DPI full capture can still be cropped to the
  correct monitor before the model-facing resize step
- macOS exception: when monitor bounds are provided, sidecar uses direct bounded capture instead of full-desktop crop because Pillow's macOS region path already returns correctly scaled logical-space images and avoids Retina upper-left clipping

Encoding behavior:

- image forced to RGB for JPEG compatibility
- JPEG settings:
  - `quality=85`
  - `optimize=False`
  - `progressive=False`
- returns JPEG bytes as inline base64 in the sidecar `ToolResult.data.screenshot`
  field so the SDK local tool-output projection can display the screenshot
  without relying on an Electron-only materialization path

Payload shape:

- `screenshot` (base64 JPEG payload)
- `screenshot_content_type: "image/jpeg"`
- `compression: "jpeg"`
- `size` is real JPEG byte length
- `capture_meta` fields:
  - `source_w`, `source_h`
  - `crop_x`, `crop_y`, `crop_w`, `crop_h`
  - `desktop_virtual_bounds` (`x`, `y`, `width`, `height`)
  - `monitor_id`
- `timestamp` (ms)
- `capture_engine` (local capture engine label chain such as `pyautogui_fallback+linux_xfixes_cursor`)
- `output` is short raw success text for SDK display and backend model-history ingestion

Cross-layer note:

- The SDK local tool coordinator owns the local `tool_output` event. It hoists
  screenshot fields from result data onto the event payload so SDK display rows
  and renderer messages can render the image. The same SDK `tool-result` sends
  `data.screenshot` and `data.screenshot_content_type` to backend, where result
  processing attaches the screenshot to the canonical tool history row for the
  next model call. Backend does not echo local results as backend `tool-output`
  UI events; UI display remains SDK-owned.

## Schema Notes vs Runtime Enforcement

`tools/schemas.py` defines typed arg models for computer tools, including optional `wait` fields.

Current runtime behavior:

- `ToolRegistry.execute_tool` does not run Pydantic validation before invoking tool functions
- practical validation currently occurs inside each tool implementation (manual checks)

Implication:

- schema updates alone do not enforce behavior unless paired with registry-side or tool-side validation updates

## Error Surfaces

Common failure classes:

- dependency missing (`pyautogui`, `PIL`) -> import error path
- invalid args (missing coordinates/action fields) -> tool-level validation errors
- runtime automation failures -> exception captured and surfaced as tool error

Result normalization note:

- migrated computer tools return `ToolResult` directly; registry
  mapping-normalization remains only for tool producers that have not moved yet
