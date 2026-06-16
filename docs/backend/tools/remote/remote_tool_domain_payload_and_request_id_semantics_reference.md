---
summary: "Deep backend reference for remote tool stubs across computer/system/filesystem/browser domains: args-model binding, unified computer/system normalization contracts, request-id sourcing, payload model_dump behavior, and cross-layer dispatch implications."
read_when:
  - When modifying remote stub classes, especially unified `computer_use`/`system_use` routing, request-id generation, or payload serialization rules.
  - When changing remote unified-wrapper dispatch or concrete subtool payload serialization.
  - When debugging mismatches where backend remote tool payload looks valid but sidecar execution fails or correlates to wrong request.
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
- remote execution envelope (`RemoteToolResult`) passed to frontend/sidecar

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
- `RemoteWaitTool` reuses the active session request id for frontend result
  correlation, matching sibling concrete remote stubs
- `_build_remote_result(...)` keeps model defaults in serialized args payload (for example optional defaults like mouse `duration`)

## Domain Class Matrix

### Computer domain (`remote_tools/computer.py`)

Classes:

- `RemoteComputerUseTool` (`ComputerUseArgs`)
- `RemoteMouseTool` (`MouseControlArgs`)
- `RemoteKeyboardTool` (`KeyboardControlArgs`)
- `RemoteScreenshotTool` (`ScreenshotToolArgs`)
- `RemoteScrollTool` (`ScrollControlArgs`)
- `RemoteSwitchTabTool` (`SwitchTabArgs`) for the `switch_window` tool
- `RemoteWaitTool` (`WaitToolArgs`)
- `RemoteGetOpenWindowsTool` (`GetOpenWindowsArgs`)

Behavior:

- `RemoteComputerUseTool` uses `_COMPUTER_USE_MODEL_BY_TOOL` to re-validate `arguments` with tool-specific schemas before envelope creation
- `RemoteComputerUseTool` uses `_get_request_id(ctx)` and returns `RemoteToolResult` directly
- non-unified computer stubs use `_build_remote_result(...)`
- `category` is `ToolDomain.COMPUTER`

### Unified `computer_use` metadata and argument contract

`ComputerUseArgs` enforces a strict envelope:

- `tool`: one of `mouse_control|keyboard_control|screenshot|scroll_control|switch_window|wait`
- `metadata`: required `ComputerUseMetadata` object
  - required string fields: `description`, `explanation`, `expectation`
  - each field has `min_length=1`
- `arguments`: free-form object validated at runtime against selected tool schema

Runtime validation path:

1. model parses envelope as `ComputerUseArgs`
2. `RemoteComputerUseTool.execute_remote(...)` selects concrete Pydantic model using `_COMPUTER_USE_MODEL_BY_TOOL[tool]`
3. selected model re-validates `arguments` (`model_validate(...)`)
4. validated args are serialized with `model_dump()` into remote envelope

Runtime envelope shaping nuance:

- emitted `tool_name` becomes selected concrete subtool name (for example `mouse_control`), not `computer_use`
- `metadata` fields do not flow into emitted `args`; only validated concrete action arguments are forwarded

This keeps the optional unified `computer_use` remote stub aligned with the
current direct computer tool schemas.

Prompt/schema guidance contract for unified tool descriptions:

- description explicitly requires metadata payload for every call
- mouse targeting guidance instructs:
  - `find_coordinates_by='ocr'` + exact `ocr_text` for text targets
  - `find_coordinates_by='prediction'` + detailed visual `source_description` for non-text targets
  - `drag_to_find_coordinates_by='prediction'` + `destination_description` for drag drop targets

Test-backed coverage:

- `tests/backend/test_remote_tools.py::test_remote_computer_use_schema_enforces_metadata_shape_and_mouse_guidance`
- `tests/backend/test_remote_tools.py::test_remote_mouse_tool_schema_explicitly_guides_ocr_for_text_targets`

### Dispatch Path

Standard backend tool-call ingress is direct-name based. The parser path
(`ToolCallSchema.extract_tool_call` in `parser_types.py`) accepts only the
standard `functionCall` shape and returns the tool name/args it was given. The
native tool-call bridge (`tool_call_bridge.to_parsed_tool_call`) likewise keeps
provider-native tool names and arguments intact.

Consequence:

- normal model-driven execution hits concrete remote stubs (`RemoteMouseTool`, `RemoteKeyboardTool`, `RemoteShellTool`, `RemoteReplaceTool`, etc.)
- `RemoteComputerUseTool` and `RemoteSystemUseTool` are explicit invocation paths for callers that selected the unified wrapper name

### System domain (`remote_tools/system.py`)

Classes:

- `RemoteSystemUseTool` (`SystemUseArgs`)
- `RemoteGetSystemStatsTool` (`GetSystemStatsArgs`)
- `RemoteOpenAppTool` (`OpenAppArgs`)
- `RemoteShellTool` (`RunShellCommandArgs`)
- `RemoteProcessTool` (`ProcessShellCommandArgs`)

Behavior:

- category `ToolDomain.SYSTEM`
- all call `_build_remote_result(...)` with default request-id sourcing

### Unified `system_use` explanation and argument contract

`SystemUseArgs` is the backend wrapper model for system/filesystem actions:

- `tool`: one of `run_shell_command|replace|read_file|get_system_stats|get_open_windows`
- `explanation`: canonical top-level rationale field for the unified wrapper
- `arguments`: action payload object, re-validated against the selected concrete tool model

Wrapper boundary:

- `open_app` and `process` are intentionally **not** part of `system_use.tool`.
- those actions remain direct tools (`open_app`, `process`) in backend declarations and sidecar runtime.

Normalization behavior in `SystemUseArgs.normalize_explanation`:

- top-level `explanation` is trim-normalized in place
- nested `arguments.explanation` is ignored and never promoted

Runtime path in `RemoteSystemUseTool.execute_remote(...)`:

1. resolve selected model from `_SYSTEM_USE_MODEL_BY_TOOL`
2. deep-copy `arguments`
3. strip nested `arguments.explanation` and use top-level `explanation` only
4. inject resolved explanation into concrete args when present
5. validate concrete args with `model_validate(...)`
6. emit `RemoteToolResult` where `tool_name` is the concrete tool (not `system_use`)

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
- most other tool payloads include defaulted fields (including unified-wrapper resolved concrete args for `computer_use` and `system_use`)

Integration consequence:

- sidecar adapters must tolerate both sparse and fully-populated payload forms

## Registry and Export Wiring

`tool_catalog.py` defines the canonical name->class mapping helpers.

`backend/src/tools/remote.py` materializes and re-exports that surface as the backend public entrypoint.

Contract test (`test_remote_tool_contract.py`) ensures names exactly match frontend sidecar exposed tool set.

## Args Model Enforcement Boundary

Each remote class sets `args_model` to backend schema models:

- computer schemas in `backend/src/tools/computer/schemas.py`
- system schemas in `backend/src/tools/system/schemas.py`
- filesystem schemas in `backend/src/tools/filesystem/schemas.py`
- browser schema in `backend/src/tools/browser/schemas.py`

This enforces backend-side parse constraints before remote envelope creation.

Runtime boundary reminder:

- backend validation success does not guarantee sidecar execution success; sidecar may apply stricter action-specific runtime checks

## Debug Checklist

If request/result correlation is off:

1. inspect whether class uses session metadata request id or explicit override
2. verify emitted request_id is propagated into frontend tool-call envelope
3. confirm returned `tool-result`/`tool-bundle-result` uses same correlation id

If payload fields seem missing:

1. check whether tool is browser (sparse `model_dump`) or non-browser (full `model_dump`)
2. inspect schema defaults for omitted fields
3. for unified wrappers, verify selected concrete model accepted `arguments` and filled defaults as expected
4. for `system_use`, verify explanation resolution source (top-level vs nested fallback)
5. verify sidecar action adapter defaulting assumptions
6. for browser tools, verify whether missing fields/actions are absent from the canonical backend browser args model rather than dropped later at runtime

## Related Docs

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [System Tool Direct Schema and Remote Mapping Contract Reference](../contracts/system_tool_direct_schema_and_remote_mapping_contract_reference.md)
- [Browser Remote Schema Surface Reference](../browser/browser_remote_schema_surface_reference.md)
- [Frontend Sidecar Tool Registry Exposed Schema and Result Normalization Reference](../../../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
