---
summary: "Backend SDK contract reference for Tool base-class requirements, removed Tool abstract base protocol behavior, local-ref schema inlining/normalization behavior, ToolContext structure, ContextFactory service-injection semantics, ContextFactory set_ocr_service removal, set_ocr_router ocr_router tool context service keys, and the removed core ToolInterface/Kind/ToolContext protocol boundary."
read_when:
  - When adding/changing SDK tool classes, argument models, or JSON schema output behavior.
  - When changing tool execution context shape, service injection defaults, or schema registry validation.
  - When resolving stale references to the removed Tool abstract base protocol or removed `backend.src.core.interfaces.tool` exports such as `Kind`, `ToolContext`, or `ToolInterface`.
  - When resolving stale `ContextFactory.set_ocr_service(...)`, `ocr_service` tool-context alias, or OCR router service-key references.
title: "Tool Context and Schema Contract Reference"
---

# Tool Context and Schema Contract Reference

Search route note: stale queries for `Tool abstract base protocol removed`
belong here. Removed `Kind`, `ToolContext`, and `ToolInterface` export-surface
queries belong to the backend core interfaces reference.

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

Before cleaning, `_resolve_local_defs(...)` expands local schema references so nested object definitions survive cleanup:

- inlines local `$ref` targets from `#/$defs/...`
- flattens trivial `allOf` wrappers (`allOf` with a single branch)
- merges inline extras onto resolved targets
- strips `$defs` from resolved output tree
- unresolved/non-local refs are preserved (only `#/$defs/...` refs are inlined)
- list nodes are resolved element-by-element, so nested compositions survive in arrays (`items`, `oneOf`, etc.)

Normalization rules in `_clean_schema(...)`:

- recursively keeps `properties` and `required`
- simplifies optional `anyOf[..., {"type":"null"}]` to non-null branch
- preserves structural compositions when present (`oneOf`, `allOf`)
- preserves conditional JSON Schema branches when present (`if`, `then`, `else`, `not`, `const`)
- preserves typed object-map value schemas from `additionalProperties` when
  Pydantic emits a schema object, recursively cleaning the nested value schema
- preserves constraints (`minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `enum`)
- keeps non-null defaults only
- strips noisy fields like `title`
- preserves top-level `additionalProperties` so model-facing schemas retain
  args-model strictness
- keys outside this allowlist are intentionally dropped to keep function-schema payloads compact for model context budgets

Top-level object-type guard:

- after cleanup, if `properties` exists and `type` is missing, `get_json_schema()` enforces `parameters.type = "object"`
- this keeps OpenAI/LiteLLM function-tool compatibility even when Pydantic output omitted explicit object type
- top-level `title` is removed after cleaning; top-level and nested boolean
  `additionalProperties` plus typed map value schemas are retained

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

## ContextFactory Runtime Injection Semantics

`ContextFactory.create_tool_context(...)` is the central construction path.

Service merge order:

1. base services (`config`, optionally `tool_registry`, `agent_factory`, `vision_service`, `vision_router`, `ocr_router`)
2. session service (`services["session"]`) when `session_ref` exists
3. `additional_services` (last-write wins)

Other behavior:

- default workspace root is `os.getcwd()` if not passed
- `SessionContext.created_at` uses `time.time()`
- `SessionContext.metadata` copies snapshot of `session_ref.metadata` at creation time
- service toggles `set_vision_service(None)` and `set_ocr_router(None)` remove
  the corresponding injected service keys
- OCR is exposed to tools through `ocr_router`; `ContextFactory` no longer
  publishes an `ocr_service` alias.

### Removed `ContextFactory.set_ocr_service(...)` Alias

Stale `ContextFactory set_ocr_service removed ocr_router tool context service
keys` searches belong here. The current context injection path is:

1. container startup/config update calls `context_factory.set_ocr_router(...)`
2. `ContextFactory` stores `self.ocr_router`
3. tool contexts receive `services["ocr_router"]`

There is no `services["ocr_service"]` alias in new tool contexts. Use
`ocr_router` for OCR provider/router access and keep `AgentSession` construction
on the separate `ocr_router` constructor dependency.

## Core Tool Result Boundary

`backend/src/core/interfaces/tool.py` defines the backend `ToolResult` value used
by tool-result waiting, routing, processing, and history projection.

Current SDK tool runtime path uses `backend/src/sdk/context.py` +
`backend/src/sdk/tool.py` for `ToolContext` and tool implementation contracts.
Do not reintroduce a parallel core tool-context protocol when wiring new SDK
tools.

Removed core exports:

- `Kind`
- `ToolContext`
- `ToolInterface`

Stale imports or searches for those names should move to the SDK contract:
`Tool` in `backend/src/sdk/tool.py` and `ToolContext` in
`backend/src/sdk/context.py`.

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
