---
summary: "Deep reference for shared tool schema field factories: required explanation text and optional post-action wait field descriptions reused across system/computer/filesystem argument models."
read_when:
  - When changing reusable Field helper behavior in `backend/src/tools/schema_fields.py`.
  - When debugging inconsistent argument descriptions/defaults across tool schemas that consume `explanation_field()` or `post_action_wait_field()`.
title: "Schema Field Factory Explanation and Post-Action Wait Contract Reference"
---

# Schema Field Factory Explanation and Post-Action Wait Contract Reference

## Canonical Modules

- `backend/src/tools/schema_fields.py`
- `backend/src/tools/system/schemas.py`
- `backend/src/tools/computer/schemas.py`
- `backend/src/tools/filesystem/schemas.py`

## Factory Boundary

`schema_fields.py` owns shared `pydantic.Field(...)` declarations for repeated tool args.

Public factories:

- `explanation_field()`
- `post_action_wait_field(default: float = 0.0)`

These helpers centralize descriptions/defaults so tool schema docs emitted to model providers stay consistent.

## `explanation_field()` Contract

Returns a required field (`Field(...)`) with canonical description:

- one sentence explaining why the tool call is needed and how it supports the user goal

Used by multiple schema models (`RunShellCommandArgs`, `ReadFileArgs`, `ReplaceArgs`, `GetOpenWindowsArgs`, `GetSystemStatsArgs`).

## `post_action_wait_field(...)` Contract

Returns optional float field with default (default `0.0`) and canonical description:

- delay in seconds before automatic post-action screenshot capture

Used by interactive tools where UI state may settle after the action (`MouseControlArgs.wait`, `KeyboardControlArgs.wait`, `ScrollControlArgs.wait`, `SwitchTabArgs.wait`).

## Design Intent

- one source of truth for repeated schema descriptions
- prevent drift between similar tools that should expose identical semantics
- reduce copy/paste mismatch in LLM-visible tool docs

## Coverage Boundary

No direct unit tests target `schema_fields.py` itself.

Validation is indirect through schema/model tests and runtime tool-call behavior.

## Drift Hotspots

1. Changing helper descriptions alters every tool schema prompt description at once.
2. Changing `post_action_wait_field` default can affect post-action capture timing semantics for multiple tools.
3. Inlining per-schema replacements instead of shared helpers reintroduces description drift.

## Related Pages

- [Backend Tools Contracts Docs Hub](README.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
