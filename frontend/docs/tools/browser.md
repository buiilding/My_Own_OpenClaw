---
summary: "Browser use tool guide for desktop dedicated browser control, backend schema exposure, local-runtime Python execution, Browser Use engine ownership, and debugging."
read_when:
  - When changing the browser use tool, browser tool schemas, dedicated browser runtime behavior, browser snapshots, or browser UI status.
  - When debugging browser action failures.
title: "Browser Tool"
---

# Browser Tool

The browser tool path uses the official Browser Use runtime as the local
browser execution engine. The hosted backend keeps agent orchestration and
model-facing tool policy, Electron main and renderer keep permission gates and
visible status, and the local-runtime Python browser adapter normalizes Browser
Use results. Browser Use owns browser sessions, DOM/state extraction, element
indexing, browser actions, and daemon/browser lifecycle.

For browser changes that can cross schema, local-runtime execution, local-runtime Python adapters, Electron bridge, renderer controls, CDP launch, snapshots, refs, or files, start with [Browser Change Workflow](../browser/browser_change_workflow.md). For deeper dedicated-browser launch, action-surface, session-UI, and troubleshooting docs, read [Browser Hub](../browser/README.md).

## Runtime Split

| Layer | Responsibility |
| --- | --- |
| Backend | Exposes model-facing `browser` tool schema, validates action payloads, and sends executable browser requests. |
| Renderer | Shows browser connection/status controls and renders SDK-projected tool status. |
| SDK runtime and main process | Route backend tool requests through SDK local-runtime execution, relay execution to the local-runtime Python executor, and handle dedicated-browser process integration. |
| Local-runtime Python browser adapter | Validates the canonical browser payload, invokes the Browser Use CLI daemon, and normalizes Browser Use output back into native tool results. |
| Browser Use | Owns browser session lifecycle, CDP/Playwright edge cases, state snapshots, element indexing, browser interactions, tab commands, screenshots, and browser recovery behavior. |

## Files to Inspect

- Backend schema: `backend/src/tools/browser/*`
- Backend remote tool: `backend/src/tools/remote_tools/browser.py`
- local-runtime Python browser adapter: `frontend/src/main/python/tools/browser/browser_use_engine.py`
- local-runtime Python tool entrypoint: `frontend/src/main/python/tools/browser/browser_tool.py`
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
  (`WINDIE_BROWSER_USE_HOME` in WindieOS launches) or the default app
  Browser Use home when browser status polling reports a disconnected browser.
- Do not debug browser action reliability in the renderer first; Browser Use is
  the browser automation engine and the desktop/local-runtime path should only
  own adapter/result boundaries.

## Deep Docs

- [Browser Control](../browser/browser_control.md)
- [Browser Hub](../browser/README.md)
- [Browser Change Workflow](../browser/browser_change_workflow.md)
- [Dedicated Browser Runtime](../browser/dedicated_browser_runtime.md)
- [Browser Action Surface](../browser/browser_action_surface.md)
- [Browser Troubleshooting](../browser/browser_troubleshooting.md)
- [Local-Runtime Browser Stack](../frontend/sidecar/browser_automation_stack.md)
- Backend Browser Remote Schema Surface Reference (private backend docs)
- Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference (private backend docs)
