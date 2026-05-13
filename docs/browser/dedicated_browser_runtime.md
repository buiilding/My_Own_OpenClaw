---
summary: "Dedicated browser runtime guide covering Windie-owned profile isolation, CDP launch, browser session state, feature packs, and file storage."
read_when:
  - When changing Windie dedicated browser launch, CDP port behavior, browser profile paths, browser session state, or browser feature-pack setup.
  - When debugging connect/status failures or browser profile isolation.
title: "Dedicated Browser Runtime"
---

# Dedicated Browser Runtime

WindieOS does not automate the user's default browser profile. `connect` targets a Windie-owned Chromium profile through localhost CDP.

## Launch And Profile Isolation

`frontend/src/main/python/tools/browser/chrome_launcher.py` owns launch and CDP probing.

| Runtime value | Current behavior |
| --- | --- |
| CDP host | `127.0.0.1` only |
| Default CDP port | `9333` |
| Port override | `WINDIE_BROWSER_CDP_PORT` |
| macOS profile path | `~/Library/Application Support/WindieOS/BrowserProfile` |
| Windows profile path | `%LOCALAPPDATA%/WindieOS/BrowserProfile` |
| Linux profile path | `~/.config/windieos/browser-profile` |

`launch_chrome_with_cdp` starts Chromium with:

- `--remote-debugging-port=<port>`
- `--user-data-dir=<WindieOS profile>`
- `--profile-directory=Default`

This keeps Windie session state separate from the user's normal Chrome profile.

## Connect Flow

`WindieBrowserRuntime._handle_connect`:

1. closes any existing controller connection,
2. calls `BrowserController.auto_connect_to_chrome(cdp_url="http://127.0.0.1:9333", auto_launch=True, headless=False)`,
3. returns `scope = "windie_dedicated_browser"`.

If you change CDP port behavior, align:

- `chrome_launcher.py` default/override resolution,
- runtime connect URL,
- docs/tests that assert dedicated browser scope,
- renderer status labels if the visible behavior changes.

## Sidecar Runtime State

`frontend/src/main/python/tools/browser/session_runtime.py` stores live Playwright/CDP objects for the controller:

- Playwright runtime,
- browser,
- context,
- page,
- launched process,
- CDP URL/session metadata.

`frontend/src/main/python/tools/browser/controller.py` is the public facade used by `WindieBrowserRuntime`. Keep one controller boundary; do not let renderer or Electron main inspect Playwright objects directly.

## Feature Packs

Browser dependencies can be installed as a sidecar feature pack.

Relevant files:

- `frontend/src/main/python/core/feature_pack_installer.py`
- `frontend/src/main/python/requirements.runtime.txt`
- `frontend/src/main/permission_service_browser.cjs`

The browser feature-pack marker modules are `playwright` and `markdownify`. Permission/onboarding flows can verify or install browser automation runtime support before a browser action runs.

## Browser File Storage

`frontend/src/main/python/tools/browser/file_store.py` owns browser-local file helpers.

Default file root:

```text
~/.windieos/browser
```

Browser actions `write_file`, `replace_file`, `read_file`, `upload_file`, and screenshots should resolve paths through this helper when the path is browser-owned. Do not let browser file actions write arbitrary paths without going through the resolver.

## Tests

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_session_runtime.py tests/sidecar/tools/test_browser_controller.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_browser_registry.py tests/sidecar/test_browser_runtime_architecture.py -q
cd frontend && npm run test:ci -- PermissionService.test.cjs ChatBrowserSessionControl.test.jsx
```

