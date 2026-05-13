---
summary: "Browser automation guide for WindieOS dedicated browser control, backend schema exposure, sidecar runtime execution, and debugging."
read_when:
  - When changing browser tool schemas, dedicated browser runtime behavior, browser snapshots, or browser UI status.
  - When debugging browser action failures.
title: "Browser Tool"
---

# Browser Tool

WindieOS browser automation uses a dedicated browser runtime controlled by the sidecar. It is not the user's normal browser unless explicitly connected through the dedicated runtime path.

## Runtime Split

| Layer | Responsibility |
| --- | --- |
| Backend | Exposes model-facing `browser` tool schema, validates action payloads, and sends executable browser requests. |
| Renderer | Shows browser connection/status controls and routes tool execution through the shared tool runner. |
| Main process | Relays tool requests to the sidecar local backend and handles dedicated-browser process integration. |
| Sidecar | Owns browser sessions, Chrome/CDP launch or connect behavior, snapshots, action execution, and compatibility aliases. |

## Files to Inspect

- Backend schema: `backend/src/tools/browser/*`
- Backend remote tool: `backend/src/tools/remote_tools/browser.py`
- Sidecar runtime: `frontend/src/main/python/tools/browser/*`
- Shared browser contract: `frontend/src/main/python/windie_shared/browser_contract*`
- Renderer browser UI: `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`
- Main bridge mapping: `frontend/src/main/local_backend_bridge*.cjs`

## Debugging Rules

- Check whether the browser action parsed in backend before debugging sidecar execution.
- Check backend-sidecar schema parity when a backend-valid action fails locally.
- Check the active page/session state when browser status polling reports a disconnected browser.
- Do not assume stock Chrome profile behavior; WindieOS uses a dedicated persistent browser profile.

## Deep Docs

- [Browser Control](../browser/browser_control.md)
- [Frontend Sidecar Browser Stack](../frontend/sidecar/browser_automation_stack.md)
- [Backend Browser Remote Schema Surface + Compatibility Contract Reference](../backend/tools/browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](../backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
