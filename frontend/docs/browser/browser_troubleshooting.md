---
summary: "Browser troubleshooting playbook for the desktop connect path, snapshots, refs, downloads/files, permissions, feature packs, and renderer session controls."
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
- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `frontend/src/main/permissions/permission_service_browser.cjs`

Checks:

- Is a Chromium executable detectable?
- Is `AGENT_BROWSER_CDP_PORT` (`WINDIE_BROWSER_CDP_PORT` in WindieOS launches)
  valid?
- Is anything else already bound to port `9333`?
- Does `/json/version` respond on the expected CDP URL?
- Is the local-runtime Python browser adapter using Playwright `>=1.59.0`?
- Did browser feature-pack installation succeed?

If the log contains `Protocol error (Browser.setDownloadBehavior): Browser context
management is not supported`, the CDP endpoint accepted the websocket
connection but rejected the command Playwright sends during attach setup. The
launcher should restart only a matching dedicated-profile Chrome process on that
port; if another process owns the port, stop it manually or choose a different
`AGENT_BROWSER_CDP_PORT` (`WINDIE_BROWSER_CDP_PORT` in WindieOS launches).

Focused tests:

```bash
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/test_browser_registry.py tests/sidecar/tools/test_browser_use_engine.py -q
<windie> test frontend -- PermissionService.test.cjs
```

## Snapshot Has No Useful Elements

Inspect:

- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- Browser Use CLI `state` command output

Checks:

- Waited for page load before snapshot.
- Snapshot limit is not too small for the current page.
- Page did not navigate between paginated snapshot reads.
- Browser Use returned non-empty state text.

Focused tests:

```bash
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_use_engine.py -q
```

## Click Or Input Hits The Wrong Element

Inspect:

- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- Browser Use CLI state text from the latest `snapshot`

Checks:

- Use a fresh snapshot after navigation, scroll, or DOM mutation.
- Confirm the element target is a numeric Browser Use `index`.
- Avoid adding renderer-side element mapping; Browser Use owns element indexing.

Focused tests:

```bash
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_use_engine.py -q
```

## Browser Session UI Is Stale

Inspect:

- `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js`
- `frontend/src/renderer/app/runtime/desktopBrowserSessionRuntimeClient.js`
- `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`

Checks:

- Local runtime status is ready.
- `status` succeeds before `get_tabs`.
- Polling is active only when subscribers exist and the session is connected.
- Stale async sync requests do not overwrite newer snapshots.

Focused test:

```bash
cd frontend
<windie> test frontend -- ChatBrowserSessionControl.test.jsx
```

## Browser File Or Download Path Is Wrong

Inspect:

- `frontend/src/main/python/tools/browser/file_store.py`
- `frontend/src/main/python/tools/browser/browser_use_engine.py`

Checks:

- Browser-owned paths resolve under `~/.desktop-agent/browser` unless
  `AGENT_BROWSER_FILES_DIR` (`WINDIE_BROWSER_FILES_DIR` in WindieOS launches)
  overrides the root. Use `WINDIE_BROWSER_FILES_DIR=~/.windieos/browser` only
  when intentionally reusing legacy browser-local files.
- Parent directories are created through `resolve_browser_path(..., ensure_parent=True)`.
- Download state is not confused with arbitrary filesystem tools.

Focused tests:

```bash
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine.py -q
```

## Backend Emits Browser Tool But Local Runtime Does Nothing

Inspect in order:

1. `backend/src/tools/remote_tools/browser.py`
2. `backend/src/tools/tool_policy.py`
3. `packages/windie-sdk-js/src/runtime/Agent.ts`
4. `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`
5. `frontend/src/main/python/tools/browser/browser_tool.py`
6. `frontend/src/main/python/tools/browser/browser_use_engine.py`

Focused tests:

```bash
<windie> test backend tests/backend/test_browser_remote_tool.py -q
<windie> test frontend -- AgentSdkClient AgentSdkConversationRuntime
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_tool.py -q
```
