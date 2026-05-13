---
summary: "Browser automation hub for WindieOS dedicated browser runtime, action dispatch, snapshots, session UI, files, downloads, and troubleshooting."
read_when:
  - When changing browser automation, browser session UI, dedicated browser launch, CDP snapshots, browser files, or browser tests.
  - When debugging browser tool failures across backend, renderer, Electron main, and sidecar.
title: "Browser Hub"
---

# Browser Hub

WindieOS browser automation is a first-class local tool path. The backend exposes the model-facing browser tool, while the frontend sidecar owns execution through a Windie-dedicated Chromium profile.

## Browser Pages

- [Browser Control](browser_control.md) documents the current action surface.
- [How to Run Browser Control](browser_control_run.md) covers source-run setup and manual smoke checks.
- [Browser Change Workflow](browser_change_workflow.md) routes browser changes across backend schema, shared contract, sidecar runtime, CDP launch, Electron bridge, renderer controls, files, and tests.
- [Dedicated Browser Runtime](dedicated_browser_runtime.md) maps CDP launch, profile isolation, sidecar dispatch, and browser file storage.
- [Browser Action Surface](browser_action_surface.md) maps actions to runtime handlers, snapshot refs, extraction, tab control, and file helpers.
- [Browser Troubleshooting](browser_troubleshooting.md) maps symptoms to code roots and focused tests.

## Runtime Boundaries

| Layer | Owns | Files |
| --- | --- | --- |
| Backend | Model-facing `browser` tool schema and provider health/tool policy | `backend/src/tools/tool_catalog.py`, `backend/src/tools/remote_tools/browser.py`, `backend/src/tools/tool_policy.py` |
| Renderer | Header/session controls and polling store | `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`, `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js` |
| Electron main | Tool execution bridge and browser automation permission/install IPC | `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`, `frontend/src/main/permission_service_browser.cjs`, `frontend/src/main/permission_ipc_runtime.cjs` |
| Sidecar | Browser runtime, action dispatch, CDP launch, snapshots, refs, files | `frontend/src/main/python/tools/browser` |
| Shared contract | Browser action schema re-exported into sidecar | `frontend/src/main/python/windie_shared/browser_contract.py`, `frontend/src/main/python/tools/browser/schemas.py` |

## Development Rule

Do not edit the renderer to compensate for sidecar/browser payload bugs. Start with [Browser Change Workflow](browser_change_workflow.md), verify the sidecar action result first, then the Electron bridge result, then the renderer session store.

## Focused Validation

```bash
./scripts/test-backend tests/backend/test_browser_remote_tool.py -q
./scripts/test-sidecar tests/sidecar/test_browser_registry.py tests/sidecar/test_browser_runtime_architecture.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_action_executor.py -q
cd frontend && npm run test:ci -- ChatBrowserSessionControl.test.jsx
```
