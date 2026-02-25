---
summary: "Deep reference for backend SDK tool template scaffold: example args model/tool class patterns, result payload contract, and manifest capability metadata alignment expectations."
read_when:
  - When modifying template tool scaffolding (`tool.py`, template README, `manifest.json`).
  - When validating that new-tool bootstrap docs still match live SDK `Tool`/`ToolContext` contracts.
title: "SDK Tool Template Scaffold, Manifest, and Capability Contract Reference"
---

# SDK Tool Template Scaffold, Manifest, and Capability Contract Reference

## Canonical Modules

- `backend/src/tools/templates/sdk_tool_template/tool.py`
- `backend/src/tools/templates/sdk_tool_template/README.md`
- `backend/src/tools/templates/sdk_tool_template/manifest.json`
- `backend/src/sdk/tool.py`
- `backend/src/sdk/context.py`

## Template Purpose

The scaffold is starter guidance for authoring new SDK tools with:

- typed Pydantic args model
- `Tool[...]` subclass declaration
- async `run(args, ctx)` execution contract
- capability declaration via `get_capabilities()`

It is example code, not production-loaded runtime logic.

## `tool.py` Contract Surface

Key template patterns:

- args model uses `ConfigDict(extra='forbid')`
- tool class defines `name`, `description`, `args_model`
- `run(...)` returns dict with expected keys (`success`, `llm_content`, optional `error`, `artifacts`, memory fields)
- helper method extraction pattern (`_process_input`) encourages smaller methods
- `get_capabilities()` returns capability flags and timeout

## Result Payload Convention

Template documents canonical result-shape expectations:

- success path should include `success: True` + `llm_content`
- failure path should include `success: False`, `error`, and `llm_content`
- optional fields (`return_display`, `artifacts`, episodic/semantic memory arrays) are explicitly called out

This keeps new tools aligned with backend result transformer/history formatter assumptions.

## Manifest Contract (`manifest.json`)

Template manifest includes:

- metadata keys (`name`, `version`, `description`, `author`, `entry_point`)
- dependency list placeholder
- capability map with `requires_screenshot`, `modifies_filesystem`, `network_access`, `timeout`
- category/tags placeholders

Manifest values are illustrative defaults and should be adjusted per real tool behavior.

## Template README Contract

Template README defines onboarding steps:

1. copy scaffold
2. define args model
3. implement tool class + `run`
4. declare capabilities
5. add tests

It also links to broader development docs and best-practice guidance.

## Drift Hotspots

1. Template `ToolContext` naming/examples can drift from current SDK context contract (`ToolContext` vs legacy aliases).
2. Template result key guidance must stay consistent with `ToolResult` normalization/formatter expectations.
3. Manifest capability defaults copied without edits can misrepresent real tool behavior.

## Related Pages

- [Backend Tools Templates Docs Hub](README.md)
- [Backend SDK Docs Hub](../../sdk/README.md)
- [Tool Context and Schema Contract Reference](../../sdk/tool_context_and_schema_contract_reference.md)
