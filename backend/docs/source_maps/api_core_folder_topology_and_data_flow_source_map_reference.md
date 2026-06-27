---
summary: "Deep reference for backend-maintained source topology maps in `backend/src/api/folder_structure.md` and `backend/src/core/folder_structure.md`, including authoritative layer boundaries and canonical runtime flow descriptions."
read_when:
  - When moving backend modules between API/core layers or changing ownership boundaries.
  - When validating docs/code parity for startup flow, websocket route flow, or container dependency composition.
title: "Backend API/Core Folder Topology and Data-Flow Source Map Reference"
---

# Backend API/Core Folder Topology and Data-Flow Source Map Reference

This page documents:

- `backend/src/api/folder_structure.md`
- `backend/src/core/folder_structure.md`

## Purpose and Status

These two files are source-owned topology maps (inside `backend/src`, not `docs/`) and are intended as architecture snapshots for contributors reading raw code layout.

They are descriptive references and should remain aligned with implementation-level docs in `docs/backend/*`.

## API Topology Map Contract (`backend/src/api/folder_structure.md`)

Declares API-layer boundaries and flow narrative across:

- `routes/` entrypoint layer
- `infrastructure/` handler base/registry/error helpers
- `handlers/` message-type processing layer
- `processing/` formatter+pipeline+tts layer
- `transport/` websocket safety envelope
- `contracts/` API-local message/formatter registry seam

Also defines explicit staged flows for:

- websocket lifecycle (connect -> parse/validate -> route -> handler -> formatter -> transport)
- REST memory endpoint flow
- standardized error path

Key maintenance rule:

- when API folder ownership or control flow changes, this file must be updated to avoid architecture drift for contributors who inspect source tree first

## Core Topology Map Contract (`backend/src/core/folder_structure.md`)

Declares core-layer boundaries and dependency flow across:

- bootstrap coordinator
- config loader/manager/runtime policy modules
- container composition (`ApplicationContainer`, specialized containers)
- infrastructure primitives (event bus/cache/exceptions)
- type/message/event models
- security/observability/services/interfaces

Includes flow narratives for:

- initialization phases
- config propagation/subscription lifecycle
- container dependency graph
- event/message and request-processing flows

Key maintenance rule:

- whenever core modules are moved/renamed or container responsibilities shift, topology map sections and flow diagrams must be revised in the same change set

## Cross-Doc Consistency Requirements

When either source topology file changes, keep these docs aligned:

- `docs/backend/README.md`
- `docs/backend/api/README.md`
- `docs/backend/core/README.md`
- any deep references affected by moved ownership

Consistency checks should include:

- folder names and layer labels
- data-flow step ordering
- stated responsibilities versus actual import/dispatch boundaries

## Related Docs

- [Backend Source Maps Docs Hub](README.md)
- [Backend Functionality Map](../README.md)
- [Backend Core Infrastructure Docs Hub](../core/README.md)
- [Backend API Docs Hub](../api/README.md)
