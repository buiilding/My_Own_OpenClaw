---
summary: "Dedicated browser runtime guide covering the current Browser Use session boundary, retired Windie-owned CDP launcher path, feature packs, and browser file storage."
read_when:
  - When changing Windie dedicated browser launch, CDP port behavior, browser profile paths, browser session state, or browser feature-pack setup.
  - When debugging connect/status failures or browser profile isolation.
title: "Dedicated Browser Runtime"
---

# Dedicated Browser Runtime

WindieOS does not automate the user's default browser profile by default. `connect` now targets a WindieOS-named Browser Use daemon session through `BrowserUseEngineRuntime`; Browser Use owns browser launch/session mechanics.

## Launch And Profile Isolation

The current runtime path is:

1. `frontend/src/main/python/tools/browser/browser_tool.py` validates `BrowserControlArgs`.
2. `frontend/src/main/python/tools/browser/browser_use_engine.py` maps the canonical action to `browser-use[cli]`.
3. Browser Use launches or reuses the named daemon session and performs the browser action.

The older `chrome_launcher.py` / `controller.py` path remains in the tree for compatibility cleanup work, but it is not the browser tool execution path.

| Runtime value | Current behavior |
| --- | --- |
| CDP host | `127.0.0.1` only |
| Default CDP port | `9333` |
| Port override | `WINDIE_BROWSER_CDP_PORT` |
| macOS profile path | `~/Library/Application Support/WindieOS/BrowserProfile` |
| Windows profile path | `%LOCALAPPDATA%/WindieOS/BrowserProfile` |
| Linux profile path | `~/.config/windieos/browser-profile` |

Browser Use daemon state lives under `WINDIE_BROWSER_USE_HOME` when set, otherwise under the WindieOS app data directory at `browser-use/`. The default session name is `windieos`.

## Connect Flow

`BrowserUseEngineRuntime._handle_connect`:

1. invokes Browser Use `state` with `--headed`,
2. lets Browser Use start or reuse the named daemon session,
3. returns `mode = "browser_use"` and `scope = "windie_dedicated_browser"`.

Normal Browser Use CLI calls also use the headed session config by default. This keeps status probes, snapshots, tab commands, and content reads attached to the same visible dedicated browser instead of creating a second headless session with the same name. A state file for a running headless session is treated as disconnected so callers can close it and reconnect with the dedicated-browser config.

If you change Browser Use session behavior, align:

- `WINDIE_BROWSER_USE_HOME` and `WINDIE_BROWSER_USE_SESSION` handling,
- feature-pack dependency markers,
- docs/tests that assert Browser Use engine routing,
- renderer status labels if the visible behavior changes.

## Sidecar Runtime State

The sidecar no longer stores live Playwright/CDP objects for normal browser tool execution. Browser Use owns that state in its daemon. WindieOS should keep only adapter state, Browser Use home/session settings, and normalized tool results.

## Feature Packs

Browser dependencies can be installed as a sidecar feature pack.

Relevant files:

- `frontend/src/main/python/core/feature_pack_installer.py`
- `frontend/src/main/python/requirements.runtime.txt`
- `frontend/src/main/permission_service_browser.cjs`

The browser feature-pack marker modules are `browser_use`, `playwright`, and `markdownify`. Permission/onboarding flows can verify or install browser automation runtime support before a browser action runs.

## Browser File Storage

`frontend/src/main/python/tools/browser/file_store.py` owns browser-local file helpers.

Default file root:

```text
~/.windieos/browser
```

Browser actions `write_file`, `replace_file`, `read_file`, `upload_file`, and screenshots should resolve paths through this helper when the path is browser-owned. Do not let browser file actions write arbitrary paths without going through the resolver.

## Tests

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_browser_registry.py tests/sidecar/test_browser_runtime_architecture.py -q
cd frontend && npm run test:ci -- PermissionService.test.cjs ChatBrowserSessionControl.test.jsx
```
