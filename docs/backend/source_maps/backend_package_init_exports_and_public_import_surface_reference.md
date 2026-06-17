---
summary: "Deep reference for backend package entrypoint exports: behavior and compatibility expectations for remaining curated `backend/src/**/__init__.py` re-export surfaces."
read_when:
  - When adding/removing symbols from backend package `__init__.py` files.
  - When debugging import-path breakages after backend refactors or package moves.
title: "Backend Package `__init__` Exports and Public Import Surface Reference"
---

# Backend Package `__init__` Exports and Public Import Surface Reference

This page documents backend package entrypoint surfaces that still publish
curated import contracts. Empty marker-only `__init__.py` files are not kept;
namespace packages are used for package directories whose callers import
concrete modules directly.

- `backend/src/agent/session/__init__.py`
- `backend/src/agent/tools/preparation/__init__.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/__init__.py`
- `backend/src/agent/tools/preparation/helpers/__init__.py`
- `backend/src/agent/tools/preparation/ocr/__init__.py`
- `backend/src/agent/tools/preparation/screenshot/__init__.py`
- `backend/src/agent/tools/preparation/storage/__init__.py`
- `backend/src/agent/tools/preparation/types/__init__.py`
- `backend/src/agent/tools/processing/__init__.py`
- `backend/src/agent/tools/sending/__init__.py`
- `backend/src/agent/tools/waiting/__init__.py`
- `backend/src/agent/tools/waiting/storage/__init__.py`
- `backend/src/api/handlers/__init__.py`
- `backend/src/api/infrastructure/__init__.py`
- `backend/src/api/processing/__init__.py`
- `backend/src/api/processing/formatters/__init__.py`
- `backend/src/api/processing/tts/__init__.py`
- `backend/src/api/routes/memory/__init__.py`
- `backend/src/api/transport/__init__.py`
- `backend/src/core/bootstrap/__init__.py`
- `backend/src/core/config/__init__.py`
- `backend/src/core/container/__init__.py`
- `backend/src/core/events/__init__.py`
- `backend/src/core/infrastructure/__init__.py`
- `backend/src/core/interfaces/__init__.py`
- `backend/src/core/observability/__init__.py`
- `backend/src/core/security/__init__.py`
- `backend/src/core/services/__init__.py`
- `backend/src/core/validation/__init__.py`
- `backend/src/embeddings/__init__.py`
- `backend/src/llm/__init__.py`
- `backend/src/llm/models/__init__.py`
- `backend/src/llm/prompts/__init__.py`
- `backend/src/sdk/__init__.py`
- `backend/src/services/ocr/__init__.py`
- `backend/src/services/vision/__init__.py`

## Import-Surface Contract

`__init__.py` modules in backend serve two roles:

- curated import surface (`from ... import ...`, `__all__`) for stable consumer paths

Compatibility implication:

- changing symbol exports in these files can break upstream imports even when implementation modules remain unchanged

## High-Value Export Aggregators

Major aggregator files:

- `backend/src/api/handlers/__init__.py`: handler base + concrete websocket handlers
- `backend/src/api/transport/__init__.py`: protocol/sender/envelope/safe-websocket surface
- `backend/src/api/processing/formatters/__init__.py`: formatter package
  exports for all websocket event formatter classes, covered by
  `tests/backend/test_formatter_package_exports.py`
- `backend/src/core/config/__init__.py`: runtime config models + loader/manager/runtime policy exports
- `backend/src/core/infrastructure/__init__.py`: bus/cache/exceptions umbrella surface
- `backend/src/core/events/__init__.py`: base + bus + streaming event model exports
- `backend/src/services/vision/__init__.py`: provider/types/coordinate utility exports

## Minimal/Marker Entrypoints

Marker-only files are intentionally absent for package directories whose
callers import concrete modules directly, including `backend.src.agent`,
`backend.src.api.services`, `backend.src.core`, `backend.src.tools`, and their
non-exporting subpackages. Do not add a package `__init__.py` only for a
docstring or compatibility path.

- `backend/src/api/routes/sdk/__init__.py` is a route-registration seam and
  exports only the package router; SDK route handlers, models, and service
  helpers live in `router.py`, `models.py`, and `service.py`

Remaining `__init__.py` files matter only when they publish a live import
contract or route-registration surface.

## `__all__` Governance

Where present, `__all__` is treated as the canonical public symbol list.

Change policy:

- adding exports is additive and usually safe
- removing/renaming exports is a compatibility break and should be accompanied by docs/changelog notes and import-path migration guidance

## Refactor Safety Checklist

When moving a class/function between modules:

1. prefer direct imports from the owning module
2. update package `__init__.py` exports only when that package still has a
   live public import contract
3. keep `__all__` synchronized with actual imports where a package export
   remains
4. run tests that import package-level symbols
5. update docs that reference package-level import paths

## Related Docs

- [Backend Source Maps Docs Hub](README.md)
- [Backend API/Core Folder Topology and Data-Flow Source Map Reference](api_core_folder_topology_and_data_flow_source_map_reference.md)
- [Backend Functionality Map](../README.md)
