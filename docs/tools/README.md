---
summary: "Tools hub for WindieOS model-facing tools, sidecar executable tools, browser automation, filesystem/shell actions, and tool-result contracts."
read_when:
  - When adding, removing, or changing tools.
  - When debugging tool-call payloads, local execution, or tool-result handling.
title: "Tools Hub"
---

# Tools Hub

WindieOS tools are split between backend model-facing definitions and frontend/sidecar executable implementations.

## Tool Families

- [Tool Contracts](tool_contracts.md) explains backend schema, sidecar execution, request ids, bundle results, and parity tests.
- [Computer Tools](computer.md) covers mouse, keyboard, screenshot, scroll, window switching, and local OS control.
- [Browser Tool](browser.md) covers the dedicated Windie browser runtime, browser action schemas, snapshots, and backend-sidecar parity.
- [Filesystem and Shell Tools](filesystem_shell.md) covers `read_file`, `replace`, shell/process execution, and output formatting.

## Current Tool Catalogs

Backend model-visible tools are defined in `backend/src/tools/tool_catalog.py`:

- `mouse_control`
- `keyboard_control`
- `screenshot`
- `scroll_control`
- `switch_window`
- `wait`
- `get_open_windows`
- `get_system_stats`
- `open_app`
- `run_shell_command`
- `process`
- `read_file`
- `replace`
- `browser`

Sidecar executable tools are registered in `frontend/src/main/python/tools/registry.py`. The sidecar registry intentionally mirrors only the executable local actions expected by backend schemas.

## Change Path

1. Update the backend catalog/schema owner first.
2. Update sidecar executable schema/runtime if the local payload changes.
3. Update renderer tool-runner payload shaping if correlation, artifacts, screenshots, or bundle behavior changes.
4. Update formatter/outgoing schemas if the visible stream event changes.
5. Add or update backend, frontend, and sidecar tests for the changed boundary.

## Deep Docs

- [Tool System](../architecture/tool_system.md)
- [Backend Tools Docs Hub](../backend/tools/README.md)
- [Frontend Sidecar Tools Docs Hub](../frontend/sidecar/tools/README.md)
- [Frontend Tool Execution Service + Hook Runtime Reference](../frontend/renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md)
