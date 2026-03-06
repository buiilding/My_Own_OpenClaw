---
summary: "Deep backend reference for remote tool stubs across computer/system/filesystem/browser domains: args-model binding, unified computer_use normalization/validation contracts, request-id sourcing, payload model_dump behavior, and cross-layer dispatch implications."
read_when:
  - When modifying remote stub classes, especially unified `computer_use` routing, request-id generation, or payload serialization rules.
  - When changing parser/native-tool-call normalization for `computer_use` and concrete computer subtool dispatch.
  - When debugging mismatches where backend remote tool payload looks valid but sidecar execution fails or correlates to wrong request.
title: "Remote Tool Domain Payload and Request-ID Semantics Reference"
---

# Remote Tool Domain Payload and Request-ID Semantics Reference

This page documents behavior in:

- `backend/src/tools/remote_tools/base.py`
- `backend/src/tools/remote_tools/registry.py`
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
- `_build_remote_result(...)` keeps model defaults in serialized args payload (for example optional defaults like mouse `duration`)

## Domain Class Matrix

### Computer domain (`remote_tools/computer.py`)

Classes:

- `RemoteComputerUseTool` (`ComputerUseArgs`)
- `RemoteMouseTool` (`MouseControlArgs`)
- `RemoteKeyboardTool` (`KeyboardControlArgs`)
- `RemoteScreenshotTool` (`ScreenshotToolArgs`)
- `RemoteScrollTool` (`ScrollControlArgs`)
- `RemoteSwitchTabTool` (`SwitchTabArgs`)
- `RemoteWaitTool` (`WaitToolArgs`)
- `RemoteGetOpenWindowsTool` (`GetOpenWindowsArgs`)

Behavior:

- `RemoteComputerUseTool` uses `_COMPUTER_USE_MODEL_BY_TOOL` to re-validate `arguments` with tool-specific schemas before envelope creation
- `RemoteComputerUseTool` uses `_get_request_id(ctx)` and returns `RemoteToolResult` directly
- non-unified computer stubs use `_build_remote_result(...)` except request-id override nuance below
- `category` is `ToolDomain.COMPUTER`

Nuance:

- `RemoteWaitTool` forces a fresh UUID (`request_id=str(uuid.uuid4())`) rather than inheriting session metadata request id

### Unified `computer_use` metadata and argument contract

`ComputerUseArgs` enforces a strict envelope:

- `tool`: one of `mouse_control|keyboard_control|screenshot|scroll_control|switch_tab|wait`
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

This keeps unified `computer_use` and legacy direct tool schemas consistent on backend validation rules.

Prompt/schema guidance contract for unified tool descriptions:

- description explicitly requires metadata payload for every call
- mouse targeting guidance instructs:
  - `find_coordinates_by='ocr'` + exact `ocr_text` for text targets
  - `find_coordinates_by='prediction'` + detailed visual `description` for non-text targets

Test-backed coverage:

- `tests/backend/test_remote_tools.py::test_remote_computer_use_schema_enforces_metadata_shape_and_mouse_guidance`
- `tests/backend/test_remote_tools.py::test_remote_mouse_tool_schema_explicitly_guides_ocr_for_text_targets`

Compatibility note:

- parser/validator layers can accept direct legacy computer subtool names (for example `mouse_control`) even when registry exposure is only `computer_use`
- metadata requirements remain enforced for computer-domain tool calls in that compatibility path
- net effect: unified declaration for model/tool schema guidance, with backward-compatible concrete-name ingestion

### Dispatch-path normalization before remote stubs

Standard backend tool-call ingress paths normalize `computer_use` into concrete computer subtool names before remote-tool dispatch:

1. parser path (`ToolCallSchema.extract_tool_call` in `parser_types.py`):
  - extracts `metadata` from `args.metadata`
  - maps `computer_use` + `args.tool` to concrete subtool (`mouse_control`, `keyboard_control`, etc.)
  - forwards only `args.arguments` as concrete tool parameters
2. native tool-call bridge path (`tool_call_bridge.to_parsed_tool_call`):
  - performs equivalent normalization for provider-native tool-call payloads
  - maps invalid subtool names to `invalid_computer_use_tool`

Consequence:

- normal model-driven execution usually hits concrete remote stubs (`RemoteMouseTool`, `RemoteKeyboardTool`, etc.)
- `RemoteComputerUseTool` remains a compatibility/explicit invocation path when `computer_use` reaches remote-tool dispatch without pre-normalization

### Sidecar `computer_use` compatibility router

- sidecar `ToolRegistry` exposes and validates a unified `computer_use` envelope before concrete dispatch when that tool name is invoked directly:
  - requires top-level `metadata` object with required non-empty string fields (`description`, `explanation`, `expectation`)
  - rejects legacy nested metadata wrappers (`arguments.metadata`) even if concrete action args are otherwise valid
  - requires `arguments` object and valid `tool` name before delegating to concrete sidecar tool
- in standard backend-normalized flows (concrete tool names already selected), sidecar executes concrete tool handlers directly and does not re-parse unified `computer_use` metadata envelope
- this router therefore acts as fail-closed compatibility coverage for direct/manual `computer_use` invocations

### System domain (`remote_tools/system.py`)

Classes:

- `RemoteGetSystemStatsTool` (`GetSystemStatsArgs`)
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
- uses `args.model_dump(exclude_defaults=True, exclude_none=True)`
- this omits unset/default fields and reduces payload size

Other remote stubs generally use `args.model_dump()` (defaults retained).

## Payload Shape Implications

Because model_dump strategies differ by tool class:

- browser payloads are sparse (only non-default and non-null)
- most other tool payloads include defaulted fields (including unified `computer_use` resolved `arguments`)

Integration consequence:

- sidecar adapters must tolerate both sparse and fully-populated payload forms

## Registry and Export Wiring

`remote_tools/registry.py` defines canonical name->class mapping (`REMOTE_TOOLS`).

`backend/src/tools/remote.py` re-exports this surface as backend public entrypoint.

Contract test (`test_remote_tool_contract.py`) ensures names exactly match frontend sidecar exposed tool set.

## Args Model Enforcement Boundary

Each remote class sets `args_model` to backend schema models:

- computer schemas in `backend/src/tools/computer/schemas.py`
- system schemas in `backend/src/tools/system/schemas.py`
- filesystem schemas in `backend/src/tools/filesystem/schemas.py`
- browser schema in `backend/src/tools/browser/browser_control_args_schema.py`

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
3. for unified `computer_use`, verify selected concrete model accepted `arguments` and filled defaults as expected
4. verify sidecar action adapter defaulting assumptions

## Related Docs

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Frontend Sidecar Tool Registry Exposed Schema and Result Normalization Reference](../../../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
