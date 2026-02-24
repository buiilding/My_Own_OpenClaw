---
summary: "Backend core-infrastructure docs sub-hub for EventBus internals, cache primitives, and cross-cutting core runtime behavior."
read_when:
  - When changing `backend/src/core/infrastructure/*` or wiring new cross-cutting backend runtime primitives.
  - When debugging event dispatch ordering, handler-lifecycle leaks, or cache behavior under concurrent load.
title: "Backend Core Infrastructure Docs Hub"
---

# Backend Core Infrastructure Docs Hub

## Deep Pages

- [Event Bus and Cache Infrastructure Reference](EVENT_BUS_AND_CACHE_INFRASTRUCTURE_REFERENCE.md)

## Code Scope

- `backend/src/core/infrastructure/*`
- `backend/src/core/events/*`
- `backend/src/core/config/service.py`
- `backend/src/core/config/subscriptions.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/embeddings/embeddings.py`

