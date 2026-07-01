---
summary: "Deep backend reference for remote tool stubs across computer/system/filesystem/browser domains: args-model binding, concrete direct-tool dispatch, request-id sourcing, payload model_dump behavior, and cross-layer dispatch implications."
read_when:
  - When modifying remote stub classes, request-id generation, or payload serialization rules.
  - When changing concrete remote-tool payload serialization.
  - When debugging mismatches where backend remote tool payload looks valid but local execution fails or correlates to wrong request.
title: "Remote Tool Domain Payload and Request-ID Semantics Reference"
---

# Remote Tool Domain Payload and Request-ID Semantics Reference

This page documents behavior in:

- `backend/src/tools/remote_tools/base.py`
- `backend/src/tools/tool_catalog.py`
- `backend/src/tools/remote_tools/computer.py`
- `backend/src/tools/remote_tools/system.py`
- `backend/src/tools/remote_tools/filesystem.py`
- `backend/src/tools/remote_tools/browser.py`
- `backend/src/llm/parser_types.py`
- `backend/src/agent/execution/tool_call_bridge.py`
- `frontend/src/main/python/tools/registry.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_browser_remote_tool.py`
- `tests/backend/test_remote_tool_contract.py`

## Remote Stub Role

Remote tool classes do not execute user actions in backend.

They provide:

- validated args model binding (Pydantic)
- schema declarations for tool-calling
- remote execution envelope (`RemoteToolResult`) passed to the SDK/main local-runtime lane

## Base Result Contract

`RemoteToolResult` fields:

- `tool_name`
- `args`
- `request_id`
- `is_remote=True`

`to_dict()` preserves the same fields and is used for transport/debug surfaces.

## Request-ID Sourcing Rules

`RemoteToolBase._get_request_id(ctx)` precedence:

1. reuse `ctx.session.metadata["request_id"]` when present
2. otherwise generate UUID

`_build_remote_result(...)` uses this default unless caller passes explicit `request_id`.

Test-backed behavior:

- metadata request-id reuse works
- generated fallback ID works when metadata is absent
- explicit override beats metadata-sourced request id
- `RemoteWaitTool` reuses the active session request id for local-runtime result
  correlation, matching sibling concrete remote stubs
- `_build_remote_result(...)` keeps model defaults in serialized args payload (for example optional defaults like mouse `duration`)

## Domain Class Matrix

### Computer domain (`remote_tools/computer.py`)

Classes:

- `RemoteMouseTool` (`MouseControlArgs`)
- `RemoteGroundedMouseTool` (`GroundedMouseActionArgs`)
- `RemoteKeyboardTool` (`KeyboardControlArgs`)
- `RemoteScreenshotTool` (`ScreenshotToolArgs`)
- `RemoteScrollTool` (`ScrollControlArgs`)
- `RemoteGroundedScrollTool` (`GroundedScrollActionArgs`)
- `RemoteSwitchTabTool` (`SwitchTabArgs`) for the `switch_window` tool
- `RemoteWaitTool` (`WaitToolArgs`)
- `RemoteGetOpenWindowsTool` (`GetOpenWindowsArgs`)

Behavior:

- each concrete computer stub binds directly to its Pydantic args model
- computer stubs use `_build_remote_result(...)`
- `category` is `ToolDomain.COMPUTER`

Test-backed coverage:

- `tests/backend/test_remote_tools.py::test_remote_mouse_tool_schema_explicitly_guides_ocr_for_text_targets`
- `tests/backend/test_computer_tool_catalog_parity.py`

### Dispatch Path

Standard backend tool-call ingress is direct-name based. The parser path
(`ToolCallSchema.extract_tool_call` in `parser_types.py`) accepts only the
standard `functionCall` shape and returns the tool name/args it was given. The
native tool-call bridge (`tool_call_bridge.to_parsed_tool_call`) likewise keeps
provider-native tool names and arguments intact.

Consequence:

- normal model-driven execution hits concrete remote stubs (`RemoteMouseTool`, `RemoteKeyboardTool`, `RemoteShellTool`, `RemoteReplaceTool`, etc.)
- wrapper names are not registered in the backend remote catalog

### System domain (`remote_tools/system.py`)

Classes:

- `RemoteGetSystemStatsTool` (`GetSystemStatsArgs`)
- `RemoteOpenAppTool` (`OpenAppArgs`)
- `RemoteShellTool` (`RunShellCommandArgs`)
- `RemoteProcessTool` (`ProcessShellCommandArgs`)

Behavior:

- category `ToolDomain.SYSTEM`
- all call `_build_remote_result(...)` with default request-id sourcing

### Filesystem domain (`remote_tools/filesystem.py`)

Classes:

- `RemoteReadFileTool` (`ReadFileArgs`)
- `RemoteReplaceTool` (`ReplaceArgs`)

Behavior:

- category `ToolDomain.FILESYSTEM`
- default request-id sourcing via `_build_remote_result(...)`

### Browser domain (`remote_tools/browser.py`)

Class:

- `RemoteBrowserTool` (`BrowserControlArgs`)

Behavior difference:

- constructs `RemoteToolResult` directly
- uses the same generic `Tool.get_json_schema(...)` path as other remote stubs for model-facing declarations
- relies on the canonical backend browser args model to define the model-visible action/field set
- uses `args.model_dump(exclude_defaults=True, exclude_none=True)`
- this omits unset/default fields and reduces payload size

Other remote stubs generally use `args.model_dump()` (defaults retained).

## Payload Shape Implications

Because model_dump strategies differ by tool class:

- browser payloads are sparse (only non-default and non-null)
- most other tool payloads include defaulted fields

Integration consequence:

- local-runtime adapters must tolerate both sparse and fully-populated payload forms

## Registry and Export Wiring

`tool_catalog.py` defines the canonical name->class mapping helpers. Concrete
remote stubs live in the matching `backend/src/tools/remote_tools/<domain>.py`
module instead of a package-level re-export surface.

Contract test (`test_remote_tool_contract.py`) ensures names exactly match the local-runtime exposed tool set.

## Args Model Enforcement Boundary

Each remote class sets `args_model` to backend schema models:

- computer schemas in `backend/src/tools/computer/schemas.py`
- system schemas in `backend/src/tools/system/schemas.py`
- filesystem schemas in `backend/src/tools/filesystem/schemas.py`
- browser schema in the shared browser contract loaded by
  `backend/src/tools/browser/shared_contract_loader.py`

This enforces backend-side parse constraints before remote envelope creation.

Runtime boundary reminder:

- backend validation success does not guarantee local execution success; the local-runtime implementation may apply stricter action-specific runtime checks

## Debug Checklist

If request/result correlation is off:

1. inspect whether class uses session metadata request id or explicit override
2. verify emitted request_id is propagated into the SDK tool-call envelope
3. confirm returned `tool-result`/`tool-bundle-result` uses same correlation id

If payload fields seem missing:

1. check whether tool is browser (sparse `model_dump`) or non-browser (full `model_dump`)
2. inspect schema defaults for omitted fields
3. verify local-runtime action adapter defaulting assumptions
4. for browser tools, verify whether missing fields/actions are absent from the canonical backend browser args model rather than dropped later at runtime

## Related Docs

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [System Tool Direct Schema and Remote Catalog Contract Reference](../contracts/system_tool_direct_schema_and_remote_catalog_contract_reference.md)
- [Browser Remote Schema Surface Reference](../browser/browser_remote_schema_surface_reference.md)
- [Local-Runtime Registry and Result Contract](../../../frontend/local_runtime_python/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
