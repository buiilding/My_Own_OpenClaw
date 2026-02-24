---
summary: "Deep backend reference for remote tool stubs across computer/system/filesystem/browser domains: args-model binding, request-id sourcing, payload model_dump behavior, and cross-layer contract implications."
read_when:
  - When modifying remote stub classes, especially request-id generation or payload serialization rules.
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

## Domain Class Matrix

### Computer domain (`remote_tools/computer.py`)

Classes:

- `RemoteMouseTool` (`MouseControlArgs`)
- `RemoteKeyboardTool` (`KeyboardControlArgs`)
- `RemoteScreenshotTool` (`ScreenshotToolArgs`)
- `RemoteScrollTool` (`ScrollControlArgs`)
- `RemoteSwitchTabTool` (`SwitchTabArgs`)
- `RemoteWaitTool` (`WaitToolArgs`)
- `RemoteGetOpenWindowsTool` (`GetOpenWindowsArgs`)

Behavior:

- all use `_build_remote_result(...)` except request-id override nuance below
- `category` is `ToolDomain.COMPUTER`

Nuance:

- `RemoteWaitTool` forces a fresh UUID (`request_id=str(uuid.uuid4())`) rather than inheriting session metadata request id

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
- most other tool payloads include defaulted fields

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
3. verify sidecar action adapter defaulting assumptions

## Related Docs

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Frontend Sidecar Tool Registry Exposed Schema and Result Normalization Reference](../../../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
