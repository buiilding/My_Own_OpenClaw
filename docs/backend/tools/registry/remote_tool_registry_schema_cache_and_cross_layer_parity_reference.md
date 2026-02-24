---
summary: "Deep backend reference for ToolRegistry and SchemaRegistry internals: remote tool registration, canonical schema caching rules, capability extraction fallbacks, and backend/frontend exposed-tool parity tests."
read_when:
  - When changing backend tool declaration generation, schema cache behavior, or remote-tool registration paths.
  - When debugging missing/invalid tool schemas, request-id correlation, or sidecar contract drift.
title: "Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference"
---

# Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference

This page covers backend tool registry internals in:

- `backend/src/tools/registry.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/remote.py`
- `backend/src/tools/remote_tools/*`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_remote_tool_contract.py`

## Backend Role in Tooling

Backend mostly provides tool schemas and waits for frontend-executed results.

`ToolRegistry` is therefore a schema + metadata registry for remote tool stubs, not a local executor for most user-visible tools.

## ToolRegistry Construction

Constructor responsibilities:

1. store `config`
2. initialize in-memory tool map (`self.tools`)
3. create `SchemaRegistry(cache_manager=...)`
4. create/use `ContextFactory`
5. register all remote tools from `get_all_remote_tools()`

ContextFactory behavior:

- if caller does not pass `context_factory`, registry builds one with `config` and `tool_registry=self`

Remote registration behavior:

- remote classes are instantiated one-by-one
- failures are isolated per tool (`try/except`) and logged
- one failing tool does not prevent registration of others

## Remote Tool Source of Truth

`backend/src/tools/remote_tools/registry.py` defines `REMOTE_TOOLS` mapping names to classes.

Current names:

- computer: `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_tab`, `wait`, `get_open_windows`
- system: `get_system_stats`, `run_shell_command`, `process`
- filesystem: `read_file`, `replace`
- browser: `browser`

`get_all_remote_tools()` returns a copy, preventing external mutation of module-level registry.

## Declaration and Capability APIs

`ToolRegistry` declaration APIs:

- `get_function_declarations()` -> all registered tools
- `get_function_declarations_filtered(tool_names)` -> subset by name set

Ordering behavior:

- filtered declarations keep order from `get_all_tools()` (registration/insertion order)

Capabilities API:

- `get_tool_capabilities(tool_name)` returns:
  - `name`
  - `description`
  - `parameters`
  - `requires_context=True`

Parameter extraction fallback behavior (`_extract_schema_parameters`):

- schema is `None` -> returns `None` (capabilities unavailable)
- non-dict schema -> returns `{}`
- missing/invalid `function` dict -> returns `{}`
- missing/invalid `parameters` dict -> returns `{}`

This keeps capability calls non-fatal during partial schema failures.

## SchemaRegistry Canonicalization and Cache Behavior

`SchemaRegistry` stores canonical tool schemas in cache manager store keyed by `get_tool_schema_key(tool.name)`.

Canonical schema requirements (`_is_canonical_tool_schema`):

- top-level dict with `type == "function"`
- `function` is dict
- `function.name` is string
- `function.parameters` is dict
- `function.description` is optional string

Cache read rules:

- if cached schema missing -> generate
- if cached schema exists but non-canonical -> warn and regenerate

Generate-and-cache rules:

- calls `tool.get_json_schema()`
- rejects non-canonical output with explicit error
- stores canonical schema only

Failure behavior:

- `get_schema()` catches exceptions and returns `None` instead of raising
- `get_declarations()` includes only dict schemas returned by `get_schema()`

Test-backed behavior from `test_tool_registry_schema.py`:

- schema cache prevents duplicate schema generation calls
- schema errors are contained and return `None`
- registrations with same name overwrite previous tool instance
- `get_tool_names()` returns sorted list

## RemoteToolBase and Request-ID Semantics

`RemoteToolBase` behavior:

- `run()` delegates to `execute_remote()`
- `_get_request_id(ctx)` uses `ctx.session.metadata["request_id"]` when present
- otherwise generates UUID

`_build_remote_result(...)`:

- default request id from context unless explicit override is passed
- payload uses `args.model_dump()`
- wraps into `RemoteToolResult` (`is_remote=True`)

`RemoteToolResult.to_dict()` standard fields:

- `tool_name`
- `args`
- `request_id`
- `is_remote`

Notable class-specific difference:

- `RemoteWaitTool` always forces fresh UUID (`request_id=str(uuid.uuid4())`) instead of reusing session metadata request id
- `RemoteBrowserTool` emits `args.model_dump(exclude_defaults=True, exclude_none=True)` for slimmer payloads

## Cross-Layer Contract Guard

`tests/backend/test_remote_tool_contract.py` enforces exact parity between:

- backend remote tool names (`get_all_remote_tools().keys()`)
- frontend sidecar exposed set (`frontend/src/main/python/tools/registry.py:ToolRegistry.get_exposed_tool_names()`)

Failure modes surfaced by this test:

- backend schema advertises tool missing in sidecar runtime
- sidecar exposes tool missing in backend schema catalog

Operational impact of drift:

- LLM can call a backend-advertised tool that frontend cannot execute
- or sidecar supports a tool never surfaced to model schema generation

## Related Docs

- [Frontend Tool Bridge and Policy](../frontend_tool_bridge_and_policy.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
- [Frontend Sidecar Tool Registry Exposed Schema and Result Normalization Reference](../../../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
