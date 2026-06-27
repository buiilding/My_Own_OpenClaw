---
summary: "Tool troubleshooting guide for routing model-visible tool visibility, schema, dispatch, local execution, result, artifact, and replay failures to the right owner."
read_when:
  - When a model-visible tool is missing, malformed, not executing, returning the wrong result, or breaking replay.
  - When deciding which backend, renderer, Electron main, or local-runtime implementation tests should cover a tool regression.
title: "Tool Troubleshooting"
---

# Tool Troubleshooting

Use this page for symptom-to-owner routing. After identifying the owner, switch to the focused implementation doc.

## Fast Triage

| Symptom | Likely owner | First check |
| --- | --- | --- |
| Tool not shown to model | backend tool policy/profile/provider health | [Tool Policy Profiles](tool_policy_profiles_and_capabilities.md) |
| Tool schema missing fields | owning schema source or provider projection | client manifest source, `backend/src/tools/{computer,filesystem,system}/schemas.py`, browser `frontend/src/main/python/windie_shared/browser_contract*.py`, `backend/src/tools/provider_projection.py` |
| Model calls disabled coordinate method | backend method validation | `ToolPolicy.get_method_validation_errors()` |
| Backend logs tool call but local runtime never runs it | websocket formatter/outgoing event or SDK/main local-runtime tool router | backend formatter tests, SDK/main local-runtime dispatch tests |
| SDK/main says unknown tool | local-runtime registry parity or SDK dispatch map | `frontend/src/main/python/tools/registry.py`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` |
| Local runtime returns `Tool not found` | local-runtime implementation registration/import failure | local-runtime executable registry logs backed by local-runtime Python modules and `tests/sidecar/test_tool_registry.py` |
| Tool succeeds but no model continuation | backend waiting storage/result receiver | `backend/src/agent/tools/waiting/**` |
| Tool result visible but future replay breaks | SDK projection, transcript adapter, or backend history shape | SDK conversation runtime docs, transcript adapter docs, and backend history docs |
| Screenshot or artifact missing | renderer upload path, backend artifact route, endpoint resolution | [Artifacts and Attachments](../desktop/artifacts_and_attachments.md) |
| Browser action rejected | Local-runtime Python browser validation for local execution, backend validation for backend-owned browser capabilities | [Browser Action Surface](../browser/browser_action_surface.md) |

## Model Visibility Failures

Questions to answer:

1. Is the tool in `backend/src/tools/tool_catalog.py`?
2. Does `ToolPolicy.filter_tool_schemas()` remove it?
3. Is the current `agent_tool_profile` expected to include it?
4. Did the client provide `agent_available_tools` that excludes it?
5. Is a disabled capability hiding it?
6. Is provider health hiding `ocr`, `vision`, `embedding`, `browser`, or `web_search`?

Read:

- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
- Backend Tool Policy Runtime (private backend docs)

## Schema and Parser Failures

Questions to answer:

1. Is the schema canonical function-tool shape?
2. Did provider projection adapt it for a specific model provider?
3. Did the parser normalize the provider-native call into the direct tool name?
4. Is validation failing before or after coordinate preparation?
5. Is the model trying to use stale wrapper-style tool payloads?

Read:

- [Tool Contracts](tool_contracts.md)
- Backend Tool Registry and Schema Cache (private backend docs)
- Backend Tool Policy Runtime (private backend docs)

## Dispatch and Execution Failures

Questions to answer:

1. Did backend send a `tool-call` or `tool-bundle` event?
2. Did the Agent SDK runtime receive the matching event type?
3. Did SDK/main construct the executable local-runtime payload with the expected args?
4. Did Electron main route JSON-RPC to the local-runtime daemon?
5. Did the local-runtime executable registry backed by local-runtime Python modules import the tool module lazily without import error?
6. Did the executable tool return a native `ToolResult`?

Read:

- [Tool Execution Lifecycle](tool_execution_lifecycle.md)
- [Local-Runtime Registry and Result Contract](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)

## Result and History Failures

Questions to answer:

1. Does the returned result include the same `request_id` or `bundle_id`?
2. Did SDK/main send `tool-result` or `tool-bundle-result` back to backend?
3. Did waiting storage resolve the pending future?
4. Did result processing format both display output and model-facing `output`?
5. Did history commit preserve tool-call/tool-output linkage?
6. Did transcript persistence preserve structured payload fields needed for replay?

Read:

- Backend Tool Result Ingress (private backend docs)
- Backend Tool Result Processor (private backend docs)
- Backend History Hub (private backend docs)
- [Memory Hub](../memory/README.md)

## Tool-Specific Starting Points

| Tool family | Docs | Tests |
| --- | --- | --- |
| computer | [Computer Tools](computer.md), [Local-Runtime Computer Implementation](../frontend/sidecar/tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md) | `tests/sidecar/test_mouse_tool.py`, `tests/sidecar/test_keyboard_tool.py`, `tests/sidecar/test_screenshot_tool.py`, `tests/sidecar/test_scroll_tool.py` |
| shell/process | [Filesystem and Shell Tools](filesystem_shell.md), [Shell Runtime](../frontend/sidecar/tools/shell_and_process_session_runtime_reference.md) | `tests/sidecar/test_shell_process_tool.py`, `tests/sidecar/test_shell_process_registry.py` |
| filesystem | [Filesystem and Shell Tools](filesystem_shell.md), [Read File Runtime](../frontend/sidecar/tools/filesystem/read_file_window_pagination_binary_guard_and_truncation_contract_reference.md), [Replace Runtime](../frontend/sidecar/tools/filesystem/replace_engine_match_modes_patch_chunks_and_atomic_write_contract_reference.md) | `tests/sidecar/test_read_file_tool.py`, `tests/sidecar/test_replace_tool.py` |
| browser | [Browser Tool](browser.md), [Browser Hub](../browser/README.md) | `tests/backend/test_browser_remote_tool.py`, `tests/sidecar/tools/test_browser_tool.py`, `tests/sidecar/tools/test_browser_schemas.py` |
| web search | [Providers Hub](../providers/README.md), [OpenAI Provider](../providers/openai.md), [Gemini Provider](../providers/gemini.md) | `tests/backend/test_web_search_tool.py` |

## Minimum Regression Coverage

For a tool regression fix, add the narrowest tests that cross the failing boundary:

- policy visibility bug: backend `ToolPolicy` test
- schema drift: backend schema/registry test and local-runtime executable parity test if local execution is involved
- local-runtime implementation bug: local-runtime Python unit test for the executable tool
- SDK/main dispatch bug: SDK runtime or IPC tool-router test
- waiting/result bug: backend result receiver/storage/processor test
- replay bug: renderer transcript or backend rehydrate/history test
