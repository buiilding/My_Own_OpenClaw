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
- [Tool Catalog Matrix](tool_catalog_matrix.md) maps every model-visible tool to backend schema owners, sidecar executors, use cases, policy gates, and tests.
- [Tool Execution Lifecycle](tool_execution_lifecycle.md) follows a tool call from prompt exposure through renderer dispatch, sidecar execution, result ingress, history, and loop continuation.
- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md) explains profiles, available/disabled tools, disabled capabilities, coordinate method gates, browser gating, and web-search exposure.
- [Tool Troubleshooting](tool_troubleshooting.md) routes visibility, schema, dispatch, sidecar, result, artifact, and replay failures to the right owner.
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

1. Use [Tool Catalog Matrix](tool_catalog_matrix.md) to identify the static owner.
2. Use [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md) to identify any visibility gate.
3. Update the backend catalog/schema owner first.
4. Update sidecar executable schema/runtime if the local payload changes.
5. Update renderer tool-runner payload shaping if correlation, artifacts, screenshots, or bundle behavior changes.
6. Update formatter/outgoing schemas if the visible stream event changes.
7. Add or update backend, frontend, and sidecar tests for the changed boundary.

## Deep Docs

- [Tool System](../architecture/tool_system.md)
- [Tool Catalog Matrix](tool_catalog_matrix.md)
- [Tool Execution Lifecycle](tool_execution_lifecycle.md)
- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
- [Tool Troubleshooting](tool_troubleshooting.md)
- [Backend Tools Docs Hub](../backend/tools/README.md)
- [Frontend Sidecar Tools Docs Hub](../frontend/sidecar/tools/README.md)
- [Frontend Tool Execution Service + Hook Runtime Reference](../frontend/renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md)
