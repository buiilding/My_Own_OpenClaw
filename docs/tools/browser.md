---
summary: "Browser use tool guide for WindieOS dedicated browser control, backend schema exposure, local-runtime execution through the Python sidecar, Browser Use engine ownership, and debugging."
read_when:
  - When changing the browser use tool, browser tool schemas, dedicated browser runtime behavior, browser snapshots, or browser UI status.
  - When debugging browser action failures.
title: "Browser Tool"
---

# Browser Tool

WindieOS browser automation uses the official Browser Use runtime as the local browser execution engine. WindieOS keeps agent orchestration, model-facing tool policy, permission gates, and result normalization; Browser Use owns browser sessions, DOM/state extraction, element indexing, browser actions, and daemon/browser lifecycle.

For browser changes that can cross schema, local-runtime execution, Python sidecar adapters, Electron bridge, renderer controls, CDP launch, snapshots, refs, or files, start with [Browser Change Workflow](../browser/browser_change_workflow.md). For deeper dedicated-browser launch, action-surface, session-UI, and troubleshooting docs, read [Browser Hub](../browser/README.md).

## Runtime Split

| Layer | Responsibility |
| --- | --- |
| Backend | Exposes model-facing `browser` tool schema, validates action payloads, and sends executable browser requests. |
| Renderer | Shows browser connection/status controls and renders SDK-projected tool status. |
| SDK runtime and main process | Route backend tool requests through SDK local-runtime execution, relay execution to the Python sidecar executor, and handle dedicated-browser process integration. |
| Python sidecar | Validates the canonical WindieOS browser payload, invokes the Browser Use CLI daemon, and normalizes Browser Use output back into WindieOS tool results. |
| Browser Use | Owns browser session lifecycle, CDP/Playwright edge cases, state snapshots, element indexing, browser interactions, tab commands, screenshots, and browser recovery behavior. |

## Files to Inspect

- Backend schema: `backend/src/tools/browser/*`
- Backend remote tool: `backend/src/tools/remote_tools/browser.py`
- Python sidecar browser adapter: `frontend/src/main/python/tools/browser/browser_use_engine.py`
- Python sidecar tool entrypoint: `frontend/src/main/python/tools/browser/browser_tool.py`
- Shared browser contract: `frontend/src/main/python/windie_shared/browser_contract*`
- Renderer browser UI: `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`
- Main bridge mapping: `frontend/src/main/sidecar/local_runtime*.cjs`

Backend schema re-exports load the shared browser contract from the explicit
markerless `windie_shared` namespace package path and must not prepend
`frontend/src/main/python` to `sys.path`; backend imports must keep their normal
module precedence.

## Debugging Rules

- Check whether the browser action parsed in backend before debugging local execution.
- Check backend/local-runtime schema parity when a backend-valid action fails locally.
- Check the Browser Use daemon state under `AGENT_BROWSER_USE_HOME`
  (`WINDIE_BROWSER_USE_HOME` in WindieOS launches) or the default WindieOS
  Browser Use home when browser status polling reports a disconnected browser.
- Do not debug browser action reliability in the renderer first; Browser Use is the browser automation engine and WindieOS should only own adapter/result boundaries.

## Deep Docs

- [Browser Control](../browser/browser_control.md)
- [Browser Hub](../browser/README.md)
- [Browser Change Workflow](../browser/browser_change_workflow.md)
- [Dedicated Browser Runtime](../browser/dedicated_browser_runtime.md)
- [Browser Action Surface](../browser/browser_action_surface.md)
- [Browser Troubleshooting](../browser/browser_troubleshooting.md)
- [Local-Runtime Browser Stack](../frontend/sidecar/browser_automation_stack.md)
- [Backend Browser Remote Schema Surface Reference](../backend/tools/browser/browser_remote_schema_surface_reference.md)
- [Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference](../backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
