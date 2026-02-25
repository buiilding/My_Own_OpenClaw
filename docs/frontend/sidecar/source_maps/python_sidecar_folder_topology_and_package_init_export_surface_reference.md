---
summary: "Deep reference for sidecar-owned source topology map and package entrypoint contracts: folder-level runtime flows from `folder_structure.md` and import/export behavior across sidecar `__init__.py` modules (core/tools/browser-use)."
read_when:
  - When updating sidecar package boundaries or contributor-facing topology docs.
  - When changing browser-use lazy/optional import exports and tool-package public surfaces.
title: "Python Sidecar Folder Topology and Package `__init__` Export Surface Reference"
---

# Python Sidecar Folder Topology and Package `__init__` Export Surface Reference

This page documents:

- `frontend/src/main/python/folder_structure.md`
- `frontend/src/main/python/core/__init__.py`
- `frontend/src/main/python/tools/__init__.py`
- `frontend/src/main/python/tools/browser/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/actor/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/filesystem/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/google/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/mistral/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/tokens/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/tools/extraction/__init__.py`
- `frontend/src/main/python/tools/computer/__init__.py`
- `frontend/src/main/python/tools/filesystem/__init__.py`
- `frontend/src/main/python/tools/memory/__init__.py`
- `frontend/src/main/python/tools/system/__init__.py`

## Sidecar Topology Source Map Contract

`frontend/src/main/python/folder_structure.md` is the source-owned topology narrative for sidecar runtime boundaries.

It documents:

- three service entrypoints (`local_backend.py`, `memory_service.py`, `wakeword_service.py`)
- `core/`, `memory/`, and `tools/` package roles
- transport/protocol flow (JSON-RPC line protocol and wakeword binary framing)
- memory storage pipeline (SQLite + FAISS + remote embedding/semantic APIs)

Maintenance rule:

- if sidecar folder ownership or service flows change, this source map should be updated in the same change set

## Sidecar Package `__init__` Surface Contract

Minimal package markers:

- `core/__init__.py`, `tools/__init__.py`, `tools/computer/__init__.py`, `tools/filesystem/__init__.py`, `tools/system/__init__.py` are mostly package markers with short domain descriptions

Explicit tool export:

- `tools/memory/__init__.py` exports `MemoryTool` through `__all__`

## Browser Package Export and Optional-Dependency Behavior

`tools/browser/__init__.py` defines the main public sidecar browser import surface:

- always-available exports:
  - Chrome detection helpers
  - Chrome launcher helpers/errors
  - Browser schema argument models
- optional exports guarded by `try/except ImportError`:
  - `BrowserController`, `get_browser_controller`, `execute_browser`

Compatibility implication:

- consumers importing browser control functions must handle optional `None` symbols when Playwright is unavailable

## Browser Use Subpackage Entry Contracts

- `browser_use/actor/__init__.py` exports `Page`, `Element`, `Mouse`, `Utils`
- `browser_use/tools/extraction/__init__.py` exports extraction schema+result helpers
- `browser_use/llm/google/__init__.py` and `browser_use/llm/mistral/__init__.py` export provider adapter classes
- `browser_use/filesystem/__init__.py` and `browser_use/tokens/__init__.py` are marker entrypoints

`browser_use/llm/__init__.py` has stronger behavior:

- exports message types and `BaseChatModel`
- lazy-loads provider chat classes via `_LAZY_IMPORTS`
- resolves model instance aliases on-demand via `browser_use.llm.models.__getattr__`
- caches model instances in `_model_cache`

This file is a compatibility/ergonomics boundary and should remain stable for downstream imports.

## Refactor Safety Checklist

When moving sidecar modules:

1. update `folder_structure.md` topology narrative
2. preserve or intentionally migrate `__init__.py` exports
3. keep optional dependency guards for browser runtime imports
4. update docs under `docs/frontend/sidecar/*` that link import paths

## Related Docs

- [Frontend Sidecar Source Maps Docs Hub](README.md)
- [Frontend Sidecar Docs Hub](../README.md)
- [Frontend Sidecar Browser Docs Hub](../browser/README.md)
- [Frontend Sidecar Browser Use Runtime Docs Hub](../browser/browser_use/README.md)
