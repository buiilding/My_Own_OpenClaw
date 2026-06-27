---
summary: "Tools hub for model-facing tools, local-runtime executable tools, browser automation, filesystem/shell actions, and tool-result contracts."
read_when:
  - When adding, removing, or changing tools.
  - When debugging tool-call payloads, local execution, or tool-result handling.
title: "Tools Hub"
---

# Tools Hub

Model-facing tools are split between client/local-runtime manifest
schemas, local-runtime executable implementations backed by local-runtime
Python, backend-owned remote tools and policy/projection, and SDK/main-process
dispatch.

## Tool Families

- [Tool Contracts](tool_contracts.md) explains local manifest schemas, backend remote schemas, local execution, request ids, bundle results, and parity tests.
- [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md) routes model-visible schema, policy, provider projection, local-runtime executable parity, SDK/main dispatch, and result-contract changes.
- [Tool Catalog Matrix](tool_catalog_matrix.md) maps every model-visible tool to schema owners, local-runtime executors, use cases, policy gates, and tests.
- [Tool Execution Lifecycle](tool_execution_lifecycle.md) follows a tool call from prompt exposure through SDK/main dispatch, local execution, result ingress, history, and loop continuation.
- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md) explains profiles, available/disabled tools, disabled capabilities, coordinate method gates, browser gating, and web-search exposure.
- [Web Search Tool](web_search.md) covers backend-owned `web_search`, OpenAI native search, Gemini native grounding, Brave fallback, visibility policy, and result validation.
- [Tool Troubleshooting](tool_troubleshooting.md) routes visibility, schema, dispatch, local-runtime execution, result, artifact, and replay failures to the right owner.
- [Computer Tools](computer.md) covers mouse, keyboard, screenshot, scroll, window switching, and local OS control.
- [Browser Tool](browser.md) covers the dedicated browser runtime, browser action schemas, snapshots, and backend/local-runtime parity.
- [Browser Change Workflow](../browser/browser_change_workflow.md) routes browser changes across backend schema, shared contract, local-runtime execution, local-runtime Python adapters, CDP launch, Electron bridge, renderer controls, files, and tests.
- [Filesystem and Shell Tools](filesystem_shell.md) covers `read_file`, `replace`, shell/process execution, and output formatting.
- [Filesystem and Shell Change Workflow](filesystem_shell_change_workflow.md) routes file/shell changes across backend schema, SDK/main dispatch, Electron bridge argument shaping, local execution, sudo policy, sessions, results, and tests.

## Current Tool Catalogs

Client/local-runtime model-visible tools are supplied by the accepted client manifest. The backend catalog keeps backend-owned tools plus fallback/default entries:

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

Local-runtime executable tools are registered in `frontend/src/main/python/tools/registry.py`. The local-runtime executable registry backed by local-runtime Python modules intentionally mirrors only the executable local actions expected by accepted client/local-runtime schemas.

## Change Path

1. Use [Tool Catalog Matrix](tool_catalog_matrix.md) to identify the static owner.
2. Use [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md) to route schema, visibility, provider, local-runtime, SDK/main, and result-contract changes.
3. Use [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md) to identify any visibility gate.
4. Use [Browser Change Workflow](../browser/browser_change_workflow.md) for browser-specific schema, CDP, snapshot, ref, file, or renderer-session changes.
5. Use [Filesystem and Shell Change Workflow](filesystem_shell_change_workflow.md) for file read/edit, shell command, background process, sudo, working-directory, and local output-shaping changes.
6. Update the owning schema source first: client/local-runtime manifest for local tools, backend catalog/schema for backend-executed tools.
7. Update local-runtime executable argument handling if the local payload changes.
8. Update SDK/main tool routing and Electron bridge payload shaping if correlation, artifacts, screenshots, or bundle behavior changes.
9. Update formatter/outgoing schemas if the visible stream event changes.
10. Add or update backend, SDK/main, renderer, and local-runtime Python tests for the changed boundary.

## Deep Docs

- [Tool System](../architecture/tool_system.md)
- [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md)
- [Tool Catalog Matrix](tool_catalog_matrix.md)
- [Tool Execution Lifecycle](tool_execution_lifecycle.md)
- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
- [Web Search Tool](web_search.md)
- [Tool Troubleshooting](tool_troubleshooting.md)
- [Browser Change Workflow](../browser/browser_change_workflow.md)
- [Filesystem and Shell Change Workflow](filesystem_shell_change_workflow.md)
- Backend Tools Docs Hub (private backend docs)
- [Local-Runtime Tools Docs Hub](../frontend/sidecar/tools/README.md)

## Evidence Notes

- Tool visibility, dispatch, execution, and result return are separate evidence
  points; prove the failing point before editing schemas.
- For local tools, keep backend model-facing schema evidence distinct from
  local-runtime executable manifest evidence.
