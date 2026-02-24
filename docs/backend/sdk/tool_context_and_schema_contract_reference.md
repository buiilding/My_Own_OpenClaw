---
summary: "Backend SDK contract reference for Tool base-class requirements, schema normalization/caching, ToolContext structure, and ContextFactory service-injection semantics."
read_when:
  - When adding/changing SDK tool classes, argument models, or JSON schema output behavior.
  - When changing tool execution context shape, service injection defaults, or schema registry validation.
title: "Tool Context and Schema Contract Reference"
---

# Tool Context and Schema Contract Reference

## Canonical Modules

- `backend/src/sdk/tool.py`
- `backend/src/sdk/context.py`
- `backend/src/core/services/context_factory.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/registry.py`

## Tool Base Class Contract

`Tool[TArgs]` in `backend/src/sdk/tool.py` is the canonical SDK base class.

Required subclass class variables:

- `name: str`
- `description: str`
- `args_model: Type[pydantic.BaseModel]`

Required method:

- `async run(self, args: TArgs, ctx: ToolContext) -> Any`

Optional metadata:

- `required_permissions: set[Permission]` (defaults empty set)
- `category: ToolDomain` (defaults to `ToolDomain.OTHER` in `__init_subclass__`)

## JSON Schema Generation Behavior

`Tool.get_json_schema()` always returns canonical function-tool shape:

- top-level `type = "function"`
- `function.name`
- `function.description`
- `function.parameters`

Schema source is `args_model.model_json_schema()`, then `_clean_schema(...)` normalizes it for LLM consumption.

Normalization rules in `_clean_schema(...)`:

- recursively keeps `properties` and `required`
- simplifies optional `anyOf[..., {"type":"null"}]` to non-null branch
- preserves constraints (`minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `enum`)
- keeps non-null defaults only
- strips noisy fields like `title`
- strips top-level `additionalProperties`
- removes redundant top-level `type: object` when `properties` already present

## Registry + Cache Enforcement

`SchemaRegistry` (`backend/src/tools/schema_registry.py`) provides enforcement and caching:

1. build cache key from `CacheManager.get_tool_schema_key(tool.name)`
2. read/write `cache_manager.tool_schemas`
3. validate cached or generated schema with `_is_canonical_tool_schema(...)`
4. regenerate when cached schema is non-canonical

Fail-closed behavior:

- schema generation exceptions are logged and return `None`
- non-canonical schemas raise `ValueError` internally and are suppressed to `None` by `get_schema(...)`

`ToolRegistry` (`backend/src/tools/registry.py`) consumes `SchemaRegistry` for:

- `get_function_declarations()`
- `get_function_declarations_filtered(tool_names)`
- `get_tool_capabilities(tool_name)`

## ToolContext Data Model

`backend/src/sdk/context.py` separates identity from runtime capabilities.

Identity objects:

- `UserContext(user_id, username, permissions)`
- `SessionContext(session_id, created_at, metadata)`

Capabilities object:

- `ExecutionRuntime(workspace_root, services)`
- convenience properties:
  - `.agents -> services["agent_factory"]`
  - `.file_service -> services["file_service"]`

Container object passed to tool `run(...)`:

- `ToolContext(user, session, runtime)`
- convenience properties:
  - `.workspace_root`
  - `.services`
  - `.agents`
  - `.is_interactive` (always `True`)

Backward-compat alias:

- `Context = ToolContext`

## ContextFactory Runtime Injection Semantics

`ContextFactory.create_tool_context(...)` is the central construction path.

Service merge order:

1. base services (`config`, optionally `tool_registry`, `agent_factory`, `vision_service`, `ocr_service`)
2. session service (`services["session"]`) when `session_ref` exists
3. `additional_services` (last-write wins)

Other behavior:

- default workspace root is `os.getcwd()` if not passed
- `SessionContext.created_at` uses `time.time()`
- `SessionContext.metadata` copies snapshot of `session_ref.metadata` at creation time
- service toggles `set_vision_service(None)` and `set_ocr_service(None)` remove those keys

## Legacy Boundary

`backend/src/core/interfaces/tool.py` still defines a separate legacy `ToolContext`/`ToolResult` protocol surface.

Current SDK tool runtime path uses `backend/src/sdk/context.py` + `backend/src/sdk/tool.py`. Do not mix the two context types when wiring new SDK tools.

## Test-Backed Invariants

`tests/backend/test_tool_registry_schema.py` validates:

- canonical `type=function` schema output
- schema cache hit behavior (single generation call)
- registry overwrite behavior for same tool name
- filtered declaration behavior
- capabilities fallback when schema lookup fails

`tests/backend/test_context_factory.py` validates:

- service injection and merge behavior
- factory `session_ref` default vs override precedence
- workspace default fallback to cwd
- metadata snapshot (session metadata changes do not mutate existing context)
- optional service removal behavior
