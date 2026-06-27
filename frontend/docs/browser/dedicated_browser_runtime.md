---
summary: "Dedicated browser runtime guide covering the current Browser Use session boundary, dedicated Chrome profile launcher, feature packs, and browser file storage."
read_when:
  - When changing dedicated browser launch, CDP port behavior, browser profile paths, browser session state, or browser feature-pack setup.
  - When debugging connect/status failures or browser profile isolation.
title: "Dedicated Browser Runtime"
---

# Dedicated Browser Runtime

WindieOS does not automate the user's default browser profile by default. `connect` now targets a generic desktop-runtime Browser Use daemon session through `BrowserUseEngineRuntime`; Browser Use owns browser launch/session mechanics.

## Launch And Profile Isolation

The current runtime path is:

1. `frontend/src/main/python/tools/browser/browser_tool.py` validates `BrowserControlArgs`.
2. `frontend/src/main/python/tools/browser/browser_use_engine.py` ensures the dedicated Chrome profile is available through CDP.
3. Browser Use launches or reuses the named daemon session with `--cdp-url` and performs the browser action.

The local-runtime browser stack no longer keeps a direct browser-controller
execution path. `chrome_launcher.py` only owns the dedicated profile launch
boundary used by the Browser Use adapter.

| Runtime value | Current behavior |
| --- | --- |
| CDP host | `127.0.0.1` only |
| Default CDP port | `9333` |
| Port override | `AGENT_BROWSER_CDP_PORT` (`WINDIE_BROWSER_CDP_PORT` in WindieOS launches) |
| Standalone macOS profile path | `~/Library/Application Support/desktop-runtime/BrowserProfile` |
| Standalone Windows profile path | `%LOCALAPPDATA%/desktop-runtime/BrowserProfile` |
| Standalone Linux profile path | `~/.config/desktop-runtime/BrowserProfile` |
| WindieOS desktop profile path | existing `windieos/BrowserProfile` app-data profile, selected from the host-injected user-data root |

Browser Use daemon state lives under `AGENT_BROWSER_USE_HOME` when set, or
`WINDIE_BROWSER_USE_HOME` in WindieOS launches, otherwise under the active app
data directory at `browser-use/`. The default session name is `desktop-agent`.
Use `AGENT_BROWSER_USE_SESSION` or the WindieOS alias
`WINDIE_BROWSER_USE_SESSION=windieos` only for diagnostics, isolated local
sessions, or intentionally reusing a legacy Browser Use daemon session. Legacy
`windieos` Browser Use session state is not migrated automatically.

## Connect Flow

`BrowserUseEngineRuntime._handle_connect`:

1. starts or reuses the dedicated Chrome profile through `ensure_chrome_with_cdp`,
2. invokes Browser Use `state` with `--cdp-url` targeting that profile,
3. returns `mode = "browser_use"` and `scope = "dedicated_browser"`.

Browser Use treats `--headed` and `--cdp-url` as explicit daemon-config checks.
The local-runtime Browser Use adapter passes them only when starting or
recovering the dedicated session, then omits them for normal reuse so Browser
Use does not compare the daemon's live CDP URL against every fresh CLI
invocation. A state file for a running non-dedicated Browser Use session is
treated as disconnected; `connect` closes that stale daemon and waits briefly
before starting Browser Use against the dedicated profile.

For browser-internal URLs (`chrome://`, `chrome-extension://`, `devtools://`,
and `about:`), the adapter does not call Browser Use CLI `open` because that
command normalizes non-web schemes to `https://...`. The adapter uses Browser
Use's Python `browser.goto(...)` wrapper for same-tab internal navigation while
leaving normal web navigation on Browser Use `open`.

If you change Browser Use session behavior, align:

- `AGENT_BROWSER_USE_HOME` / `WINDIE_BROWSER_USE_HOME` and
  `AGENT_BROWSER_USE_SESSION` / `WINDIE_BROWSER_USE_SESSION` handling,
- feature-pack dependency markers,
- docs/tests that assert Browser Use engine routing,
- renderer status labels if the visible behavior changes.

## Local-Runtime Browser State

The local-runtime Python browser adapter no longer stores live Playwright/CDP
objects for normal browser tool execution. Browser Use owns that state in its
daemon. The desktop/local-runtime browser path should keep only adapter state,
Browser Use home/session settings, and normalized tool results.

## Feature Packs

Browser dependencies can be installed as a local-runtime feature pack.

Relevant files:

- `frontend/src/main/python/core/feature_pack_installer.py`
- `frontend/src/main/python/requirements.runtime.txt`
- `frontend/src/main/permissions/permission_service_browser.cjs`

The browser feature-pack marker modules are `browser_use`, `playwright`, and `markdownify`. Permission/onboarding flows can verify or install browser automation runtime support before a browser action runs.

## Browser File Storage

`frontend/src/main/python/tools/browser/file_store.py` owns browser-local file helpers.

Default file root:

```text
~/.desktop-agent/browser
```

Set `AGENT_BROWSER_FILES_DIR` (`WINDIE_BROWSER_FILES_DIR` in WindieOS launches)
only when a diagnostic run needs an isolated browser file root or needs to
reuse the legacy `~/.windieos/browser` root. Legacy browser files are not
migrated automatically.

Browser actions `write_file`, `replace_file`, `read_file`, `upload_file`, and screenshots should resolve paths through this helper when the path is browser-owned. Browser-owned file paths must be relative to the browser file root; absolute paths and `..` escapes are rejected instead of falling through to arbitrary filesystem locations.

## Tests

```bash
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine.py -q
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/test_browser_registry.py tests/sidecar/tools/test_browser_use_engine_runtime.py tests/sidecar/tools/test_browser_schemas.py -q
<windie> test frontend -- PermissionService.test.cjs ChatBrowserSessionControl.test.jsx
```
