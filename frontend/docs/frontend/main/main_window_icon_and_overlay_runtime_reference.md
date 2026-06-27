---
summary: "Deep reference for Electron-main window bootstrap helper modules split from `main_window_runtime.cjs`: app/tray icon resolution and shared renderer-overlay window loader factories."
read_when:
  - When changing icon path/native-image fallback behavior in `main_window_icon_runtime.cjs`.
  - When changing shared renderer view loading or overlay BrowserWindow defaults in `main_window_overlay_runtime.cjs`.
  - When debugging missing app/tray icons, empty nativeImage paths, or overlay renderer lazy-load behavior.
title: "Main Window Icon and Overlay Runtime Reference"
---

# Main Window Icon and Overlay Runtime Reference

## Canonical Modules

- `frontend/src/main/surfaces/main_window_runtime.cjs`
- `frontend/src/main/surfaces/main_window_icon_runtime.cjs`
- `frontend/src/main/surfaces/main_window_overlay_runtime.cjs`
- `tests/frontend/MainWindowIconRuntime.test.cjs`
- `tests/frontend/MainWindowOverlayRuntime.test.cjs`
- `tests/frontend/MainWindowRuntime.test.cjs`

## Split Ownership

`main_window_runtime.cjs` orchestrates high-level window bootstrap (`createMainWindow`, `createChatWindow`, `createResponseWindow`, `createTray`).

Helper modules own shared primitives:

- `main_window_icon_runtime.cjs`: app/tray icon resolution and native-image fallback
- `main_window_overlay_runtime.cjs`: public overlay runtime facade for renderer route loading, shared overlay BrowserWindow creation, renderer console logging, and lazy loader creation

## Icon Runtime Contract (`main_window_icon_runtime.cjs`)

`createMainWindowIconRuntime(...)` is the public Electron-main facade for
icon path resolution and native-image creation. Lower-level path, app-image,
and tray-image helpers stay private to the icon runtime owner.

### `iconRuntime.resolveAppIconPath(...)`

Candidate search order:

1. `frontend/src/main/assets/icons/<configured-app-icon>` relative to module `__dirname`
2. packaged resources path candidate: `${process.resourcesPath}/src/main/assets/icons/<configured-app-icon>`
3. cwd fallback candidate: `${process.cwd()}/src/main/assets/icons/<configured-app-icon>`

Returns first existing path (`existsSync`) or `null`.

### `iconRuntime.resolveAppIcon(...)`

- resolves icon path via injected `resolveAppIconPath` or the facade path resolver
- returns `nativeImage.createFromPath(...)` only when non-empty image
- returns `null` when no valid path/image is available
- logs warning when path resolves but image is empty/unreadable

Used by:

- `createMainWindow` (dashboard window icon)
- `createChatWindow` (chat overlay icon)
- `createResponseWindow` (response overlay icon)

### `iconRuntime.resolveTrayIcon(...)`

- attempts `nativeImage.createFromPath(iconPath)` when provided
- if path image is empty/unreadable, logs warning and falls back to embedded data URL icon
- fallback uses `nativeImage.createFromDataURL(TRAY_ICON_FALLBACK_DATA_URL)`

Used by:

- `createTray`

## Overlay Runtime Contract (`main_window_overlay_runtime.cjs`)

`createMainWindowOverlayRuntime(...)` is the public Electron-main facade for
shared overlay window bootstrapping. Lower-level renderer loading, overlay
window factory, console logging, and lazy-loader helpers stay private to the
overlay runtime owner.

### `overlayRuntime.loadRendererView(...)`

Query-flag assembly:

- `view=<route>` when provided
- `vm_mode=1` when VM mode enabled
- `dev_ui=1` when transparency/debug UI enabled
- `debug_stream=1` when stream debug enabled
- `debug_tool_screenshot=1` when screenshot debug enabled

Load behavior:

- packaged app: `targetWindow.loadFile(dist/index.html, { query })`
- dev app: `targetWindow.loadURL(http://localhost:5173?...query...)`

### `overlayRuntime.createOverlayBrowserWindow(...)`

Shared overlay defaults:

- frameless transparent overlay window
- startup-hidden by default unless caller explicitly requests `show: true`
- non-resizable/minimizable/maximizable/fullscreenable
- `skipTaskbar=true`, `alwaysOnTop=true`, `hasShadow=false`
- macOS overlays use native `type="panel"` so they can float across Spaces/fullscreen without forcing workspace-transform calls
- Windows overlays keep `type="toolbar"`
- Linux omits the custom type to avoid Chromium/X11 `_NET_WM_WINDOW_TYPE_TOOLBAR` startup noise while preserving the same frameless overlay behavior
- preload: `frontend/src/preload.js`
- `contextIsolation=true`, `nodeIntegration=false`
- optional `show` and `icon` overrides
- `devTools` gated by `allowDevTools`

### `overlayRuntime.createLazyRendererViewLoader(options)`

- returns closure that loads renderer view exactly once
- first call: runs `overlayRuntime.loadRendererView(options)` and returns `true`
- later calls: no-op and returns `false`

### `overlayRuntime.attachRendererConsoleLogging(...)`

- attaches one `console-message` listener per target `webContents`
- writes session banners for default and verbose renderer logs
- always writes renderer console lines to the verbose renderer log
- forwards warning/error/critical levels to the default renderer layer log

Used by:

- chat window `show` event (lazy `view=minimal-chat-pill`)
- response window bootstrap (`view=minimal-response-overlay`) and later `show` events as a no-op once loaded

## Test-Backed Invariants

`tests/frontend/MainWindowIconRuntime.test.cjs`:

- icon runtime exposes the facade while keeping lower-level helpers private
- facade path resolver returns first existing candidate
- facade app icon resolver returns null when no path resolves
- facade tray icon resolver falls back to data-url icon when path image is empty

`tests/frontend/MainWindowOverlayRuntime.test.cjs`:

- overlay runtime exposes the facade while keeping lower-level helpers private
- dev URL includes expected query flags
- lazy loader performs single load
- renderer console logging attaches once and routes warning/error payloads to
  the default renderer log
- overlay BrowserWindow factory keeps transparent defaults and applies platform-specific overlay types (`panel` on macOS, `toolbar` on Windows, none on Linux)

`tests/frontend/MainWindowRuntime.test.cjs`:

- window/tray bootstrap wiring preserves icon resolver injection contracts and tray tooltip/menu behavior

## Drift Hotspots

1. Diverging icon candidate path order from packaged layout can break production icons while dev icons still work.
2. Removing empty-image guards can produce invisible tray icons on unreadable paths.
3. Duplicating overlay BrowserWindow options in `main_window_runtime.cjs` can desync chat/response defaults from shared factory.
4. Bypassing lazy renderer loader for overlay windows can regress startup performance and mount timing assumptions.

## Related Pages

- [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md)
- [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md)
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
