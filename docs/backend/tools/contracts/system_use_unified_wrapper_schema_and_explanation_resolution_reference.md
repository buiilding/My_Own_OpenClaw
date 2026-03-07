---
summary: "Deep contract reference for backend unified `system_use`: schema envelope requirements, explanation normalization precedence, parser/native bridge mapping differences, and remote concrete-tool revalidation."
read_when:
  - When changing `backend/src/tools/system/{schemas,unified_schema}.py` or `backend/src/tools/remote_tools/system.py`.
  - When debugging `system_use` payloads that validate in one layer but fail in parser/native bridge or remote dispatch.
title: "System Use Unified Wrapper Schema and Explanation Resolution Reference"
---

# System Use Unified Wrapper Schema and Explanation Resolution Reference

## Canonical Modules

- `backend/src/tools/system/schemas.py`
- `backend/src/tools/system/unified_schema.py`
- `backend/src/tools/remote_tools/system.py`
- `backend/src/llm/parser_types.py`
- `backend/src/agent/execution/tool_call_bridge.py`
- `backend/src/tools/registry.py`
- `tests/backend/test_system_use_schema_contract.py`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_response_parser.py`
- `tests/backend/test_interaction_tool_call_bridge.py`

## Canonical Wrapper Envelope

Unified wrapper name: `system_use`

Supported concrete actions:

- `run_shell_command`
- `replace`
- `read_file`
- `get_system_stats`
- `get_open_windows`

Envelope fields:

- `tool`
- `explanation`
- `arguments`

## Pydantic Runtime Model (`SystemUseArgs`)

`SystemUseArgs` (`schemas.py`) enforces:

- `extra="forbid"` at wrapper level
- constrained `tool` literal set (five actions above)
- `arguments` object (default empty dict)
- `explanation` optional string at model layer

Normalization (`model_validator(mode="before")`):

1. if top-level `explanation` is non-empty string, trim and keep it
2. else if `arguments.explanation` is non-empty string, copy trimmed value to top-level `explanation`
3. otherwise leave as-is (`None` allowed at model layer)

## Canonical Declaration Contract (`unified_schema.py`)

`get_unified_system_use_function_declaration()` exposes model-facing schema with stricter requirements than raw model defaults:

- `additionalProperties: false`
- required: `["tool", "explanation"]`
- `explanation` has `minLength: 1`
- `arguments` uses `oneOf` per concrete action

Important declaration boundary:

- concrete action `oneOf` entries intentionally do not expose nested `arguments.explanation`
- rationale is canonicalized as top-level `explanation`

## Remote Dispatch Normalization (`RemoteSystemUseTool`)

`RemoteSystemUseTool.execute_remote(...)`:

1. picks concrete model from `_SYSTEM_USE_MODEL_BY_TOOL`
2. maps wrapper tool name to concrete remote tool name via `_SYSTEM_USE_TARGET_TOOL_BY_TOOL`
3. copies `args.arguments` into mutable dict
4. resolves explanation with precedence:
  - top-level `args.explanation`
  - fallback nested `arguments.explanation`
5. injects resolved explanation into concrete arguments when present
6. re-validates concrete arguments with selected model (`model_validate`)
7. emits `RemoteToolResult` with concrete `tool_name` (not `system_use`)

## Parser vs Native Bridge Mapping Nuance

### Parser module path (`parser_types.py`)

`ToolCallSchema._normalize_unified_system_use(...)`:

- requires valid mapped `tool` in supported set
- requires `arguments` to be dict (defaults to `{}` when omitted)
- resolves and injects explanation using top-level then nested fallback
- rejects unknown subtools by returning `None`

### Native provider bridge path (`tool_call_bridge.py`)

`to_parsed_tool_call(...)` for `system_use`:

- maps known subtools to concrete names
- injects explanation with same precedence rules
- if mapped subtool is invalid, keeps `tool_name="system_use"` (instead of dropping call) to preserve deterministic downstream wrapper validation errors in native-tool-call flows

## Registry Collapse Contract

`ToolRegistry.get_function_declarations_filtered(...)` collapses legacy concrete system requests into one canonical `system_use` declaration.

Equivalent filtered requests:

- `["system_use"]`
- `["run_shell_command", "replace", "read_file", "get_system_stats", "get_open_windows"]`

Both return the same canonical declaration from `unified_schema.py`.

## Test-Backed Invariants

`test_system_use_schema_contract.py` / `test_tool_registry_schema.py`:

- declaration requires `tool` + `explanation`
- `tool` enum and `arguments.oneOf` action titles are stable
- nested action schemas do not expose `explanation`
- legacy concrete-name filter sets normalize to one `system_use` declaration

`test_remote_tools.py`:

- remote `system_use` wrapper routes to concrete tool with validated args
- top-level `explanation` is accepted
- nested `arguments.explanation` fallback is accepted

`test_response_parser.py` / `test_interaction_tool_call_bridge.py`:

- parser path maps valid `system_use` envelope to concrete tool
- parser supports nested explanation fallback
- native bridge supports top-level and nested fallback explanation resolution

## Drift Hotspots

1. Diverging `tool` enums across `SystemUseArgs`, unified declaration schema, and remote mapping tables creates runtime-only failures.
2. Requiring nested `arguments.explanation` in one layer while top-level is canonical in another causes model/schema drift.
3. Changing parser rejection behavior for unknown `system_use.tool` without matching native bridge semantics can produce inconsistent error surfaces between providers.
4. Removing declaration-level required `explanation` weakens rationale guarantees even if remote runtime still injects fallback.

## Related Docs

- [Computer Tool Schema Guidance and Unified Envelope Validation Reference](computer_tool_schema_guidance_and_unified_envelope_validation_reference.md)
- [Remote Tool Domain Payload and Request-ID Semantics Reference](../remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
- [Parser Trust Boundary and Native Tool-Call Reference](../../llm/parser_trust_boundary_and_native_tool_call_reference.md)
