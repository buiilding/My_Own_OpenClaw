---
summary: "Backend core-infrastructure docs sub-hub for EventBus internals, cache primitives, and cross-cutting core runtime behavior."
read_when:
  - When changing `backend/src/core/infrastructure/*` or wiring new cross-cutting backend runtime primitives.
  - When debugging event dispatch ordering, handler-lifecycle leaks, or cache behavior under concurrent load.
title: "Backend Core Infrastructure Docs Hub"
---

# Backend Core Infrastructure Docs Hub

## Deep Pages

- [Event Bus and Cache Infrastructure Reference](event_bus_and_cache_infrastructure_reference.md)
- [Core Observability Docs Hub](observability/README.md)
- [Trust-Boundary Metrics and Enforcement Reference](observability/trust_boundary_metrics_and_enforcement_reference.md)

## Code Scope

- `backend/src/core/infrastructure/*`
- `backend/src/core/events/*`
- `backend/src/core/observability/*`
- `backend/src/core/config/service.py`
- `backend/src/core/config/subscriptions.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/embeddings/embeddings.py`
