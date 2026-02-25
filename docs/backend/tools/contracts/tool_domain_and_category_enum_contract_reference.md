---
summary: "Deep reference for backend tool taxonomy enums: stable ToolDomain and ToolCategory string literals used by SDK and remote-tool registry surfaces."
read_when:
  - When adding or renaming tool domain/category literals in `backend/src/tools/categorization.py`.
  - When debugging schema/registry behavior that depends on stable enum string values (`domain` fields in tool declarations).
title: "Tool Domain and Category Enum Contract Reference"
---

# Tool Domain and Category Enum Contract Reference

## Canonical Modules

- `backend/src/tools/categorization.py`
- `backend/src/sdk/tool.py`
- `backend/src/tools/remote_tools/browser.py`
- `backend/src/tools/remote_tools/computer.py`
- `backend/src/tools/remote_tools/filesystem.py`
- `backend/src/tools/remote_tools/system.py`
- `tests/backend/test_categorization.py`

## Domain Enum Contract (`ToolDomain`)

Current literals:

- `computer`
- `filesystem`
- `system`
- `browser`
- `marketplace`
- `memory`
- `other`

`ToolDomain` inherits from `str` + `Enum`, so values remain string-compatible in schema serialization and JSON payloads.

## Category Enum Contract (`ToolCategory`)

Current literals:

- `browser`
- `terminal`
- `editor`
- `file_operation`
- `system_info`
- `search`
- `utility`

Categories are intentionally more granular than domains and can be used by future discovery/filtering paths without changing high-level domain routing.

## Stability Expectations

- enum values are part of backend/frontend contract surface
- string literal changes are breaking for persisted configs, tests, and tool declaration consumers
- adding new values should preserve existing literals and avoid repurposing old names

## Test-Backed Invariants

`tests/backend/test_categorization.py` validates:

- exact literal values
- string comparison behavior (`ToolDomain.COMPUTER == "computer"`)
- iteration/membership count expectations

## Drift Hotspots

1. Renaming existing literals breaks remote tool declarations and parser validation assumptions.
2. Switching away from `str` enum inheritance breaks JSON serialization compatibility.
3. Domain/category overlap changes can silently affect discovery UIs that group by one or both enums.

## Related Pages

- [Backend Tools Contracts Docs Hub](README.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
