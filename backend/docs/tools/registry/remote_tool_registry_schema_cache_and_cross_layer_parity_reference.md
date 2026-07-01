---
summary: "Deep backend reference for ToolRegistry and SchemaRegistry internals: catalog-driven remote tool registration, canonical schema caching rules, direct model-facing declaration assembly, capability extraction fallbacks, and backend/local-runtime exposed-tool parity tests."
read_when:
  - When changing backend tool declaration generation, schema cache behavior, or remote-tool registration paths.
  - When debugging missing/invalid tool schemas, catalog-driven declaration drift, request-id correlation, or local-runtime contract drift.
title: "Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference"
---

# Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference

This page covers backend tool registry internals in:

- `backend/src/tools/registry.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/tool_catalog.py`
- `backend/src/tools/remote_tools/*`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_remote_tool_contract.py`

## Backend Role in Tooling

Backend mostly provides tool schemas and waits for SDK/main local-runtime results.

`ToolRegistry` is therefore a schema + metadata registry for remote tool stubs, plus a small backend-only registry path for tools such as `web_search`.

## ToolRegistry Construction

Constructor responsibilities:

1. store `config`
2. initialize in-memory tool map (`self.tools`)
3. create `SchemaRegistry(cache_manager=...)`
4. create/use `ContextFactory`
5. register all remote tools from `get_all_remote_tool_classes()`
6. register backend-owned tools from `_register_backend_tools()`

ContextFactory behavior:

- if caller does not pass `context_factory`, registry builds one with `config` and `tool_registry=self`

Remote registration behavior:

- remote classes are instantiated one-by-one
- each remote tool is registered together with its prebuilt canonical tool spec from the catalog builder
- failures are isolated per tool (`try/except`) and logged
- one failing tool does not prevent registration of others

## Remote Tool Source of Truth

`backend/src/tools/tool_catalog.py` is the backend source of truth for remote-tool metadata.

The catalog owns:

- every backend-registered remote tool name
- the import path/class name used to instantiate the stub
- whether the tool is model-visible directly
- the canonical flat tool spec built from the tool class
- concrete direct-tool names only; it does not declare wrapper names such as `computer_use` or `system_use`

`backend/src/tools/tool_catalog.py` owns the built tool-spec layer as well as the
name->class lookup helpers used by backend registry and tests. Concrete remote
tool classes are imported from their domain modules under
`backend/src/tools/remote_tools/`.

Current names:

- computer: `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`, `get_open_windows`
- system: `get_system_stats`, `open_app`, `run_shell_command`, `process`
- filesystem: `read_file`, `replace`
- browser: `browser`

`backend.src.tools.tool_catalog.get_all_remote_tool_classes()` returns a fresh
mapping, preventing external mutation of the catalog-derived lookup map.

Catalog-driven runtime helpers also power:

- model-facing surface resolution in `ToolRegistry`
- local-runtime exposed-tool parity backed by `frontend/src/main/python/tools/registry.py`

Wrapper boundary:

- wrapper names are not part of `backend/src/tools/tool_catalog.py`, are not
  returned by `get_all_remote_tool_classes()`, and are not included in
  backend/local-runtime remote parity tests

## Declaration and Capability APIs

`ToolRegistry` declaration APIs:

- `get_function_declarations()` -> all registered model-visible tools in catalog order, plus backend-owned `web_search` when registered
- `get_function_declarations_filtered(tool_names)` -> subset by requested name list

Ordering behavior:

- full declaration generation follows the catalog-defined remote-tool order, then appends backend-only `web_search`
- filtered declaration generation preserves caller-provided tool-name order while skipping missing or unregistered names

Assembly behavior:

- each registered tool is paired with a canonical flat tool spec built once at registration time
- browser now follows the same generic schema path as every other registered backend tool
- no wrapper-synthesis or post-hoc replacement step exists in the current registry implementation
- non-catalog test/helper tools registered directly into `ToolRegistry` still pass through as direct schemas when explicitly requested

Capabilities API:

- `get_tool_capabilities(tool_name)` returns:
  - `name`
  - `description`
  - `parameters`
  - `requires_context=True`

Parameter extraction fallback behavior (`_extract_schema_parameters`):

- schema is `None` -> returns `None` (capabilities unavailable)
- non-dict schema -> returns `{}`
- missing/invalid `parameters` dict -> returns `{}`

This keeps capability calls non-fatal during partial schema failures.

## SchemaRegistry Canonicalization and Cache Behavior

`SchemaRegistry` stores canonical tool schemas in cache manager store keyed by `get_tool_schema_key(tool_name)`.

Canonical schema requirements (`_is_canonical_tool_schema`):

- top-level dict with `type == "function"`
- `name` is string
- `parameters` is dict
- `description` is optional string

Cache read rules:

- if cached schema missing -> generate
- if cached schema exists but non-canonical -> warn and regenerate

Generate-and-cache rules:

- accepts a prebuilt canonical tool spec from `ToolRegistry`
- rejects non-canonical output with explicit error
- stores canonical schema only

Failure behavior:

- `get_schema()` catches exceptions and returns `None` instead of raising

Test-backed behavior from `test_tool_registry_schema.py`:

- catalog builder exposes canonical prebuilt specs
- registry builds a custom tool spec once at registration time and reuses it across declaration calls
- schema errors are contained and return `None`
- registrations with same name overwrite previous tool instance
- `get_tool_names()` returns sorted list
- full declarations follow the model-visible catalog order
- filtered declarations preserve requested direct-tool order
- capabilities fallback returns `{}` parameters when schema/function payload shape is malformed

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

All concrete remote stubs, including `RemoteWaitTool`, use the shared
`_get_request_id(ctx)` default unless a caller deliberately passes an explicit
override into `_build_remote_result(...)`.
- `RemoteBrowserTool` emits `args.model_dump(exclude_defaults=True, exclude_none=True)` for slimmer payloads

## Cross-Layer Contract Guard

`tests/backend/test_remote_tool_contract.py` enforces exact parity between:

- backend remote tool names (`get_all_remote_tool_classes().keys()`)
- local-runtime exposed tool set (`frontend/src/main/python/tools/registry.py:ToolRegistry.get_exposed_tool_names()`)

The test loads the sidecar `tools.registry` module inside an isolated import
window and restores both `sys.path` and top-level `tools.*` entries in
`sys.modules` afterward, so backend test order cannot be affected by the
local-runtime Python implementation package root.

Failure modes surfaced by this test:

- backend schema advertises a tool missing in local-runtime execution
- local-runtime implementation exposes a tool missing in backend schema catalog

Operational impact of drift:

- LLM can call a backend-advertised tool that the local runtime cannot execute
- or local-runtime implementation supports a tool never surfaced to model schema generation

Intentional exclusion from this parity guard:

- backend-only `web_search`

Field-level shared-schema guard:

- `tests/sidecar/test_shared_tool_schema_parity.py` compares backend and
  local-runtime Python implementation Pydantic schema contracts for shared non-browser tools where exact parity is
  expected (`keyboard_control`, `switch_window`, `wait`, `run_shell_command`,
  `open_app`, `process`, `read_file`, `replace`, `get_open_windows`,
  `get_system_stats`, plus replace support models).
- the same suite documents intentional exceptions instead of treating them as
  silent drift:
  - backend-grounded `mouse_control` / `scroll_control`
  - sidecar-only `screenshot.display_bounds`

## Related Docs

- [Local-Runtime Tool Bridge and Policy](../local_runtime_tool_bridge_and_policy.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
- [Local-Runtime Registry and Result Contract](../../../frontend/local_runtime_python/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
