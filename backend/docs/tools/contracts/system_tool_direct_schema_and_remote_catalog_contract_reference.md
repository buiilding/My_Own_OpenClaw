---
summary: "Deep contract reference for backend direct system tool schemas and direct remote class catalog parity."
read_when:
  - When changing `backend/src/tools/system/schemas.py`, filesystem system-adjacent schemas, or `backend/src/tools/remote_tools/system.py`.
  - When debugging system tool declarations, explanation requirements, workspace-relative path wording, or system remote-tool catalog parity.
title: "System Tool Direct Schema and Remote Catalog Contract Reference"
---

# System Tool Direct Schema and Remote Catalog Contract Reference

## Canonical Modules

- `backend/src/tools/system/schemas.py`
- `backend/src/tools/filesystem/schemas.py`
- `backend/src/tools/remote_tools/system.py`
- `backend/src/tools/registry.py`
- `backend/src/tools/tool_catalog.py`
- `tests/backend/test_system_tool_schema_contract.py`
- `tests/backend/test_system_tool_catalog_parity.py`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_remote_tools.py`

## Direct Declaration Contract

The live backend registry exposes direct system and filesystem tool names:

- `get_open_windows`
- `get_system_stats`
- `open_app`
- `run_shell_command`
- `process`
- `read_file`
- `replace`

`ToolRegistry.get_function_declarations_filtered(...)` returns declarations
for those direct names. It does not collapse them into a model-facing
`system_use` wrapper declaration.

`run_shell_command` requires `command`, `run_in_background`, and `explanation`.
`read_file` and `replace` keep workspace-relative path guidance in their
`file_path` descriptions. `replace` exposes both batch replacement and patch
chunk variants directly.

## Remote Catalog Contract

`backend/src/tools/remote_tools/system.py`,
`backend/src/tools/remote_tools/filesystem.py`, and
`backend/src/tools/remote_tools/computer.py` own remote stubs for the live
system-adjacent tools. The canonical source of truth is
`backend/src/tools/tool_catalog.py`; no separate wrapper mapping table is kept.

`open_app` and `process` are direct tools and remain in the same catalog as the
other remote stubs.

## Test-Backed Invariants

`test_system_tool_schema_contract.py` verifies that the registry emits direct
system tool schemas and that `run_shell_command` is not wrapped in `tool` or
`arguments` fields.

`test_system_tool_catalog_parity.py` verifies that direct remote classes and
the tool catalog stay aligned for the system-adjacent tool set.

`test_remote_tools.py` covers remote stub serialization and request handling.

## Drift Hotspots

1. Reintroducing a live backend `system_use` declaration would duplicate the
   direct system tool surface.
2. Moving explanation requirements out of direct schemas can weaken prompt-time
   tool-call accountability.
3. Adding a second remote mapping table beside the tool catalog creates
   runtime-only dispatch drift.
