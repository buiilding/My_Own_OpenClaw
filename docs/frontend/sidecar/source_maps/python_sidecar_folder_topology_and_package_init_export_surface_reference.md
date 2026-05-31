---
summary: "Deep reference for sidecar-owned source topology map and package `__init__` export surfaces across core and tool subpackages."
read_when:
  - When updating sidecar package boundaries or contributor-facing topology docs.
  - When changing sidecar package public exports.
title: "Python Sidecar Folder Topology and Package `__init__` Export Surface Reference"
---

# Python Sidecar Folder Topology and Package `__init__` Export Surface Reference

This page documents:

- `frontend/src/main/python/folder_structure.md`
- `frontend/src/main/python/core/__init__.py`
- `frontend/src/main/python/tools/__init__.py`
- `frontend/src/main/python/tools/browser/__init__.py`
- `frontend/src/main/python/tools/computer/__init__.py`
- `frontend/src/main/python/tools/filesystem/__init__.py`
- `frontend/src/main/python/tools/system/__init__.py`

## Sidecar Topology Source Map Contract

`frontend/src/main/python/folder_structure.md` is the source-owned topology narrative for sidecar runtime boundaries.

It documents:

- three service entrypoints (`local_backend.py`, `memory_service.py`, `wakeword_service.py`)
- `core/`, `memory/`, and `tools/` package roles
- transport/protocol flow (JSON-RPC line protocol and wakeword binary framing)
- memory storage pipeline (SQLite + FAISS + remote embedding/semantic APIs)

Maintenance rule:

- if sidecar folder ownership or service flows change, update this source map in the same change set

## Sidecar Package `__init__` Surface Contract

Minimal package markers:

- `core/__init__.py`, `tools/__init__.py`, `tools/computer/__init__.py`, `tools/filesystem/__init__.py`, and `tools/system/__init__.py` are mostly package markers with short domain descriptions

The retired `tools/memory` package no longer defines a sidecar tool export; local memory is handled through sidecar JSON-RPC methods and memory runtime modules.

## Browser Package Export

`tools/browser/__init__.py` defines the public sidecar browser import surface:

- Chrome detection helpers
- Chrome launcher helpers/errors
- Browser schema argument models
- `execute_browser`

Current browser runtime execution is not exported through a first-party controller. It flows through `browser_tool.py` and the Browser Use CLI adapter in `browser_use_engine.py`.

## Refactor Safety Checklist

When moving sidecar modules:

1. update `folder_structure.md` topology narrative
2. preserve or intentionally migrate `__init__.py` exports
3. update docs under `docs/frontend/sidecar/*` that link import paths

## Related Docs

- [Frontend Sidecar Source Maps Docs Hub](README.md)
- [Frontend Sidecar Docs Hub](../README.md)
- [Frontend Sidecar Browser Docs Hub](../browser/README.md)
