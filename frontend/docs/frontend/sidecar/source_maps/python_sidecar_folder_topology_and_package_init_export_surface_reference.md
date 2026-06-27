---
summary: "Deep reference for the local-runtime Python implementation source topology map and remaining package `__init__` export surfaces."
read_when:
  - When updating local-runtime Python package boundaries or contributor-facing topology docs.
  - When changing local-runtime Python package public exports.
title: "Local-Runtime Python Folder Topology and Package `__init__` Export Surface Reference"
---

# Local-Runtime Python Folder Topology and Package `__init__` Export Surface Reference

This page documents:

- `frontend/src/main/python/folder_structure.md`
- remaining concrete local-runtime Python package entrypoints

## Local-Runtime Python Topology Source Map Contract

`frontend/src/main/python/folder_structure.md` is the source-owned topology
narrative for the Python local-runtime implementation boundaries.

It documents:

- two local-runtime Python service entrypoints (`local_backend.py`, `wakeword_service.py`)
- `core/`, `memory/`, and `tools/` package roles
- transport/protocol flow (JSON-RPC line protocol and wakeword binary framing)
- memory storage pipeline (SQLite + FAISS + SDK-provided embeddings and backend semantic APIs)

Maintenance rule:

- if local-runtime Python folder ownership or service flows change, update this source map in the same change set

## Local-Runtime Python Package `__init__` Surface Contract

`core/__init__.py` and `core/platform/__init__.py` are intentionally absent.
Import core helpers from concrete modules such as `core.remote_semantic_client`
and `core.platform.window_manager`, and import the hosted Python SDK from the
public `windie` package.

Marker-only files are intentionally absent for `tools/`, tool category
subpackages, `core/`, and `windie_shared/`. Import tool and shared
browser-contract runtime code from concrete modules such as
`tools.system.shell_tool`, `tools.browser.browser_tool`, and
`windie_shared.browser_contract`.

The retired `tools/memory` package no longer defines a local-runtime Python tool export;
local memory is handled through local-runtime JSON-RPC methods and memory
runtime modules.

Local-runtime Python implementation and shared modules should not publish
`__all__` wildcard export lists. Direct imports from owner modules keep package
boundaries visible. The current exception is
`frontend/src/main/python/windie/__init__.py`, which is the public Python SDK
entrypoint for external callers.

## Refactor Safety Checklist

When moving local-runtime Python modules:

1. update `folder_structure.md` topology narrative
2. preserve or intentionally migrate live `__init__.py` exports
3. update docs under `docs/frontend/sidecar/*` that link import paths

## Related Docs

- [Local-Runtime Source Maps Docs Hub](README.md)
- [Local Runtime Python Implementation Docs Hub](../README.md)
- [Local-Runtime Browser Docs Hub](../browser/README.md)
