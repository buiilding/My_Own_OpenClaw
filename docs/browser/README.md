---
summary: "Browser automation hub for the desktop dedicated browser runtime, action dispatch, snapshots, session UI, files, downloads, and troubleshooting."
read_when:
  - When changing browser automation, browser session UI, dedicated browser launch, CDP snapshots, browser files, or browser tests.
  - When debugging browser tool failures across backend, renderer, Electron main, local-runtime execution, and local-runtime Python adapters.
title: "Browser Hub"
---

# Browser Hub

Browser automation is a first-class local tool path. The hosted
backend owns the model-facing browser tool, agent loop, and policy; Electron
main and renderer own permission/readiness UI and status controls; the local
runtime executes the contract through the local-runtime Python Browser Use
adapter. Browser Use owns browser automation mechanics.

## Browser Pages

- [Browser Control](browser_control.md) documents the current action surface.
- [How to Run Browser Control](browser_control_run.md) covers source-run setup and manual smoke checks.
- [Browser Change Workflow](browser_change_workflow.md) routes browser changes across backend schema, shared contract, local-runtime execution, local-runtime Python adapters, CDP launch, Electron bridge, renderer controls, files, and tests.
- [Dedicated Browser Runtime](dedicated_browser_runtime.md) maps CDP launch, profile isolation, local-runtime dispatch, local-runtime Python adapters, and browser file storage.
- [Browser Action Surface](browser_action_surface.md) maps actions to runtime handlers, snapshot refs, extraction, tab control, and file helpers.
- [Browser Troubleshooting](browser_troubleshooting.md) maps symptoms to code roots and focused tests.

## Runtime Boundaries

| Layer | Owns | Files |
| --- | --- | --- |
| Backend | Model-facing `browser` tool schema and provider health/tool policy | `backend/src/tools/tool_catalog.py`, `backend/src/tools/remote_tools/browser.py`, `backend/src/tools/tool_policy.py` |
| Renderer | Header/session controls and polling store | `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`, `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js` |
| Electron main | Tool execution bridge and browser automation permission/install IPC | `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`, `frontend/src/main/permissions/permission_service_browser.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs` |
| Local runtime implementation | Browser Use engine adapter, action dispatch, result normalization, browser-local file helpers | `frontend/src/main/python/tools/browser/browser_use_engine.py`, `frontend/src/main/python/tools/browser/browser_tool.py` |
| Browser Use | Browser daemon/session lifecycle, CDP/Playwright action mechanics, DOM state, element indexes, tab commands | installed `browser-use[cli]` package |
| Shared contract | Browser action schema consumed directly by backend and local-runtime validation | `frontend/src/main/python/windie_shared/browser_contract.py` |

## Development Rule

Do not edit the renderer to compensate for local-runtime browser payload bugs. Start with [Browser Change Workflow](browser_change_workflow.md), verify the local-runtime Python browser action result first, then the Electron bridge result, then the renderer session store.

## Focused Validation

```bash
<windie> test backend tests/backend/test_browser_remote_tool.py -q
<windie> test local-runtime tests/sidecar/test_browser_registry.py tests/sidecar/test_feature_pack_installer.py -q
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine.py -q
<windie> test frontend -- ChatBrowserSessionControl.test.jsx
```
