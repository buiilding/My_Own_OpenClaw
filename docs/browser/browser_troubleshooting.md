---
summary: "Browser troubleshooting playbook for WindieOS connect, snapshots, refs, downloads/files, permissions, feature packs, and renderer session controls."
read_when:
  - When a browser action fails or the dedicated browser session UI is stale.
  - When debugging CDP, Playwright, browser feature-pack availability, refs, downloads, or browser file actions.
title: "Browser Troubleshooting"
---

# Browser Troubleshooting

Use this page after [Diagnostics](../help/diagnostics.md) points to browser automation.

## Connect Fails

Inspect:

- `frontend/src/main/python/tools/browser/chrome_detection.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `frontend/src/main/python/tools/browser/controller.py`
- `frontend/src/main/python/tools/browser/windie_runtime.py`
- `frontend/src/main/permission_service_browser.cjs`

Checks:

- Is a Chromium executable detectable?
- Is `WINDIE_BROWSER_CDP_PORT` valid?
- Is anything else already bound to port `9333`?
- Does `/json/version` respond on the expected CDP URL?
- Did browser feature-pack installation succeed?

Focused tests:

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_browser_registry.py tests/sidecar/tools/test_browser_controller.py -q
cd frontend && npm run test:ci -- PermissionService.test.cjs
```

## Snapshot Has No Useful Elements

Inspect:

- `frontend/src/main/python/tools/browser/enhanced_cdp_pipeline.py`
- `frontend/src/main/python/tools/browser/role_snapshot.py`
- `frontend/src/main/python/tools/browser/ref_registry.py`
- `frontend/src/main/python/tools/browser/observation_store.py`
- `frontend/src/main/python/tools/browser/controller.py`

Checks:

- Waited for page load before snapshot.
- Snapshot limit is not too small for the current page.
- Page did not navigate between paginated snapshot reads.
- CDP DOMSnapshot/AX tree collection did not time out.

Focused tests:

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_enhanced_cdp_pipeline.py tests/sidecar/tools/test_browser_ref_registry.py tests/sidecar/tools/test_browser_observation_store.py -q
```

## Click Or Input Hits The Wrong Element

Inspect:

- `frontend/src/main/python/tools/browser/action_executor.py`
- `frontend/src/main/python/tools/browser/role_snapshot.py`
- `frontend/src/main/python/tools/browser/ref_registry.py`

Checks:

- Use a fresh snapshot after navigation, scroll, or DOM mutation.
- Confirm whether the ref is numeric or role-based.
- Confirm the action executor resolves role refs against the current observed page.
- Avoid adding renderer-side element mapping; this is sidecar/controller ownership.

Focused tests:

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_action_executor.py tests/sidecar/tools/test_browser_ref_registry.py -q
```

## Browser Session UI Is Stale

Inspect:

- `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js`
- `frontend/src/renderer/infrastructure/hooks/useBrowserSessionControl.js`
- `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`
- `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`

Checks:

- Local backend status is ready.
- `status` succeeds before `get_tabs`.
- Polling is active only when subscribers exist and the session is connected.
- Stale async sync requests do not overwrite newer snapshots.

Focused test:

```bash
cd frontend
npm run test:ci -- ChatBrowserSessionControl.test.jsx
```

## Browser File Or Download Path Is Wrong

Inspect:

- `frontend/src/main/python/tools/browser/file_store.py`
- `frontend/src/main/python/tools/browser/windie_runtime.py`
- browser-use download watchdog files under `frontend/src/main/python/tools/browser/browser_use`

Checks:

- Browser-owned paths resolve under `~/.windieos/browser`.
- Parent directories are created through `resolve_browser_path(..., ensure_parent=True)`.
- Download state is not confused with arbitrary filesystem tools.

Focused tests:

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_action_executor.py -q
```

## Backend Emits Browser Tool But Sidecar Does Nothing

Inspect in order:

1. `backend/src/tools/remote_tools/browser.py`
2. `backend/src/tools/tool_policy.py`
3. `frontend/src/main/ipc/ipc_sdk_tool_router.cjs`
4. `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`
5. `frontend/src/main/python/tools/browser/browser_tool.py`
6. `frontend/src/main/python/tools/browser/windie_runtime.py`

Focused tests:

```bash
./scripts/test-backend tests/backend/test_browser_remote_tool.py -q
cd frontend && npm run test:ci -- IpcSdkToolRouter.test.cjs WindieSdkMainRuntime.test.cjs
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py -q
```
