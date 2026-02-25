---
summary: "Deep reference for shared short_id helper behavior: stable request-id truncation, unknown fallback semantics, and import-surface contract for agent/tools orchestration logging."
read_when:
  - When modifying `short_id` behavior or deciding whether to add formatting/validation around request/bundle IDs.
  - When debugging tool orchestration logs where request or bundle identifiers appear truncated or missing.
title: "Request-ID Shortener Utility and Logging Contract Reference"
---

# Request-ID Shortener Utility and Logging Contract Reference

## Canonical Modules

- `backend/src/agent/tools/shared/logging_utils.py`
- `backend/src/agent/tools/shared/__init__.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/agent/tools/preparation/preparer.py`
- `backend/src/agent/tools/preparation/helpers/preparation_helper.py`
- `backend/src/agent/tools/preparation/helpers/coordinate_resolution_helper.py`
- `backend/src/agent/tools/preparation/screenshot/manager.py`

## `short_id(request_id, length=15)` Contract

Behavior:

- returns `request_id[:length]` when `request_id` is truthy
- returns literal `"unknown"` when `request_id` is falsy (`None`, empty string, etc.)

No side effects; pure string helper.

## Purpose

- keep log lines readable without printing long UUID-like request ids in full
- provide deterministic fallback string when IDs are missing

Used for both per-tool request ids and atomic bundle ids.

## Export Surface

`backend/src/agent/tools/shared/__init__.py` re-exports `short_id` via `__all__`.

Callers may import from either:

- `backend.src.agent.tools.shared.logging_utils`
- `backend.src.agent.tools.shared`

## Usage Semantics in Runtime

Call sites use truncated IDs in:

- tool wait/start/timeout logs
- coordinate-resolution and screenshot-preparation diagnostics
- bundle preparation and dispatch logs

This helper is display-only; canonical request-id storage/routing keeps full IDs elsewhere.

## Drift Hotspots

1. Changing fallback value from `"unknown"` can break log parsers/search filters.
2. Changing default `length` alters operational log readability and grep patterns.
3. Introducing non-pure behavior (formatting with randomness/state) would make correlation across logs unstable.

## Related Pages

- [Backend Agent Tools Shared-Utility Docs Hub](README.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../../../tools/execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../../tools/tool_preparation_and_coordinate_resolution_reference.md)
