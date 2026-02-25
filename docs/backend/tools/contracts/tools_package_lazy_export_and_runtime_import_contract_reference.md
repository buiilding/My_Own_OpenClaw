---
summary: "Deep reference for backend tools package root export behavior: TYPE_CHECKING import hints, lazy runtime `__getattr__` resolution, and stable public symbol contract."
read_when:
  - When changing `backend/src/tools/__init__.py` exports or import strategy.
  - When debugging import-time side effects, circular imports, or missing `ToolRegistry`/`ToolResultOrchestrator` attributes.
title: "Tools Package Lazy Export and Runtime Import Contract Reference"
---

# Tools Package Lazy Export and Runtime Import Contract Reference

## Canonical Modules

- `backend/src/tools/__init__.py`
- `backend/src/tools/registry.py`
- `backend/src/tools/orchestrator.py`

## Public Export Contract

`backend.src.tools` publishes exactly two public symbols:

- `ToolRegistry`
- `ToolResultOrchestrator`

This is enforced by `__all__ = ["ToolRegistry", "ToolResultOrchestrator"]`.

## TYPE_CHECKING Contract

Inside `if TYPE_CHECKING:` block, modules import concrete classes for static analysis only.

Runtime behavior:

- no eager imports from this block
- avoids import-time side effects and circular coupling during normal execution

## Lazy Resolution Contract (`__getattr__`)

Module-level `__getattr__(name)` resolves exports lazily:

- `ToolRegistry` => imports from `backend.src.tools.registry`
- `ToolResultOrchestrator` => imports from `backend.src.tools.orchestrator`
- any other name => raises `AttributeError`

Implication:

- callers can use `from backend.src.tools import ToolRegistry` without paying full import cost until symbol access
- unknown attribute access fails fast with standard module-attribute error shape

## Drift Hotspots

1. Changing export names without updating `__all__` and `__getattr__` breaks import consumers.
2. Replacing lazy imports with eager imports can reintroduce startup circular-dependency issues.
3. Returning non-AttributeError for unknown names breaks expected Python module attribute semantics.

## Related Pages

- [Backend Tools Contracts Docs Hub](README.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
