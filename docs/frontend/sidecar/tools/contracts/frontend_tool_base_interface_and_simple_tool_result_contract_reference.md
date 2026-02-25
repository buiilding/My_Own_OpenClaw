---
summary: "Deep reference for sidecar tool base contracts: FrontendTool async lifecycle methods and SimpleToolResult success/data/error serialization behavior."
read_when:
  - When modifying `FrontendTool` abstract method signatures or default lifecycle behavior.
  - When changing `SimpleToolResult` helper constructors or `to_dict` serialization semantics.
title: "Frontend Tool Base Interface and Simple Tool Result Contract Reference"
---

# Frontend Tool Base Interface and Simple Tool Result Contract Reference

## Canonical Modules

- `frontend/src/main/python/tools/base.py`
- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/result.py`

## `FrontendTool` Interface Contract

Base class fields:

- `name: str = ""`
- `description: str = ""`

Lifecycle methods:

- `async initialize() -> bool`: default returns `True`
- `async run(args: Dict[str, Any]) -> Dict[str, Any]`: must be overridden (`NotImplementedError`)
- `async close() -> None`: default no-op

Intent:

- provide lightweight async contract for local backend tool implementations without heavy inheritance requirements.

## `SimpleToolResult` Dataclass Contract

Fields:

- `success: bool` (required)
- `data: Optional[Dict[str, Any]]`
- `error: Optional[str]`

Serialization (`to_dict`) rules:

- always emits `{"success": ...}`
- includes `data` only when not `None`
- includes `error` only when truthy

Helper constructors:

- `SimpleToolResult.success(data=None)` -> `success=True`, defaults `data={}`
- `SimpleToolResult.failure(error)` -> `success=False`, passes error string

## Usage Boundary

This file defines minimal shared primitives.

Richer result formatting and schema validation happen in registry/result layers, not in this base module.

## Drift Hotspots

1. Changing `run` signature breaks all concrete tool implementations.
2. Altering `to_dict` key inclusion semantics can break consumers expecting omitted `error`/`data` keys.
3. Returning mutable shared defaults in helpers (instead of per-call dict) would leak state between tool results.

## Related Pages

- [Frontend Sidecar Tools Contracts Docs Hub](README.md)
- [Frontend Sidecar Tools Docs Hub](../README.md)
