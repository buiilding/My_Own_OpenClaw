---
summary: "Deep reference for sidecar-owned source topology map and remaining package `__init__` export surfaces."
read_when:
  - When updating sidecar package boundaries or contributor-facing topology docs.
  - When changing sidecar package public exports.
title: "Python Sidecar Folder Topology and Package `__init__` Export Surface Reference"
---

# Python Sidecar Folder Topology and Package `__init__` Export Surface Reference

This page documents:

- `frontend/src/main/python/folder_structure.md`
- `frontend/src/main/python/core/__init__.py`

## Sidecar Topology Source Map Contract

`frontend/src/main/python/folder_structure.md` is the source-owned topology narrative for sidecar runtime boundaries.

It documents:

- two sidecar service entrypoints (`local_backend.py`, `wakeword_service.py`)
- `core/`, `memory/`, and `tools/` package roles
- transport/protocol flow (JSON-RPC line protocol and wakeword binary framing)
- memory storage pipeline (SQLite + FAISS + SDK-provided embeddings and backend semantic APIs)

Maintenance rule:

- if sidecar folder ownership or service flows change, update this source map in the same change set

## Sidecar Package `__init__` Surface Contract

`core/__init__.py` remains an export surface for the SDK client and semantic
client helpers used by tests and local backend wiring.

Marker-only files are intentionally absent for `tools/`, tool category
subpackages, and `windie_shared/`. Import tool and shared browser-contract
runtime code from concrete modules such as `tools.system.shell_tool`,
`tools.browser.browser_tool`, and `windie_shared.browser_contract`.

The retired `tools/memory` package no longer defines a sidecar tool export;
local memory is handled through sidecar JSON-RPC methods and memory runtime
modules.

## Refactor Safety Checklist

When moving sidecar modules:

1. update `folder_structure.md` topology narrative
2. preserve or intentionally migrate live `__init__.py` exports
3. update docs under `docs/frontend/sidecar/*` that link import paths

## Related Docs

- [Frontend Sidecar Source Maps Docs Hub](README.md)
- [Frontend Sidecar Docs Hub](../README.md)
- [Frontend Sidecar Browser Docs Hub](../browser/README.md)
